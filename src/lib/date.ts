// 날짜·시간 표시는 언제나 한국 시간(KST) 기준으로 맞춘다.
//
// 서버(Vercel)는 UTC로 돌기 때문에, 시간대를 지정하지 않으면 화면에 9시간 빠른 시각이 찍힌다.
// DB에는 UTC로 저장하고(그게 맞다), 보여줄 때만 여기 함수들로 KST로 바꾼다.
export const KST = "Asia/Seoul";

// "09. 16. 오후 01:05" 형태 — 목록·표에서 쓰는 기본 표기
export function formatKstDateTime(value: string | Date) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: KST,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "26. 09. 16. 오후 01:05" 형태 — 연도까지 보여야 하는 곳
export function formatKstDateTimeWithYear(value: string | Date) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: KST,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "2026. 9. 16." 형태 — 날짜만 필요할 때
export function formatKstDate(value: string | Date) {
  return new Date(value).toLocaleDateString("ko-KR", { timeZone: KST });
}

// "오늘"을 KST 기준으로 판단하기 위한 키(YYYY-MM-DD).
// en-CA 로캘이 ISO와 같은 순서로 찍어주기 때문에 문자열 비교만으로 같은 날인지 알 수 있다.
export function kstDayKey(value: string | Date = new Date()) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: KST });
}
