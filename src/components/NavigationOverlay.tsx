"use client";

import { useEffect, useState } from "react";
import { useNavigation } from "./NavigationProvider";

const LOGO_WIDTH = 130;
const LOGO_HEIGHT = 50;
const LOGO_MASK = {
  WebkitMaskImage: "url(/jeisys-logo.svg)",
  maskImage: "url(/jeisys-logo.svg)",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskPosition: "center",
  maskPosition: "center",
} as const;

// 사이드바 메뉴를 눌러 다른 페이지로 이동하는 동안, 화면을 통째로 로딩 화면으로 바꾸는 대신
// 기존에 떠 있던 페이지 위 중앙에 이 애니메이션만 겹쳐서 보여준다(새 페이지 렌더가 끝나면
// isPending이 꺼지면서 자동으로 사라지고 새 페이지가 보인다).
export default function NavigationOverlay() {
  const { isPending } = useNavigation();

  // "Loading" 뒤에 점이 1개→3개로 늘었다 줄었다 하는 표시. 점칸의 너비를 고정해두고
  // opacity만 바꿔서, 점 개수가 바뀌어도 "Loading" 글자 위치 자체는 움직이지 않게 한다.
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (!isPending) return;
    const id = setInterval(() => {
      setDots((prev) => (prev >= 3 ? 1 : prev + 1));
    }, 450);
    return () => clearInterval(id);
  }, [isPending]);

  if (!isPending) return null;

  return (
    // 바깥은 메인 영역 전체를 덮고(스크롤이 길어도 배경이 비지 않도록), 안쪽은 sticky+h-screen으로
    // 지금 화면에 보이는 영역의 한가운데에 애니메이션이 고정되게 한다.
    <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-[1px]">
      <div className="sticky top-0 flex h-full flex-col items-center justify-center gap-5">
        <div className="relative" style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT }}>
          {/* 회색 베이스 로고 */}
          <div className="absolute inset-0" style={{ backgroundColor: "#9ca3af", ...LOGO_MASK }} />
          {/* #1d428a 색 "물" — 아래에서 위로 찼다 빠지는 애니메이션 */}
          <div className="animate-logo-fill absolute inset-x-0 bottom-0 overflow-hidden">
            <div
              className="absolute inset-x-0 bottom-0"
              style={{ height: LOGO_HEIGHT, backgroundColor: "#1d428a", ...LOGO_MASK }}
            />
          </div>
        </div>

        <p className="text-base font-medium text-gray-500">
          Loading
          <span aria-hidden className="inline-block w-[1.5em] text-left">
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= dots ? "opacity-100" : "opacity-0"}>
                .
              </span>
            ))}
          </span>
        </p>
      </div>
    </div>
  );
}
