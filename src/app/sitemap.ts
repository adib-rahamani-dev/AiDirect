import type { MetadataRoute } from 'next';
import { publicIndexingAllowed, publicPages, siteOrigin } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  if (!publicIndexingAllowed()) return [];
  return publicPages.map((page) => ({
    url: siteOrigin + (page.path === '/' ? '/' : page.path),
    lastModified: page.updated,
  }));
}
