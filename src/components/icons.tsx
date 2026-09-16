// 사이드바 메뉴와 상단바 페이지 제목이 함께 쓰는 아이콘 — 무료로 쓸 수 있는 일반적인
// 픽토그램(사람/그룹 실루엣) 형태를 직접 SVG로 그려서 쓴다.
export function PersonIcon({ className = "h-[18px] w-[18px] shrink-0" }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.418 3.582-7 8-7s8 2.582 8 7a1 1 0 01-1 1H5a1 1 0 01-1-1z" />
    </svg>
  );
}

// "개인 자산 현황"과 같은 사람 실루엣을 3개 겹쳐서 그룹을 표현한다.
// 겹치는 경계가 뭉개져 보이지 않도록, 배경색과 같은 색 테두리로 각 사람을 분리해 보이게 한다.
// borderColor는 이 아이콘이 놓이는 배경색에 맞춰 겹침 경계선 색을 지정한다(사이드바=진한 파랑, 상단바=흰색).
export function GroupIcon({
  className = "h-[18px] w-[18px] shrink-0",
  borderColor = "#1d428a",
}: {
  className?: string;
  borderColor?: string;
} = {}) {
  const person = (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.418 3.582-7 8-7s8 2.582 8 7a1 1 0 01-1 1H5a1 1 0 01-1-1z" />
    </>
  );
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke={borderColor} strokeWidth="1.4" strokeLinejoin="round" className={className}>
      <g opacity="0.55" transform="translate(-5 2) scale(0.62)">
        {person}
      </g>
      <g opacity="0.8" transform="translate(3 2) scale(0.62)">
        {person}
      </g>
      <g transform="translate(11 2) scale(0.62)">{person}</g>
    </svg>
  );
}

// 첨부 대시보드(KRS 관제)의 브랜드 아이콘과 같은 "우상향 꺾은선 그래프" 픽토그램 —
// OA Report & Insight 페이지 제목 앞에 쓴다.
export function ChartLineUpIcon({ className = "h-[18px] w-[18px] shrink-0" }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* 축 */}
      <path d="M3.5 3.5v15a2 2 0 002 2h15" />
      {/* 우상향 꺾은선 */}
      <path d="M7 15.5l3.5-3.8 3 2.6 5-5.8" />
      {/* 끝점 화살표 */}
      <path d="M14.4 8.5h4.1v4.1" />
    </svg>
  );
}

// 로그아웃 — 열린 문에서 화살표가 밖으로 나가는, 가장 널리 쓰이는 형태의 픽토그램.
export function LogoutIcon({ className = "h-4 w-4 shrink-0" }: { className?: string } = {}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* 문(왼쪽 벽면이 열려 있는 모양) */}
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      {/* 밖으로 나가는 화살표 */}
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
