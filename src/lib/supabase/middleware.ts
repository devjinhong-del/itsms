import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isMobileUserAgent, MOBILE_HOME } from "@/lib/device";

// Design Ref: DESIGN.md — 모든 요청마다 세션 쿠키를 갱신하고, 로그인 안 된 사용자를 /login으로 보낸다.
// getUser()는 매번 토큰을 서버에 재검증하므로(getSession()과 달리) 여기서 인증 여부 판단에 안전하게 쓸 수 있다.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  // 로그인 없이 열리는 화면 — 소개 페이지에는 사내 데이터가 한 줄도 나오지 않는다.
  const isPublicPage = request.nextUrl.pathname.startsWith("/about");

  if (!user && !isLoginPage && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 휴대폰·태블릿은 실사용 목적이 바코드 스캔 하나뿐이라, 어떤 주소로 들어오든 실사 화면으로 보낸다.
  // - 화면을 그리는 이동(GET)만 대상으로 한다. 폼 제출·서버 액션(POST)까지 돌리면 제출이 깨진다.
  // - /audit_oa 안에서 일어나는 동작(스캔→확인→추가 바코드 찍기)은 같은 주소라서 그대로 동작한다.
  const isMobile = isMobileUserAgent(request.headers.get("user-agent"));
  const isNavigation = request.method === "GET" || request.method === "HEAD";
  const path = request.nextUrl.pathname;
  const isAuditPage = path === MOBILE_HOME || path.startsWith(`${MOBILE_HOME}/`) || isPublicPage;
  const isInternal = path.startsWith("/_next") || path.startsWith("/api") || path.includes(".");

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = isMobile ? MOBILE_HOME : "/";
    return NextResponse.redirect(url);
  }

  if (user && isMobile && isNavigation && !isAuditPage && !isInternal) {
    const url = request.nextUrl.clone();
    url.pathname = MOBILE_HOME;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
