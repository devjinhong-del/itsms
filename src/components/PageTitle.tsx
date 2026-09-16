"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_ITEMS } from "@/lib/nav";
import { PersonIcon, GroupIcon, ChartLineUpIcon } from "./icons";

// 사이드바에서 쓰는 것과 같은 아이콘을 재사용한다. 상단바는 흰 배경이라, 겹침 경계선(GroupIcon의
// borderColor)은 사이드바의 진한 파랑 대신 흰색으로 바꿔서 잘려 보이지 않게 한다.
const NAV_ICONS: Record<string, () => ReactNode> = {
  "/": () => <PersonIcon className="h-4 w-4 shrink-0 text-[#1d428a]" />,
  "/org-assets": () => <GroupIcon className="h-4 w-4 shrink-0 text-[#1d428a]" borderColor="#ffffff" />,
  "/admin/oa-overview": () => <ChartLineUpIcon className="h-[18px] w-[18px] shrink-0 text-[#1d428a]" />,
  "/admin/oa-status": () => <span aria-hidden>💡</span>,
  "/admin/license": () => <span aria-hidden>📉</span>,
  "/admin/audit-monitoring": () => <span aria-hidden>📷</span>,
};

// 사이드바에서 페이지 이동이 있는 메뉴를 눌렀을 때만 제목이 뜬다("관리자 메뉴" 토글처럼
// 이동이 없는 항목은 NAV_ITEMS에 없으므로 자연히 빈 문자열이 된다).
export default function PageTitle() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => item.href === pathname);
  const Icon = current ? NAV_ICONS[current.href] : null;

  return (
    <h1 className="flex items-center gap-2 whitespace-nowrap text-base font-bold text-gray-900">
      {Icon && <Icon />}
      {current?.label ?? ""}
    </h1>
  );
}
