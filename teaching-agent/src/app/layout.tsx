import type { Metadata, Viewport } from "next";
import { Noto_Serif_SC } from "next/font/google";
import { appPath } from "@/lib/app-path";
import "./globals.css";

/** 标题用宋体：教材气质，和正文的黑体拉开层次。CJK 字体按 unicode-range 分片，不预加载。 */
const serif = Noto_Serif_SC({ weight: ["600", "700"], display: "swap", preload: false, variable: "--font-serif" });

export const metadata: Metadata = {
  title: { default: "第六章 · 钢筋混凝土梁承载力计算原理", template: "%s · 第六章 钢筋混凝土梁" },
  description: "东南大学 · 工程结构设计原理 第六章：课件、AI 助教、练习、课堂与配筋计算。",
  icons: { icon: appPath("/seu-badge.svg") },
};

export const viewport: Viewport = { themeColor: "#f6f6f4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={serif.variable}>
      <body className="h-full">{children}</body>
    </html>
  );
}
