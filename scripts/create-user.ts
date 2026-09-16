// 관리자가 로그인 계정을 미리 만들어주기 위한 스크립트 (회원가입 화면이 없으므로 유일한 계정 생성 통로).
// 실행: npx tsx scripts/create-user.ts <이메일> <비밀번호> <이름> [역할: general|manager|admin]
import "dotenv/config";
import { getSupabaseAdmin } from "../src/lib/db/supabaseAdmin";

async function main() {
  const [email, password, name, role = "general"] = process.argv.slice(2);

  if (!email || !password || !name) {
    console.error("사용법: npx tsx scripts/create-user.ts <이메일> <비밀번호> <이름> [역할: general|manager|admin]");
    process.exit(1);
  }
  if (!["general", "manager", "admin"].includes(role)) {
    console.error("역할은 general/manager/admin 중 하나여야 합니다.");
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 사내 계정이라 이메일 인증 절차 없이 바로 로그인 가능하게 한다
  });

  if (error || !data.user) {
    throw new Error(`계정 생성 실패: ${error?.message}`);
  }

  // db/migrations/002_profiles.sql의 트리거가 profiles 행을 자동으로 만들어주므로, 이름/역할만 채운다.
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ name, role })
    .eq("id", data.user.id);

  if (updateError) {
    throw new Error(`프로필 갱신 실패: ${updateError.message}`);
  }

  console.log(`계정 생성 완료: ${email} (이름: ${name}, 역할: ${role})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
