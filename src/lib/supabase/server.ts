import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Design Ref: DESIGN.md — 서버 컴포넌트/서버 액션에서 쓰는 Supabase 클라이언트.
// 로그인한 사용자 본인 권한으로 동작한다(RLS 적용). 관리자 전용 작업은
// src/lib/db/supabaseAdmin.ts(service_role, RLS 우회)를 대신 쓴다.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서는 쿠키를 쓸 수 없다 — middleware가 세션 갱신을 대신 처리하므로 무시해도 된다.
          }
        },
      },
    },
  );
}
