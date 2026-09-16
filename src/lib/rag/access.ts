import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";

const NO_EXPIRY = "9999-12-31T23:59:59+00:00";

// 챗봇을 쓸 수 있는 사람: HR팀 소속 + ITSMS 담당자(김진홍).
// 문서를 올려 학습시킬 수 있는 사람: 김진홍 한 명.
export const CHATBOT_OWNER_EMAIL = "jinhong@jeisys.com";
const CHATBOT_TEAM = "HR팀";

export interface ChatbotAccess {
  canChat: boolean; // 챗봇 아이콘이 보이는지
  canManage: boolean; // 문서 학습 메뉴가 보이는지
  email: string | null;
}

// 화면 표시와 서버 액션이 같은 기준을 쓰도록 판단은 여기 한 곳에서만 한다.
export async function getChatbotAccess(): Promise<ChatbotAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase() ?? null;
  if (!email) return { canChat: false, canManage: false, email: null };

  if (email === CHATBOT_OWNER_EMAIL) {
    return { canChat: true, canManage: true, email };
  }

  // 소속은 M365 사용자 정보에서 확인한다(계정 = 이메일).
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("m365_users")
    .select("team, office, division, department_raw")
    .eq("expired_at", NO_EXPIRY)
    .eq("account", email)
    .limit(1)
    .maybeSingle();

  const belongsToHr = [data?.team, data?.office, data?.division, data?.department_raw].some(
    (value) => (value ?? "").trim() === CHATBOT_TEAM,
  );

  return { canChat: belongsToHr, canManage: false, email };
}

// 문서 학습 화면은 URL을 직접 입력해도 담당자가 아니면 볼 수 없게 막는다.
export async function requireChatbotManager() {
  const access = await getChatbotAccess();
  if (!access.canManage) redirect("/");
  return access;
}
