// 관리자가 기존 로그인 계정의 비밀번호를 재설정하기 위한 스크립트(비밀번호 찾기 화면이 없으므로).
// 실행: npx tsx scripts/set-password.ts <이메일> <새 비밀번호>
import "dotenv/config";
import { getSupabaseAdmin } from "../src/lib/db/supabaseAdmin";

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error("사용법: npx tsx scripts/set-password.ts <이메일> <새 비밀번호>");
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (profileError || !profile) {
    throw new Error(`해당 이메일의 계정을 찾을 수 없습니다: ${email}`);
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, { password });

  if (updateError) {
    throw new Error(`비밀번호 변경 실패: ${updateError.message}`);
  }

  console.log(`비밀번호 변경 완료: ${email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
