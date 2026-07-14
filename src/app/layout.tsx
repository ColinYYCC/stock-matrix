import type { Metadata } from "next";
import { Toaster } from "sonner";

import "./globals.css";

/** 页面 SEO 元数据 */
export const metadata: Metadata = {
  title: "股市矩阵 | Stock Matrix",
  description: "股市矩阵，开源免费的大盘云图，支持行业权重、涨跌颜色、缩放、平移、全屏与截图分享。",
  keywords: ["股市矩阵", "A股热力图", "A股图表", "行情地图", "板块热力图", "stock matrix", "market heatmap"],
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
  openGraph: {
    title: "股市矩阵 | Stock Matrix",
    description: "用一张可交互热力图快速观察 A 股板块轮动与个股涨跌。",
    url: "/",
    siteName: "股市矩阵 | Stock Matrix",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "股市矩阵 | Stock Matrix",
    description: "用一张可交互热力图快速观察 A 股板块轮动与个股涨跌。",
  },
};

/**
 * 主题初始化脚本
 * 在页面渲染前从 localStorage 读取用户的显示偏好（暗色/亮色），
 * 避免页面加载时闪烁。
 */
const themeInitScript = `
  try {
    const displayMode = window.localStorage.getItem("heatmap-display-mode");
    const isDark = displayMode !== "light";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  } catch {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="min-h-dvh antialiased dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
