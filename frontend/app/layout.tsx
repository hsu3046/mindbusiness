import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ApiKeyDialogWrapper } from "@/components/settings/api-key-dialog-wrapper";
import "./globals.css";

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-sans'
});

export const metadata: Metadata = {
  title: "MindBusiness AI - AI 전략 컨설턴트",
  description: "AI 기반 마인드맵 생성 도구. 비즈니스 전략을 구조화하고 실행 가능한 계획으로 변환합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className={figtree.variable}>
      <body className={`antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <ApiKeyDialogWrapper />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

