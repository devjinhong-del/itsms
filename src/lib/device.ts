// 요청을 보낸 기기가 휴대폰·태블릿인지 User-Agent로 판별한다.
// 미들웨어(모든 요청)와 로그인 액션이 같은 기준을 쓰도록 여기 한 곳에만 둔다.
const MOBILE_UA = /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Opera Mini|Mobile Safari|SamsungBrowser/i;

export function isMobileUserAgent(userAgent: string | null | undefined) {
  return MOBILE_UA.test(userAgent ?? "");
}

// 모바일에서 로그인하면 들어가는 화면 — 현장에서 바코드를 찍으려고 들어오는 경우가 대부분이다.
export const MOBILE_HOME = "/audit_oa";
