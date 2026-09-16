import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";
import { fetchAllRows } from "@/lib/db/fetchAll";
import { splitIntoChunks } from "./chunk";
import { embedTexts } from "./openai";
import { formatKstDateTime } from "@/lib/date";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";
const EMBED_BATCH = 64; // 한 번에 임베딩할 조각 수

export interface IngestInput {
  title: string;
  text: string;
  sourceType: "file" | "database";
  sourceKey?: string | null; // DB 출처면 표 이름 — 같은 키로 다시 넣으면 기존 것을 갈아끼운다
  fileSize?: number | null;
  uploadedBy?: string | null;
}

// 글 한 덩어리를 조각내서 임베딩까지 마친 뒤 저장한다.
export async function ingestText(input: IngestInput) {
  const admin = getSupabaseAdmin();
  const chunks = splitIntoChunks(input.text);

  if (chunks.length === 0) {
    throw new Error("문서에서 읽어낼 수 있는 글자가 없습니다. (스캔한 이미지 PDF일 수 있습니다)");
  }

  // 같은 출처를 다시 학습시키면 이전 내용은 지우고 새로 넣는다(중복 답변 방지).
  if (input.sourceKey) {
    await admin.from("rag_documents").delete().eq("source_key", input.sourceKey);
  }

  const { data: document, error: docError } = await admin
    .from("rag_documents")
    .insert({
      title: input.title,
      source_type: input.sourceType,
      source_key: input.sourceKey ?? null,
      file_size: input.fileSize ?? null,
      chunk_count: chunks.length,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select("id")
    .single();

  if (docError || !document) {
    throw new Error(`문서 저장 실패: ${docError?.message ?? "알 수 없는 오류"}`);
  }

  for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
    const batch = chunks.slice(start, start + EMBED_BATCH);
    const embeddings = await embedTexts(batch);

    const { error: chunkError } = await admin.from("rag_chunks").insert(
      batch.map((content, index) => ({
        document_id: document.id,
        chunk_index: start + index,
        content,
        embedding: embeddings[index] as unknown as string,
      })),
    );

    if (chunkError) {
      // 반쯤 들어간 상태로 남기지 않는다
      await admin.from("rag_documents").delete().eq("id", document.id);
      throw new Error(`조각 저장 실패: ${chunkError.message}`);
    }
  }

  return { documentId: document.id as number, chunkCount: chunks.length };
}

// ── 사내 DB를 글로 바꾸는 부분 ───────────────────────────────────────────────
// 표를 그대로 넣으면 검색이 잘 안 되므로, 사람이 읽는 문장 형태로 바꿔서 학습시킨다.

interface Equipment {
  asset_no: string;
  prdct_name: string | null;
  model_name: string | null;
  manuf_name: string | null;
  dept_name: string | null;
  user_name: string | null;
  rental_fee: string | null;
  dlivy_date: string | null;
  return_prnmnt_date: string | null;
  cntrct_status: string | null;
}

interface M365User {
  account: string;
  name: string | null;
  license: string | null;
  team: string | null;
  office: string | null;
  division: string | null;
  department_raw: string | null;
}

interface LicenseTotal {
  sku_part_number: string | null;
  total_units: number | null;
  assigned_units: number | null;
  remaining_units: number | null;
}

interface Audit {
  asset_no: string;
  asset_user_org: string | null;
  asset_user_name: string | null;
  inspector_name: string | null;
  is_edited: boolean;
  created_at: string;
}

function orgOf(row: M365User) {
  return row.team ?? row.office ?? row.division ?? row.department_raw ?? "(조직 미지정)";
}

export async function ingestDatabase(uploadedBy: string | null) {
  const admin = getSupabaseAdmin();

  const [equipment, m365, licenses, audits] = await Promise.all([
    fetchAllRows<Equipment>(() =>
      admin
        .from("krs_rental_equipment")
        .select(
          "asset_no, prdct_name, model_name, manuf_name, dept_name, user_name, rental_fee, dlivy_date, return_prnmnt_date, cntrct_status",
        )
        .eq("valid_to", NO_EXPIRY),
    ),
    fetchAllRows<M365User>(() =>
      admin
        .from("m365_users")
        .select("account, name, license, team, office, division, department_raw")
        .eq("expired_at", NO_EXPIRY),
    ),
    fetchAllRows<LicenseTotal>(() =>
      admin
        .from("m365_license_total")
        .select("sku_part_number, total_units, assigned_units, remaining_units")
        .eq("expired_at", NO_EXPIRY),
    ),
    fetchAllRows<Audit>(() =>
      admin
        .from("audit_oa")
        .select("asset_no, asset_user_org, asset_user_name, inspector_name, is_edited, created_at")
        .eq("expired_at", NO_EXPIRY),
    ),
  ]);

  const results: { title: string; chunkCount: number }[] = [];

  // 1) OA 자산 — 한 대당 한 문장
  const assetLines = equipment.map((row) => {
    const fee = Number(row.rental_fee) || 0;
    return [
      `자산번호 ${row.asset_no}`,
      `종류 ${row.prdct_name ?? "미분류"}`,
      `모델 ${row.model_name ?? "-"}`,
      `제조사 ${row.manuf_name ?? "-"}`,
      `사용부서 ${row.dept_name ?? "-"}`,
      `사용자 ${row.user_name ?? "-"}`,
      `월 렌탈료 ${fee.toLocaleString()}원`,
      `사용 시작일 ${row.dlivy_date ?? "-"}`,
      `반납예정일 ${row.return_prnmnt_date ?? "-"}`,
      `계약상태 ${row.cntrct_status ?? "-"}`,
    ].join(" · ");
  });

  const totalFee = equipment.reduce((sum, row) => sum + (Number(row.rental_fee) || 0), 0);
  const byCategory = new Map<string, number>();
  const byDept = new Map<string, { count: number; fee: number }>();
  for (const row of equipment) {
    const category = row.prdct_name ?? "미분류";
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    const dept = row.dept_name ?? "(부서 미지정)";
    const entry = byDept.get(dept) ?? { count: 0, fee: 0 };
    entry.count += 1;
    entry.fee += Number(row.rental_fee) || 0;
    byDept.set(dept, entry);
  }

  const assetSummary = [
    "[OA 자산 요약]",
    `전체 자산 ${equipment.length.toLocaleString()}대, 월 렌탈료 합계 ${totalFee.toLocaleString()}원(연 ${(totalFee * 12).toLocaleString()}원).`,
    `종류별 대수: ${[...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}대`)
      .join(", ")}.`,
    `부서별 보유 상위: ${[...byDept.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([k, v]) => `${k} ${v.count}대(월 ${v.fee.toLocaleString()}원)`)
      .join(", ")}.`,
  ].join("\n");

  const assetResult = await ingestText({
    title: "사내 DB · OA 렌탈 자산 목록",
    sourceType: "database",
    sourceKey: "krs_rental_equipment",
    uploadedBy,
    text: `${assetSummary}\n\n${assetLines.join("\n")}`,
  });
  results.push({ title: "사내 DB · OA 렌탈 자산 목록", chunkCount: assetResult.chunkCount });

  // 2) M365 사용자 — 계정 하나당 한 문장(라이선스는 묶어서)
  const byAccount = new Map<string, { name: string; org: string; licenses: string[] }>();
  for (const row of m365) {
    const entry = byAccount.get(row.account) ?? { name: row.name ?? "", org: orgOf(row), licenses: [] };
    if (row.license) entry.licenses.push(row.license);
    if (!entry.name && row.name) entry.name = row.name;
    byAccount.set(row.account, entry);
  }

  const userLines = [...byAccount.entries()].map(
    ([account, v]) =>
      `이름 ${v.name || "-"} · 계정 ${account} · 소속 ${v.org} · 보유 라이선스 ${
        v.licenses.length ? v.licenses.join(", ") : "없음"
      }`,
  );

  const orgHeadcount = new Map<string, number>();
  for (const [, v] of byAccount) orgHeadcount.set(v.org, (orgHeadcount.get(v.org) ?? 0) + 1);

  const userSummary = [
    "[Microsoft 365 사용자 요약]",
    `전체 계정 ${byAccount.size.toLocaleString()}개, 조직 ${orgHeadcount.size}개.`,
    `조직별 인원 상위: ${[...orgHeadcount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([k, v]) => `${k} ${v}명`)
      .join(", ")}.`,
  ].join("\n");

  const userResult = await ingestText({
    title: "사내 DB · Microsoft 365 사용자와 라이선스",
    sourceType: "database",
    sourceKey: "m365_users",
    uploadedBy,
    text: `${userSummary}\n\n${userLines.join("\n")}`,
  });
  results.push({ title: "사내 DB · Microsoft 365 사용자와 라이선스", chunkCount: userResult.chunkCount });

  // 3) 라이선스 구독 수량
  const licenseLines = licenses.map((row) => {
    const total = row.total_units ?? 0;
    const used = row.assigned_units ?? 0;
    const percent = total ? Math.round((used / total) * 100) : 0;
    return `라이선스 ${row.sku_part_number ?? "-"} · 총 구독 ${total.toLocaleString()}개 · 할당 ${used.toLocaleString()}개 · 잔여 ${(
      row.remaining_units ?? 0
    ).toLocaleString()}개 · 사용률 ${percent}%`;
  });

  const licenseResult = await ingestText({
    title: "사내 DB · Microsoft 365 라이선스 구독 수량",
    sourceType: "database",
    sourceKey: "m365_license_total",
    uploadedBy,
    text: `[Microsoft 365 라이선스 구독 수량]\n총 ${licenses.length}종.\n\n${licenseLines.join("\n")}`,
  });
  results.push({ title: "사내 DB · Microsoft 365 라이선스 구독 수량", chunkCount: licenseResult.chunkCount });

  // 4) 실사 내역
  const auditLines = audits.map(
    (row) =>
      `실사일시 ${formatKstDateTime(row.created_at)} · 자산번호 ${row.asset_no} · 사용자 조직 ${
        row.asset_user_org ?? "-"
      } · 사용자 ${row.asset_user_name ?? "-"} · 실사자 ${row.inspector_name ?? "-"} · 사용자명 수정 ${
        row.is_edited ? "있음" : "없음"
      }`,
  );

  const auditText = [
    "[OA 자산 실사 내역]",
    `전체 자산 ${equipment.length.toLocaleString()}대 중 실사 완료 ${audits.length.toLocaleString()}건, 미실사 ${(
      equipment.length - audits.length
    ).toLocaleString()}대.`,
    "",
    auditLines.join("\n") || "아직 실사 내역이 없습니다.",
  ].join("\n");

  const auditResult = await ingestText({
    title: "사내 DB · OA 자산 실사 내역",
    sourceType: "database",
    sourceKey: "audit_oa",
    uploadedBy,
    text: auditText,
  });
  results.push({ title: "사내 DB · OA 자산 실사 내역", chunkCount: auditResult.chunkCount });

  return results;
}
