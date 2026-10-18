import type { MetadataRoute } from 'next';
import { publicIndexingAllowed, siteOrigin } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  // Crawlers must be able to read the noindex tags on private/login pages.
  // Authentication, not robots.txt, protects customer and operator data.
  return {
    rules: { userAgent: '*', allow: '/' },
    ...(publicIndexingAllowed() ? { sitemap: `${siteOrigin}/sitemap.xml` } : {}),
  };
}
