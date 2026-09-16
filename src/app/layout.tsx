import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ITSMS",
  description: "사내 ITSMS(IT 서비스 관리) 웹 앱",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
