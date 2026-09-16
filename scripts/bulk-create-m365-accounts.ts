// m365_users.account가 "XXXX@jeisys.com" 형식인 사람들을 전부 로그인 계정으로 만드는 POC용 스크립트.
// - 같은 사람이 라이선스별로 여러 행을 가질 수 있어 account 기준으로 중복 제거 후 한 번씩만 생성한다.
// - 이미 존재하는 계정은 건너뛴다(에러 없이 계속 진행).
// - 비밀번호는 POC 단계라 전부 "abc123"으로 통일, 역할은 전부 admin으로 설정한다.
// 실행: npx tsx scripts/bulk-create-m365-accounts.ts
import "dotenv/config";
import { getSupabaseAdmin } from "../src/lib/db/supabaseAdmin";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";
const PASSWORD = "abc123";
const ROLE = "admin";
const CONCURRENCY = 5;
const ACCOUNT_PATTERN = /^[^@\s]+@jeisys\.com$/i;
const PAGE_SIZE = 1000; // PostgREST 한 번 조회 상한

interface Target {
  account: string;
  name: string | null;
}

async function main() {
  const supabase = getSupabaseAdmin();

  // PostgREST는 한 번에 최대 1000행만 돌려주므로, 반드시 페이징해서 전부 읽어야 한다.
  // (이 처리가 없던 첫 실행에서는 앞 1000행 안에 없던 계정들이 통째로 누락됐다.)
  const rows: { account: string | null; name: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("m365_users")
      .select("account, name")
      .eq("expired_at", NO_EXPIRY)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`m365_users 조회 실패: ${error.message}`);
    }

    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }

  const seen = new Set<string>();
  const targets: Target[] = [];

  for (const row of rows) {
    const account = (row.account ?? "").trim();
    if (!ACCOUNT_PATTERN.test(account)) continue;

    const key = account.toLowerCase();
    if (seen.has(key)) continue; // 같은 사람의 다른 라이선스 행 — 한 번만 생성
    seen.add(key);

    targets.push({ account, name: row.name });
  }

  console.log(`전체 ${rows.length}건 중 대상(jeisys.com, 중복 제거) ${targets.length}건`);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let index = 0;

  async function processOne(target: Target) {
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email: target.account,
      password: PASSWORD,
      email_confirm: true,
    });

    if (createError) {
      const message = createError.message.toLowerCase();
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        skipped++;
      } else {
        failed++;
        console.error(`실패: ${target.account} - ${createError.message}`);
      }
      return;
    }

    if (!data.user) {
      failed++;
      console.error(`실패: ${target.account} - 계정 정보를 받지 못함`);
      return;
    }

    // db/migrations/002_profiles.sql의 트리거가 profiles 행을 기본값(role=general)으로 만들어주므로,
    // 이름과 역할만 덮어쓴다.
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ name: target.name ?? target.account, role: ROLE })
      .eq("id", data.user.id);

    if (updateError) {
      console.error(`프로필 갱신 실패: ${target.account} - ${updateError.message}`);
    }

    created++;
  }

  async function worker() {
    while (index < targets.length) {
      const current = index++;
      await processOne(targets[current]);
      if ((current + 1) % 50 === 0) {
        console.log(`진행 중: ${current + 1}/${targets.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`완료 — 생성 ${created}건, 이미 존재(건너뜀) ${skipped}건, 실패 ${failed}건`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
