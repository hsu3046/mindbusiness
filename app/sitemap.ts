import type { MetadataRoute } from 'next'

const SITE_URL = 'https://aib.vote'

/**
 * XML sitemap for indexable public pages. /map (session-specific) and /api
 * (server) are intentionally omitted.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]
}
