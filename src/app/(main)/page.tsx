import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { SectionCard, StatTile, Table, EmptyRow, Badge } from "@/components/dashboard";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";

interface Equipment {
  asset_no: string;
  prdct_name: string | null;
  model_name: string | null;
  manuf_name: string | null;
  dept_name: string | null;
  user_name: string | null;
  bsn_man_name: string | null;
  rental_fee: string | null;
  dlivy_date: string | null;
  return_prnmnt_date: string | null;
}

// 내 정보(이름) 기준으로 KRS 장비/M365 라이선스/실사 이력을 모아온다.
// krs_rental_equipment·m365_users는 RLS로 잠겨 있어 서버(service_role)에서만 조회한다.
async function loadMyData(name: string | null, email: string | undefined) {
  const admin = getSupabaseAdmin();

  const [equipmentRes, managedRes, licenseRes] = await Promise.all([
    admin
      .from("krs_rental_equipment")
      .select("asset_no, prdct_name, model_name, manuf_name, dept_name, user_name, bsn_man_name, rental_fee, dlivy_date, return_prnmnt_date")
      .eq("valid_to", NO_EXPIRY)
      .eq("user_name", name ?? "__없음__"),
    admin
      .from("krs_rental_equipment")
      .select("asset_no, prdct_name, model_name, manuf_name, dept_name, user_name, bsn_man_name, rental_fee, dlivy_date, return_prnmnt_date")
      .eq("valid_to", NO_EXPIRY)
      .eq("bsn_man_name", name ?? "__없음__"),
    admin
      .from("m365_users")
      .select("license, team, office, division, department_raw")
      .eq("expired_at", NO_EXPIRY)
      .eq("account", email ?? "__없음__"),
  ]);

  const equipment = (equipmentRes.data ?? []) as Equipment[];
  const managed = (managedRes.data ?? []) as Equipment[];
  const licenses = licenseRes.data ?? [];

  const assetNos = equipment.map((e) => e.asset_no);
  const { data: audits } = assetNos.length
    ? await admin
        .from("audit_oa")
        .select("asset_no, asset_user_name, inspector_name, created_at")
        .eq("expired_at", NO_EXPIRY)
        .in("asset_no", assetNos)
    : { data: [] };

  const auditByAsset = new Map((audits ?? []).map((a) => [a.asset_no, a]));
  const org =
    licenses[0]?.team ?? licenses[0]?.office ?? licenses[0]?.division ?? licenses[0]?.department_raw ?? equipment[0]?.dept_name ?? null;

  return { equipment, managed, licenses, auditByAsset, org };
}

function formatFee(fee: string | null) {
  const value = Number(fee);
  return Number.isFinite(value) ? value.toLocaleString() : "-";
}

