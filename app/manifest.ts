import type { MetadataRoute } from 'next'

/**
 * PWA manifest. Icons should be supplied by the user — paths reference
 * /public/icon-192.png and /public/icon-512.png. Until those exist, the
 * manifest still validates but install banners may fall back to default
 * iconography.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MindBusiness — 비즈니스 전략 마인드맵',
    short_name: 'MindBusiness',
    description:
      '노트에 쓰듯 자유롭게 마인드맵을 만들고, 막힐 땐 AI가 새로운 방향을 제안해 드립니다.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafaf6',
    theme_color: '#1e293b',
    lang: 'ko',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
