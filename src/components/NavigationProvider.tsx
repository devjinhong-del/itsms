"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface NavigationContextValue {
  isPending: boolean;
  navigate: (href: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

// 사이드바 메뉴 클릭을 React의 startTransition으로 감싸서, 새 페이지(및 그 안의 비동기 데이터
// 로딩)가 준비될 때까지 isPending이 true로 유지되게 한다. 기존 페이지는 그대로 화면에 남아있고,
// 그 위에 중앙 로딩 애니메이션(NavigationOverlay)만 겹쳐서 보여줄 수 있다.
export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return <NavigationContext.Provider value={{ isPending, navigate }}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation은 NavigationProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
