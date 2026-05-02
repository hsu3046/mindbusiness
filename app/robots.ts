import type { MetadataRoute } from 'next'

const SITE_URL = 'https://aib.vote'

/**
 * Robots policy.
 *
 * Public surface = the marketing/about pages. The /map session URLs are
 * one-shot user-specific tools that don't carry SEO value (and would create
 * crawl noise), so they're disallowed. /api/* is server-only.
 *
 * AI crawlers are explicitly allowed to index the public pages so that
 * Perplexity / ChatGPT / Google AI Overviews can cite MindBusiness.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/map', '/api/'],
      },
      // Generative-AI crawlers — keep public pages discoverable.
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