export default async function PersonalAssetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("name, email, role").eq("id", user.id).single();
  const { equipment, managed, licenses, auditByAsset, org } = await loadMyData(profile?.name ?? null, user.email);

  const monthlyFee = equipment.reduce((sum, e) => sum + (Number(e.rental_fee) || 0), 0);
  const auditedCount = equipment.filter((e) => auditByAsset.has(e.asset_no)).length;

  return (
    <div className="flex flex-col gap-5">
      {/* 프로필 카드 */}
      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#1d428a] text-xl font-bold text-white">
          {(profile?.name ?? "?").slice(0, 1)}
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">{profile?.name ?? "이름 미등록"}</h2>
            {profile?.role === "admin" && <Badge tone="ok">관리자</Badge>}
          </div>
          <p className="mt-1 text-sm text-gray-500">{org ?? "소속 정보 없음"}</p>
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>

        <dl className="grid grid-cols-3 gap-4 text-center sm:w-72">
          <div>
            <dt className="text-xs text-gray-500">사용 장비</dt>
            <dd className="text-lg font-bold tabular-nums text-gray-900">{equipment.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">담당 장비</dt>
            <dd className="text-lg font-bold tabular-nums text-gray-900">{managed.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">라이선스</dt>
            <dd className="text-lg font-bold tabular-nums text-gray-900">{licenses.length}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="내 장비 월 렌탈료" value={monthlyFee.toLocaleString()} unit="원" sub="사용 중인 장비 기준" tone="brand" />
        <StatTile
          label="실사 완료"
          value={`${auditedCount} / ${equipment.length}`}
          sub={equipment.length ? `${Math.round((auditedCount / equipment.length) * 100)}% 완료` : "대상 장비 없음"}
          tone={equipment.length && auditedCount === equipment.length ? "default" : "warn"}
        />
        <StatTile label="담당 시스템" value={0} unit="건" sub="시스템 담당자 정보 연동 예정" />
      </div>

      <SectionCard title="내가 사용 중인 OA 장비" description="KRS 렌탈 자산 기준 · 실사 여부 포함">
        <Table head={["자산번호", "종류", "모델", "제조사", "월 렌탈료", "납품일", "실사"]}>
          {equipment.map((item) => {
            const audit = auditByAsset.get(item.asset_no);
            return (
              <tr key={item.asset_no} className="border-t border-gray-100">
                <td className="px-3 py-2.5 font-medium">{item.asset_no}</td>
                <td className="px-3 py-2.5">{item.prdct_name ?? "-"}</td>
                <td className="px-3 py-2.5 text-gray-600">{item.model_name ?? "-"}</td>
                <td className="px-3 py-2.5 text-gray-600">{item.manuf_name ?? "-"}</td>
                <td className="px-3 py-2.5 tabular-nums">{formatFee(item.rental_fee)}원</td>
                <td className="px-3 py-2.5 text-gray-500">{item.dlivy_date ?? "-"}</td>
                <td className="px-3 py-2.5">
                  {audit ? (
                    <Badge tone="ok">완료 · {new Date(audit.created_at).toLocaleDateString("ko-KR")}</Badge>
                  ) : (
                    <Badge tone="warn">미실사</Badge>
                  )}
                </td>
              </tr>
            );
          })}
          {equipment.length === 0 && <EmptyRow colSpan={7} text="사용 중으로 등록된 장비가 없습니다." />}
        </Table>
      </SectionCard>

      {managed.length > 0 && (
        <SectionCard title="내가 담당자로 등록된 장비" description="KRS 담당자(bsn_man_name) 기준">
          <Table head={["자산번호", "종류", "사용자", "부서", "월 렌탈료"]}>
            {managed.map((item) => (
              <tr key={item.asset_no} className="border-t border-gray-100">
                <td className="px-3 py-2.5 font-medium">{item.asset_no}</td>
                <td className="px-3 py-2.5">{item.prdct_name ?? "-"}</td>
                <td className="px-3 py-2.5">{item.user_name ?? "-"}</td>
                <td className="px-3 py-2.5 text-gray-600">{item.dept_name ?? "-"}</td>
                <td className="px-3 py-2.5 tabular-nums">{formatFee(item.rental_fee)}원</td>
              </tr>
            ))}
          </Table>
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="사용 중인 라이선스" description="Microsoft 365 할당 기준">
          <ul className="flex flex-col gap-2">
            {licenses.map((license) => (
              <li
                key={license.license}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
              >
                <span className="font-medium text-gray-800">{license.license}</span>
                <Badge tone="muted">할당됨</Badge>
              </li>
            ))}
            {licenses.length === 0 && <li className="py-6 text-center text-xs text-gray-400">할당된 라이선스가 없습니다.</li>}
          </ul>
        </SectionCard>

        <SectionCard title="담당 중인 시스템" description="추후 시스템 담당자 정보가 연동되면 여기에 표시됩니다">
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="text-3xl">🗂️</span>
            <p className="text-xs text-gray-400">아직 등록된 담당 시스템이 없습니다.</p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
