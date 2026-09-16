import { createBrowserClient } from "@supabase/ssr";

// Design Ref: DESIGN.md — 브라우저(클라이언트 컴포넌트)에서 쓰는 Supabase 클라이언트.
// publishable 키는 브라우저에 노출돼도 안전하도록 만들어진 키다(RLS로 접근 범위가 제한됨).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
