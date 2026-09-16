"use server";

import { createClient } from "@/lib/supabase/server";
import { recordAccessLog } from "@/lib/db/accessLog";

// 로그인한 사용자가 어떤 화면을 열었는지 기록한다(관리자 메뉴의 "사용자 접속 로그"에서 조회).
export async function logPageView(path: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();

  await recordAccessLog({
    userId: user.id,
    userEmail: user.email,
    userName: profile?.name ?? null,
    eventType: "page_view",
    path,
  });
}
