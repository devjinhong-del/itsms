"use server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";
const AUDIT_PHOTOS_BUCKET = "audit-photos";

export interface AssetLookupResult {
  assetNo: string;
  modelCode: string | null;
  assetUserOrg: string | null;
  assetUserName: string | null;
  alreadyInspected: boolean;
}

// m365_users에서 이름으로 조직을 찾는 공용 로직 — 부서 우선순위: team → office → division → department_raw.
async function lookupOrgByUserName(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userName: string,
): Promise<string | null> {
  const { data: m365 } = await admin
    .from("m365_users")
    .select("team, office, division, department_raw")
    .eq("name", userName)
    .eq("expired_at", NO_EXPIRY)
    .limit(1)
    .maybeSingle();

  return m365?.team ?? m365?.office ?? m365?.division ?? m365?.department_raw ?? null;
}

// Design Ref: DESIGN.md — krs_rental_equipment/m365_users는 RLS로 잠겨있어 일반 로그인 사용자는
// 직접 조회할 수 없다. 그래서 이 서버 액션(관리자 서버 코드)이 대신 조회해서 필요한 값만 돌려준다.
export async function lookupAsset(rawAssetNo: string): Promise<AssetLookupResult | null> {
  const assetNo = rawAssetNo.trim();
  if (!assetNo) return null;

  const admin = getSupabaseAdmin();

  const { data: equipment } = await admin
    .from("krs_rental_equipment")
    .select("asset_no, model_code, user_name")
    .eq("asset_no", assetNo)
    .eq("valid_to", NO_EXPIRY)
    .maybeSingle();

  if (!equipment) return null;

  // 이미 실사된(제출된) 기록이 있으면, KRS/M365 원본이 아니라 "가장 최근에 확인된 값"을 우선 보여준다.
  const { data: existingAudit } = await admin
    .from("audit_oa")
    .select("asset_user_org, asset_user_name")
    .eq("asset_no", assetNo)
    .eq("expired_at", NO_EXPIRY)
    .maybeSingle();

  if (existingAudit) {
    return {
      assetNo: equipment.asset_no,
      modelCode: equipment.model_code,
      assetUserOrg: existingAudit.asset_user_org,
      assetUserName: existingAudit.asset_user_name,
      alreadyInspected: true,
    };
  }

  const assetUserName = equipment.user_name;
  const assetUserOrg = assetUserName ? await lookupOrgByUserName(admin, assetUserName) : null;

  return {
    assetNo: equipment.asset_no,
    modelCode: equipment.model_code,
    assetUserOrg,
    assetUserName,
    alreadyInspected: false,
  };
}

// 실사자가 사용자 이름을 직접 수정했을 때, 그 이름으로 조직을 다시 찾아준다.
// m365_users에 없는 이름이면 null을 돌려주고, 호출한 쪽(ScanClient)에서 조직 칸을 비운다.
export async function lookupUserOrgByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const admin = getSupabaseAdmin();
  return lookupOrgByUserName(admin, trimmed);
}

export interface SubmitAuditInput {
  assetNo: string;
  assetUserOrg: string;
  assetUserName: string;
  isEdited: boolean;
  // 바코드 매칭 순간 얼려둔 화면을 JPEG data URL("data:image/jpeg;base64,...")로 인코딩해 전달한다.
  photoDataUrl?: string | null;
}

// data URL을 Storage 업로드용 Buffer로 바꾼다. 실패해도(형식이 이상해도) 제출 자체는 막지 않도록
// null을 돌려주고, 호출한 쪽에서 사진 없이 진행하게 한다.
function decodePhotoDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { contentType: match[1], buffer: Buffer.from(match[2], "base64") };
}

export async function submitAudit(input: SubmitAuditInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, department")
    .eq("id", user.id)
    .single();

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Plan SC: 자산번호당 "현재 유효한" 실사 결과는 1건만 유지한다 — 기존 행이 있으면 먼저 만료시킨다.
  const { data: existing } = await admin
    .from("audit_oa")
    .select("id")
    .eq("asset_no", input.assetNo)
    .eq("expired_at", NO_EXPIRY)
    .maybeSingle();

  if (existing) {
    const { error: expireError } = await admin
      .from("audit_oa")
      .update({ expired_at: now })
      .eq("id", existing.id);
    if (expireError) return { ok: false, error: expireError.message };
  }

  // 사진 업로드는 실패해도 실사 제출 자체를 막지 않는다(관리자 페이지에서 사진이 비어 보일 뿐).
  let photoPath: string | null = null;
  if (input.photoDataUrl) {
    const decoded = decodePhotoDataUrl(input.photoDataUrl);
    if (decoded) {
      const ext = decoded.contentType.split("/")[1] ?? "jpg";
      const path = `${input.assetNo}/${Date.now()}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from(AUDIT_PHOTOS_BUCKET)
        .upload(path, decoded.buffer, { contentType: decoded.contentType, upsert: false });

      if (uploadError) {
        console.error("실사 사진 업로드 실패:", uploadError.message);
      } else {
        photoPath = path;
      }
    }
  }

  const { error: insertError } = await admin.from("audit_oa").insert({
    asset_no: input.assetNo,
    asset_user_org: input.assetUserOrg || null,
    asset_user_name: input.assetUserName || null,
    inspector_org: profile?.department ?? null,
    inspector_name: profile?.name ?? user.email,
    inspector_user_id: user.id,
    is_edited: input.isEdited,
    photo_url: photoPath,
  });

  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true };
}

export interface MyAuditRow {
  assetNo: string;
  modelCode: string | null;
  productCategory: string | null;
  assetUserOrg: string | null;
  assetUserName: string | null;
}

// 로그인한 본인이 실사한 장비 목록. 자산 자체의 속성(모델코드/제품카테고리)은 audit_oa에 중복 저장하지
// 않고, krs_rental_equipment의 현재 값을 그때그때 같이 조회해서 보여준다.
export async function listMyAudits(): Promise<MyAuditRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = getSupabaseAdmin();

  const { data: audits } = await admin
    .from("audit_oa")
    .select("asset_no, asset_user_org, asset_user_name")
    .eq("inspector_user_id", user.id)
    .eq("expired_at", NO_EXPIRY)
    .order("created_at", { ascending: false });

  if (!audits || audits.length === 0) return [];

  const assetNos = [...new Set(audits.map((a) => a.asset_no))];
  const { data: equipment } = await admin
    .from("krs_rental_equipment")
    .select("asset_no, model_code, prdct_name")
    .in("asset_no", assetNos)
    .eq("valid_to", NO_EXPIRY);

  const equipmentByAssetNo = new Map((equipment ?? []).map((e) => [e.asset_no, e]));

  return audits.map((a) => {
    const eq = equipmentByAssetNo.get(a.asset_no);
    return {
      assetNo: a.asset_no,
      modelCode: eq?.model_code ?? null,
      productCategory: eq?.prdct_name ?? null,
      assetUserOrg: a.asset_user_org,
      assetUserName: a.asset_user_name,
    };
  });
}
