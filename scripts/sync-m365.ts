// export_m365 폴더의 CSV(M365 PowerShell 내보내기 결과)를 읽어 m365_users 테이블에 적재한다.
// 실행: npx tsx scripts/sync-m365.ts
//
// 규칙 (db/migrations/004_m365_users.sql 참고)
//   - 같은 사람+같은 라이선스 조합이 그대로면 validated_at만 갱신한다.
//   - 값이 바뀌었으면 기존 행을 만료시키고(expired_at=지금) 새 행을 추가한다.
//   - 이번 CSV에 더는 나타나지 않는 조합(계정 삭제·라이선스 해제 등)은 만료 처리한다.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getSupabaseAdmin } from "../src/lib/db/supabaseAdmin";
import { parseCsv } from "./lib/csv";
import { parseName, parseDepartment, parseLicenses, normalizeAccount } from "./lib/m365";

const TABLE = "m365_users";
const NO_EXPIRY = "9999-12-31T23:59:59+00:00";
const NONE_KEY = "__NONE__";

// 값이 그대로인지 비교할 업무 컬럼(계정/라이선스는 자연키라서 비교 대상에서 제외)
const COMPARE_COLUMNS = ["name", "display_name", "division", "office", "team", "department_raw"] as const;

interface Record_ {
  account: string;
  license: string | null;
  name: string;
  display_name: string;
  division: string | null;
  office: string | null;
  team: string | null;
  department_raw: string | null;
  raw_response: Record<string, string>;
}

function findCsvFile(): string {
  const dir = path.join(process.cwd(), "export_m365");
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".csv"));
  if (files.length === 0) throw new Error(`${dir}에 CSV 파일이 없습니다.`);
  // 여러 개면(재수출 등) 가장 최근에 수정된 파일을 쓴다.
  files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
  return path.join(dir, files[0]);
}

function keyOf(account: string, license: string | null): string {
  return `${account}::${license ?? NONE_KEY}`;
}

function readRecords(csvPath: string): Record_[] {
  const text = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  const header = rows[0];

  const col = (label: string) => {
    const idx = header.indexOf(label);
    if (idx === -1) throw new Error(`CSV 헤더에서 "${label}" 칼럼을 찾지 못했습니다.`);
    return idx;
  };

  const idxName = col("이름(DisplayName)");
  const idxAccount = col("계정(UPN)");
  const idxDept = col("부서(Department)");
  const idxLicense = col("사용 중인 라이선스");

  const records: Record_[] = [];

  for (const row of rows.slice(1)) {
    const displayName = row[idxName] ?? "";
    const account = normalizeAccount(row[idxAccount] ?? "");
    if (!account) continue;

    const dept = parseDepartment(row[idxDept] ?? "");
    const licenses = parseLicenses(row[idxLicense] ?? "");
    const rawRow = Object.fromEntries(header.map((h, i) => [h, row[i] ?? ""]));

    for (const license of licenses) {
      records.push({
        account,
        license,
        name: parseName(displayName),
        display_name: displayName.trim(),
        division: dept.division,
        office: dept.office,
        team: dept.team,
        department_raw: dept.departmentRaw,
        raw_response: rawRow,
      });
    }
  }

  return records;
}

type ExistingRow = { id: number; account: string; license: string | null } & Record<
  (typeof COMPARE_COLUMNS)[number],
  string | null
>;

async function loadExistingCurrent() {
  const supabase = getSupabaseAdmin();
  const existing = new Map<string, ExistingRow>();
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(["id", "account", "license", ...COMPARE_COLUMNS].join(", "))
      .eq("expired_at", NO_EXPIRY)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`기존 데이터 조회 실패: ${error.message}`);
    const rows = (data ?? []) as unknown as ExistingRow[];
    for (const row of rows) {
      existing.set(keyOf(row.account, row.license), row);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return existing;
}

async function main() {
  const csvPath = findCsvFile();
  console.log(`CSV 파일: ${path.basename(csvPath)}`);

  const incomingList = readRecords(csvPath);
  const incoming = new Map<string, Record_>();
  let duplicateSkipped = 0;
  for (const rec of incomingList) {
    const key = keyOf(rec.account, rec.license);
    if (incoming.has(key)) {
      duplicateSkipped += 1;
      continue;
    }
    incoming.set(key, rec);
  }

  const existing = await loadExistingCurrent();

  const toInsert: Record_[] = [];
  const toExpireIds: number[] = [];
  const toTouchIds: number[] = [];
  let changed = 0;
  let unchanged = 0;

  for (const [key, rec] of incoming) {
    const old = existing.get(key);
    if (!old) {
      toInsert.push(rec);
      continue;
    }
    const isSame = COMPARE_COLUMNS.every((c) => (old[c] ?? null) === (rec[c] ?? null));
    if (isSame) {
      toTouchIds.push(old.id);
      unchanged += 1;
    } else {
      toExpireIds.push(old.id);
      toInsert.push(rec);
      changed += 1;
    }
  }

  let orphanExpired = 0;
  for (const [key, old] of existing) {
    if (!incoming.has(key)) {
      toExpireIds.push(old.id);
      orphanExpired += 1;
    }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // 만료를 먼저 처리해야 "현재 유효 행 1건" 유니크 조건과 충돌하지 않는다.
  for (let i = 0; i < toExpireIds.length; i += 200) {
    const chunk = toExpireIds.slice(i, i + 200);
    const { error } = await supabase.from(TABLE).update({ expired_at: now }).in("id", chunk);
    if (error) throw new Error(`만료 처리 실패: ${error.message}`);
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error } = await supabase.from(TABLE).insert(chunk);
    if (error) throw new Error(`추가 실패: ${error.message}`);
  }

  for (let i = 0; i < toTouchIds.length; i += 200) {
    const chunk = toTouchIds.slice(i, i + 200);
    const { error } = await supabase.from(TABLE).update({ validated_at: now }).in("id", chunk);
    if (error) throw new Error(`검증일 갱신 실패: ${error.message}`);
  }

  const { count: finalCount } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("expired_at", NO_EXPIRY);

  console.log("\n적재 결과");
  console.log("-".repeat(60));
  console.log(`CSV 원본 행 수(사람 기준)      : ${incomingList.length === 0 ? 0 : new Set(incomingList.map((r) => r.account)).size}`);
  console.log(`CSV에서 만든 행 수(사람×라이선스): ${incomingList.length}`);
  console.log(`중복이라 건너뜀                : ${duplicateSkipped}`);
  console.log(`신규                           : ${toInsert.length - changed}`);
  console.log(`변경(만료+새로 추가)            : ${changed}`);
  console.log(`동일(검증일만 갱신)             : ${unchanged}`);
  console.log(`더 이상 없어서 만료             : ${orphanExpired}`);
  console.log(`현재 DB 유효 행 수              : ${finalCount ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
