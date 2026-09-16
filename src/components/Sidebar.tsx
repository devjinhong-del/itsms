"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { NAV_ITEMS } from "@/lib/nav";
import { useNavigation } from "./NavigationProvider";
import { PersonIcon, GroupIcon } from "./icons";

// 관리자 프로필 — "개인 자산 현황"과 같은 사람 실루엣에 스패너(렌치) 배지를 달아 표현한다.
function AdminIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0">
      <circle cx="11" cy="8" r="4" fill="currentColor" />
      <path d="M3 20c0-4.418 3.582-7 8-7s8 2.582 8 7a1 1 0 01-1 1H4a1 1 0 01-1-1z" fill="currentColor" />
      {/* 배지: 사이드바 배경색으로 한 번 감싸서 사람 실루엣과 겹치는 경계를 분리해 보이게 한다 */}
      <circle cx="18" cy="17" r="5.2" fill="#1d428a" stroke="currentColor" strokeWidth="1.1" />
      {/* 스패너(렌치) */}
      <path
        d="M20.7 13.8a2.4 2.4 0 00-3.2 3.2l-3.2 3.2a.85.85 0 001.2 1.2l3.2-3.2a2.4 2.4 0 003.2-3.2l-1.3 1.3-1.2-1.2 1.3-1.3z"
        fill="currentColor"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
      <path d="M3 5a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4v-4H5a2 2 0 01-2-2V5z" />
    </svg>
  );
}

// 상단바의 "현재 페이지 제목" 표시와 같은 목록(src/lib/nav.ts)을 쓰고, 아이콘만 여기서 붙인다.
const PERSONAL_ICONS: Record<string, () => ReactNode> = {
  "/": PersonIcon,
  "/org-assets": GroupIcon,
};
const PERSONAL_LINKS = NAV_ITEMS.filter((item) => item.href in PERSONAL_ICONS).map((item) => ({
  ...item,
  icon: PERSONAL_ICONS[item.href],
}));
const ADMIN_LINKS = NAV_ITEMS.filter((item) => item.href.startsWith("/admin"));

// AI 도우미 학습 메뉴는 챗봇 담당자에게만 보인다.
const RAG_HREF = "/admin/rag";

// 관리자 서브메뉴 글자색 — 강조(주황)와 준비중(어둡게)을 메뉴별로 지정한다.
// 지정하지 않은 메뉴는 기본 색(흰색 75%)을 쓴다.
const ADMIN_LINK_TONE: Record<string, { base: string; hover: string }> = {
  // 지금 가장 많이 보는 화면이라 눈에 띄게
  "/admin/oa-status": { base: "text-amber-400", hover: "hover:text-amber-300" },
  "/admin/audit-monitoring": { base: "text-amber-400", hover: "hover:text-amber-300" },
  // 아직 서비스 전이라 상대적으로 덜 보이게
  "/admin/audit-open-close": { base: "text-white/40", hover: "hover:text-white/70" },
  "/admin/assignee": { base: "text-white/40", hover: "hover:text-white/70" },
};

// ITSMS 담당자 연락처 — 팀즈 딥링크 형식(공식 지원 포맷)으로 전화/채팅 바로가기를 만든다.
const CONTACT = {
  nameWithTitle: "IT팀 김진홍 차장",
  email: "jinhong@jeisys.com",
  phone: "010-7399-XXXX",
};
const TEAMS_CHAT_MESSAGE = "ITSMS관련 문의 드립니다.";
const TEAMS_CALL_HREF = `https://teams.microsoft.com/l/call/0/0?users=${CONTACT.email}`;
const TEAMS_CHAT_HREF = `https://teams.microsoft.com/l/chat/0/0?users=${CONTACT.email}&message=${encodeURIComponent(TEAMS_CHAT_MESSAGE)}`;

