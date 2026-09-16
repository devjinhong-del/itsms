import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 개발 서버를 노트북 IP(와이파이)/핫스팟 IP로 접속해 폰에서 테스트할 때,
  // Next.js가 개발 전용 리소스(_next/hmr 등) 요청을 다른 출처로 보고 차단하는 걸 막는다.
  allowedDevOrigins: ["192.168.50.115", "192.168.137.1", "192.168.97.138"],
  // 개발 모드에서 화면 좌측 하단에 뜨는 "N" 개발자 도구 표시(경로/이슈 개수 등)를 끈다.
  devIndicators: false,
  // 문서 업로드(서버 액션)는 기본 1MB 제한으로는 부족해서 늘린다
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
