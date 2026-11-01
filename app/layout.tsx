import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "꼭대기까지 데려다줄게",
  description: "여동생의 머릿속 탑을 오르는 AI TRPG",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full bg-[#07090a] antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
