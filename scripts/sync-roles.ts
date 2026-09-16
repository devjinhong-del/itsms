// 역할(role) 정리 스크립트.
// 관리자(admin)로 남길 사람은 IT팀 소속 + 아래 EXTRA_ADMINS에 적은 계정뿐이고,
// 그 외에 admin으로 되어 있던 계정은 전부 manager로 내린다.
// (general/manager로 되어 있던 계정은 건드리지 않는다)
//
// 실행: npx tsx scripts/sync-roles.ts          ← 무엇이 바뀔지만 보여준다(미적용)
//       npx tsx scripts/sync-roles.ts --apply  ← 실제로 반영한다
import "dotenv/config";
import { getSupabaseAdmin } from "../src/lib/db/supabaseAdmin";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";
const PAGE_SIZE = 1000; // PostgREST 한 번 조회 상한
const ADMIN_TEAM = "IT팀";
const EXTRA_ADMINS = ["innocurve@jeisys.com"];

interface M365Row {
  account: string | null;
  team: string | null;
  office: string | null;
  division: string | null;
  department_raw: string | null;
}

interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}

async function fetchAll<T>(load: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await load(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = getSupabaseAdmin();

  // 1) IT팀 소속 계정 모으기 — 소속은 팀/실/본부/원본 부서 어디에 적혀 있어도 인정한다
  const m365 = await fetchAll<M365Row>((from, to) =>
    supabase
      .from("m365_users")
      .select("account, team, office, division, department_raw")
      .eq("expired_at", NO_EXPIRY)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const itTeam = new Set<string>();
  for (const row of m365) {
    const belongs = [row.team, row.office, row.division, row.department_raw].some(
      (value) => (value ?? "").trim() === ADMIN_TEAM,
    );
    if (belongs && row.account) itTeam.add(row.account.trim().toLowerCase());
  }

  const keepAdmin = new Set([...itTeam, ...EXTRA_ADMINS.map((e) => e.toLowerCase())]);

  // 2) 로그인 계정(profiles) 전부 읽기
  const profiles = await fetchAll<Profile>((from, to) =>
    supabase.from("profiles").select("id, email, name, role").order("id", { ascending: true }).range(from, to),
  );

  const toManager = profiles.filter((p) => p.role === "admin" && !keepAdmin.has((p.email ?? "").toLowerCase()));
  const toAdmin = profiles.filter((p) => p.role !== "admin" && keepAdmin.has((p.email ?? "").toLowerCase()));
  const stayAdmin = profiles.filter((p) => p.role === "admin" && keepAdmin.has((p.email ?? "").toLowerCase()));

  console.log(`IT팀 계정 ${itTeam.size}개 + 추가 지정 ${EXTRA_ADMINS.length}개 = 관리자 유지 대상 ${keepAdmin.size}개`);
  console.log(`전체 로그인 계정 ${profiles.length}개`);
  console.log(`  관리자 유지 : ${stayAdmin.length}명 — ${stayAdmin.map((p) => p.email).join(", ") || "없음"}`);
  console.log(`  관리자로 올림: ${toAdmin.length}명 — ${toAdmin.map((p) => p.email).join(", ") || "없음"}`);
  console.log(`  manager로 내림: ${toManager.length}명`);

  if (!apply) {
    console.log("\n(미적용) 실제로 반영하려면 --apply 를 붙여 다시 실행하세요.");
    return;
  }

  const CHUNK = 200;
  for (const [role, targets] of [
    ["manager", toManager],
    ["admin", toAdmin],
  ] as const) {
    for (let i = 0; i < targets.length; i += CHUNK) {
      const ids = targets.slice(i, i + CHUNK).map((p) => p.id);
      if (ids.length === 0) continue;
      const { error } = await supabase.from("profiles").update({ role }).in("id", ids);
      if (error) throw new Error(`${role} 반영 실패: ${error.message}`);
    }
  }

  console.log(`\n반영 완료 — manager로 내림 ${toManager.length}명, 관리자로 올림 ${toAdmin.length}명`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
