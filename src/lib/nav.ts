// 사이드바에서 실제로 다른 페이지로 이동하는 메뉴 목록(href → 메뉴 이름).
// "관리자 메뉴" 자체는 펼치기/접기 토글일 뿐 페이지 이동이 아니라서 여기 포함하지 않는다.
// Sidebar.tsx와 상단바의 현재 페이지 제목 표시가 이 목록을 함께 참조한다.
export const NAV_ITEMS = [
  { href: "/", label: "개인 자산 현황" },
  { href: "/org-assets", label: "조직 자산 현황" },
  { href: "/admin/oa-overview", label: "모든 OA 현황" },
  { href: "/admin/oa-status", label: "OA Report & Insight" },
  { href: "/admin/license", label: "License 관리" },
  { href: "/admin/audit-open-close", label: "OA 자산 실사 Open/Close" },
  { href: "/admin/audit-monitoring", label: "OA 자산 현황 실사 모니터링" },
  { href: "/admin/audit-qr", label: "OA 자산 현황 실사" },
  { href: "/admin/assignee", label: "담당자 선임" },
  { href: "/admin/access-log", label: "사용자 접속 로그" },
  { href: "/admin/rag", label: "AI 도우미 학습" },
] as const;
