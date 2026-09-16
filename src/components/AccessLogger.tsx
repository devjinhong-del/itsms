"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { logPageView } from "@/app/(main)/actions";

// 화면이 바뀔 때마다 접속 로그를 남긴다. 같은 경로를 연달아 기록하지 않도록 직전 경로를 기억해둔다.
export default function AccessLogger() {
  const pathname = usePathname();
  const lastLogged = useRef<string | null>(null);

  useEffect(() => {
    if (lastLogged.current === pathname) return;
    lastLogged.current = pathname;
    logPageView(pathname).catch(() => {});
  }, [pathname]);

  return null;
}
