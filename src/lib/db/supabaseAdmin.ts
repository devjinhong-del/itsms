import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Design Ref: DESIGN.md §4 — 서버 코드 전용 관리자 클라이언트(service_role 키 사용, RLS 우회).
// 절대 클라이언트(브라우저) 코드에서 import하지 않는다.
let client: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 .env에 설정되어 있지 않습니다.");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
