import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ApiKeyDialogWrapper } from "@/components/settings/api-key-dialog-wrapper";
import "./globals.css";

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-sans'
});

const SITE_URL = "https://aib.vote";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MindBusiness — 비즈니스 전략 마인드맵",
    template: "%s | MindBusiness",
  },
  description:
    "노트에 쓰듯 자유롭게 마인드맵을 만들고, 막힐 땐 AI가 새로운 방향을 제안해 드립니다. 완성된 아이디어는 보고서로 정리하거나 PDF로 저장할 수 있습니다. 무료, 본인 API 키 사용.",
  keywords: [
    "MindBusiness",
    "AI 마인드맵",
    "BMC 자동 생성",
    "비즈니스 모델 캔버스",
    "Lean Canvas",
    "SWOT 분석",
    "PESTEL",
    "사업계획서 AI",
    "전략 컨설턴트",
    "Business Model Canvas",
    "AI 전략 도구",
  ],
  authors: [{ name: "aib", url: SITE_URL }],
  creator: "aib",
  publisher: "aib",
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: "MindBusiness",
    title: "MindBusiness — 비즈니스 전략 마인드맵",
    description:
      "노트에 쓰듯 자유롭게 마인드맵을 만들고, 막힐 땐 AI가 새로운 방향을 제안해 드립니다. 무료, 본인 API 키 사용.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MindBusiness — 비즈니스 전략 마인드맵",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MindBusiness — 비즈니스 전략 마인드맵",
    description:
      "노트에 쓰듯 자유롭게 마인드맵을 만들고, 막힐 땐 AI가 새로운 방향을 제안해 드립니다.",
    images: ["/og-image.png"],
  },
  // 아이콘 선언은 최소화 — Next.js App Router가 app/ 루트의 favicon.ico,
  // icon.svg, apple-icon.png 를 자동 감지해 적절한 <link> 태그를 생성한다.
  // 중복 선언하면 같은 태그가 두 번 들어감. 여기선 PWA용 추가 PNG 만 명시.
  icons: {
    other: [
      { rel: "icon", url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

// viewport-fit=cover keeps the layout viewport at the full visible area on
// iOS Safari — required for fullscreen fixed overlays to render correctly
// (iOS 26 chrome rendering bug — see TOOL_GOTCHAS.md).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className={figtree.variable}>
      <body className={`antialiased`}>
        {/* JSON-LD structured data — SoftwareApplication + Organization.
            Helps Google rich results and AI search (Perplexity / ChatGPT /
            AI Overviews) cite the product accurately. */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "SoftwareApplication",
                  "@id": `${SITE_URL}/#software`,
                  name: "MindBusiness",
                  description:
                    "노트에 쓰듯 자유롭게 마인드맵을 만들고, 막힐 땐 AI가 새로운 방향을 제안하고 완성된 아이디어를 보고서로 정리해 드립니다.",
                  url: SITE_URL,
                  applicationCategory: "BusinessApplication",
                  operatingSystem: "Web",
                  offers: {
                    "@type": "Offer",
                    price: "0",
                    priceCurrency: "USD",
                  },
                  featureList: [
                    "BMC (Business Model Canvas) 자동 생성",
                    "Lean Canvas 자동 생성",
                    "SWOT / PESTEL / PERSONA 분석",
                    "AI 마인드맵 무한 노드 확장",
                    "BYOK (Bring Your Own Key) 모델",
                    "OPML / PDF 내보내기",
                  ],
                  inLanguage: ["ko", "en", "ja"],
                  creator: { "@id": `${SITE_URL}/#organization` },
                },
                {
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  name: "aib",
                  url: SITE_URL,
                  description:
                    "AI를 실제 의사결정 현장에서 쓰이는 도구로 만드는 한국의 팀. MindBusiness 개발사.",
                },
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#website`,
                  url: SITE_URL,
                  name: "MindBusiness",
                  publisher: { "@id": `${SITE_URL}/#organization` },
                  inLanguage: "ko-KR",
                },
              ],
            }),
          }}
        />
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

