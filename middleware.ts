import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // 정적 파일(이미지·아이콘 등)은 미들웨어를 타지 않게 한다.
  // 예전에는 .svg만 빼서, 로그인 없이 열리는 소개 페이지의 png/jpg가 /login으로 리다이렉트됐다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json)$).*)"],
};
