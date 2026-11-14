import type { Metadata } from "next";
import "./globals.css";
import {AppThemeProvider} from "./theme-provider";

export const metadata: Metadata = {
  title: "일단나와 · 오늘 어디 갈지, 일단 맡겨봐요",
  description: "조건만 고르면 완성되는 나만의 여가 코스. OpenStreetMap과 GPT로 연결하는 하루.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased"><AppThemeProvider>{children}</AppThemeProvider></body>
    </html>
  );
}
