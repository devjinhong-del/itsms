import { getSupabaseAdmin } from "@/lib/db/supabaseAdmin";

// 접속 로그 기록 — 로그가 실패해도 화면 동작을 막지 않도록 에러는 삼키고 서버 콘솔에만 남긴다.
export async function recordAccessLog(input: {
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  eventType: "login" | "page_view";
  path?: string | null;
}) {
  try {
    await getSupabaseAdmin().from("access_logs").insert({
      user_id: input.userId ?? null,
      user_email: input.userEmail ?? null,
      user_name: input.userName ?? null,
      event_type: input.eventType,
      path: input.path ?? null,
    });
  } catch (error) {
    console.error("접속 로그 기록 실패:", error);
  }
}