// height:auto는 CSS 트랜지션이 안 되므로, 실제 내용보다 넉넉한 max-height 사이를
// 트랜지션해서 슬라이드로 접혔다 펼쳐지는 것처럼 보이게 한다(관리자 메뉴 하위 서브메뉴 전용).
function Collapsible({ open, maxHeightClass, children }: { open: boolean; maxHeightClass: string; children: ReactNode }) {
  return (
    <div className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${open ? maxHeightClass : "max-h-0"}`}>
      {children}
    </div>
  );
}

export default function Sidebar({ role, canManageRag = false }: { role: string; canManageRag?: boolean }) {
  const pathname = usePathname();
  const { navigate } = useNavigation();
  const isAdminRoute = pathname.startsWith("/admin");
  const [adminOpen, setAdminOpen] = useState(isAdminRoute);
  // true=전체 펼침(아이콘+글자), false=삼선 버튼을 눌러 세로로 얇은 아이콘 전용 레일로 접은 상태
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    // sticky + h-screen: 메인 화면이 길어져 스크롤이 생겨도 사이드바(담당자 정보 포함)는
    // 화면에 그대로 붙어 있게 한다. 사이드바 내용이 화면보다 길어지면 사이드바만 따로 스크롤된다.
    <aside
      className={`sticky top-0 flex h-screen ${sidebarOpen ? "w-60" : "w-16"} shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-[#1d428a] text-white transition-[width] duration-300 ease-in-out`}
    >
      {/* 3줄(햄버거) 버튼 + 로고. ITSMS 글자는 로고와 같은 x축 위치에서 시작하도록 grid로
          정렬하고, 로고 바로 아래 붙여 간격을 좁혔다. 접힘(레일) 상태에서는 로고 워드마크가
          폭에 안 맞아 숨기고 버튼만 남긴다. */}
      <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap px-4 py-4">
        <button
          type="button"
          onClick={() => setSidebarOpen((prev) => !prev)}
          aria-label="메뉴 접기/펼치기"
          className="shrink-0 rounded p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {sidebarOpen && (
          // 로고+ITSMS를 한 열로 묶어서, 바깥 flex의 items-center가 이 묶음 전체 높이의
          // 중간에 햄버거 버튼을 맞춰준다(로고만이 아니라 로고+ITSMS를 합친 높이 기준).
          <div className="flex flex-col items-start">
            <img src="/jeisys-logo.svg" alt="Jeisys" className="h-6 w-auto" />
            <span className="-mt-0.5 text-[11px] font-medium tracking-wider text-white/70">ITSMS</span>
          </div>
        )}
      </div>

      <nav className="flex flex-col overflow-hidden whitespace-nowrap border-t border-white/10 text-sm">
        {PERSONAL_LINKS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              onClick={(e) => {
                e.preventDefault();
                navigate(item.href);
              }}
              className={`flex h-10 items-center gap-2.5 overflow-hidden whitespace-nowrap px-[18px] font-bold transition ${sidebarOpen ? "" : "justify-center px-0"} ${
                active ? "bg-white/15" : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          );
        })}

        {role === "admin" && (
          <div>
            <button
              type="button"
              onClick={() => {
                // 접힌(레일) 상태에서는 서브메뉴를 펼쳐봤자 글자가 안 보이니, 이 아이콘을
                // 누르면 먼저 사이드바 자체를 펼치고 관리자 서브메뉴도 함께 열어준다.
                if (!sidebarOpen) {
                  setSidebarOpen(true);
                  setAdminOpen(true);
                  return;
                }
                setAdminOpen((prev) => !prev);
              }}
              title="관리자 메뉴"
              className={`flex h-10 w-full items-center gap-2.5 overflow-hidden whitespace-nowrap px-[18px] font-bold transition ${sidebarOpen ? "" : "justify-center px-0"} ${
                isAdminRoute ? "bg-white/15" : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <AdminIcon />
              {sidebarOpen && (
                <span className="flex flex-1 items-center justify-between">
                  관리자 메뉴
                  <span className={`transition-transform ${adminOpen ? "rotate-90" : ""}`}>›</span>
                </span>
              )}
            </button>

            {sidebarOpen && (
              <Collapsible open={adminOpen} maxHeightClass="max-h-[320px]">
                <div className="border-l border-white/15 pl-3">
                  {ADMIN_LINKS.filter((item) => item.href !== RAG_HREF || canManageRag).map((item) => {
                    const tone = ADMIN_LINK_TONE[item.href];
                    const color = tone
                      ? `${tone.base} ${tone.hover}`
                      : "text-white/75 hover:text-white";
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(item.href);
                        }}
                        className={`flex h-9 items-center px-[18px] text-[13px] font-bold transition ${color} ${
                          pathname === item.href ? "bg-white/15" : "hover:bg-white/10"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </Collapsible>
            )}
          </div>
        )}
      </nav>

      {/* 사이드바 최하단 고정 — ITSMS 담당자 연락처(레일 상태로 접히면 글자가 다 안 보이므로 숨긴다) */}
      {sidebarOpen && (
        <div className="mt-auto border-t border-white/10 px-4 py-4 text-xs text-white/70">
          <p className="mb-1 font-semibold text-white/90">ITSMS 담당자</p>
          <p>{CONTACT.nameWithTitle}</p>
          <p>
            {/* 기본 메일 프로그램(아웃룩)에서 바로 메일을 쓸 수 있게 한다 */}
            <a
              href={`mailto:${CONTACT.email}?subject=${encodeURIComponent("[ITSMS] 문의드립니다")}`}
              className="underline decoration-white/30 underline-offset-2 transition hover:text-white hover:decoration-white"
            >
              {CONTACT.email}
            </a>
          </p>
          <p>{CONTACT.phone}</p>
          <div className="mt-2 flex gap-2">
            <a
              href={TEAMS_CALL_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 font-medium text-white/90 transition hover:bg-white/20"
            >
              <PhoneIcon />
              Teams 전화
            </a>
            <a
              href={TEAMS_CHAT_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 font-medium text-white/90 transition hover:bg-white/20"
            >
              <ChatIcon />
              Teams 채팅
            </a>
          </div>
        </div>
      )}

      {/* 접힌(레일) 상태에서는 위 담당자 블록이 안 보이니, 문의하기임을 알 수 있는 아이콘만
          최하단에 남긴다. 눌렀을 때 바로 Teams가 열리는 대신, 먼저 사이드바를 펼쳐서 담당자
          정보(연락처·Teams 버튼)를 보여준다. 펼친 상태에서는 위 블록과 중복되므로 숨긴다. */}
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          title="ITSMS 담당자에게 문의하기"
          className="mt-auto flex h-12 items-center justify-center border-t border-white/10 text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <ChatIcon />
        </button>
      )}
    </aside>
  );
}
