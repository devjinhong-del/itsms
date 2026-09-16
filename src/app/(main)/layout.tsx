import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import Sidebar from "@/components/Sidebar";
import PageTitle from "@/components/PageTitle";
import { NavigationProvider } from "@/components/NavigationProvider";
import NavigationOverlay from "@/components/NavigationOverlay";
import AccessLogger from "@/components/AccessLogger";
import { LogoutIcon } from "@/components/icons";
import ChatWidget from "@/components/ChatWidget";
import { getChatbotAccess } from "@/lib/rag/access";
import { isMobileUserAgent } from "@/lib/device";
import { ROLE_LABEL, normalizeRole } from "@/lib/auth/role";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("name, role").eq("id", user.id).single();

  const role = profile?.role ?? "general";

  // AI 도우미는 HR팀과 ITSMS 담당자에게만, 그리고 PC 화면에서만 보인다.
  const chatbot = await getChatbotAccess();
  const isMobile = isMobileUserAgent((await headers()).get("user-agent"));
  const showChatbot = chatbot.canChat && !isMobile;

  return (
    <NavigationProvider>
      <AccessLogger />
      {/* 화면 높이에 맞춰 껍데기를 고정하고, 내용은 main 안쪽에서만 스크롤되게 한다.
          (사이드바·상단바는 스크롤과 무관하게 항상 같은 자리에 머문다) */}
      <div className="flex h-screen overflow-hidden">
        <Sidebar role={role} canManageRag={chatbot.canManage} />

        <div className="flex flex-1 flex-col">
          {/* 페이지 제목은 상단바 정가운데에 두고(absolute), 사용자 정보·로그아웃은 오른쪽에 고정한다. */}
          <header className="relative flex items-center justify-end border-b border-gray-200 bg-white px-6 py-3.5">
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
              <PageTitle />
            </div>

            <div className="flex items-center gap-3">
              <p className="flex items-center gap-1.5 text-[15px] text-gray-600">
                {role !== "general" && (
                  <span className="rounded bg-[#1d428a]/10 px-1.5 py-0.5 text-xs font-medium text-[#1d428a]">
                    {ROLE_LABEL[normalizeRole(role)]}
                  </span>
                )}
                {profile?.name ?? user.email}님
              </p>
              <form action={logout}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                >
                  <LogoutIcon />
                  로그아웃
                </button>
              </form>
            </div>
          </header>

          {/* relative + NavigationOverlay: 메뉴 이동 중에는 이 기존 페이지 위 중앙에
              로딩 애니메이션만 겹쳐서 보여주고, 화면 전체를 로딩 화면으로 바꾸지 않는다. */}
          <main className="relative flex-1 overflow-y-auto bg-gray-50 p-6">
            {children}
            <NavigationOverlay />
          </main>

          {showChatbot && <ChatWidget />}
        </div>
      </div>
    </NavigationProvider>
  );
}
