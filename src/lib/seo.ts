import type { Metadata } from 'next';

const fallbackOrigin = 'https://aidirect-kappa.vercel.app';
type SiteEnvironment = {
  [key: string]: string | undefined;
  SITE_URL?: string;
  APP_BASE_URL?: string;
  VERCEL_ENV?: string;
};

export function resolveSiteOrigin(env: SiteEnvironment) {
  const value = env.SITE_URL || env.APP_BASE_URL || fallbackOrigin;
  const url = new URL(value);
  if (!env.SITE_URL && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    return fallbackOrigin;
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.port ||
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error('SITE_URL must be a public HTTPS origin');
  return url.origin;
}

export const siteOrigin = resolveSiteOrigin(process.env);
export const siteName = 'AiDirect';
export const noIndex: Metadata['robots'] = { index: false, follow: false };
export function publicIndexingAllowed(env: SiteEnvironment = process.env) {
  return !['preview', 'development'].includes(env.VERCEL_ENV ?? '');
}

export const publicPages = [
  {
    path: '/',
    title: 'کامنت به دایرکت اینستاگرام | AiDirect',
    description:
      'AiDirect، پروژهٔ آزمایشی کامنت به دایرکت اینستاگرام با کلمهٔ محرک و پاسخ آماده. نمونهٔ تعاملی را ببینید؛ ارسال خودکار هنوز فعال نیست.',
    updated: '2026-10-18',
  },
  {
    path: '/instagram-comment-to-dm',
    title: 'کامنت به دایرکت اینستاگرام چگونه کار می‌کند؟',
    description:
      'راهنمای کامنت به دایرکت: کلمهٔ محرک، پاسخ خصوصی، اتصال پیج حرفه‌ای و تفاوت نمونهٔ نمایشی با ارسال واقعی؛ همراه با وضعیت فعلی AiDirect.',
    updated: '2026-10-18',
  },
] as const;

export function publicPageMetadata(path: (typeof publicPages)[number]['path']): Metadata {
  const page = publicPages.find((item) => item.path === path)!;
  const title = path === '/' ? { absolute: page.title } : page.title;
  const image = {
    url: '/opengraph-image',
    width: 1200,
    height: 630,
    alt: 'AiDirect؛ از کامنت تا گفتگو، نسخهٔ آزمایشی',
  };
  return {
    title,
    description: page.description,
    alternates: { canonical: path },
    robots: publicIndexingAllowed()
      ? { index: true, follow: true, 'max-image-preview': 'large' }
      : noIndex,
    openGraph: {
      type: 'website',
      locale: 'fa_IR',
      siteName,
      title: page.title,
      description: page.description,
      url: path,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: page.description,
      images: [image],
    },
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export const websiteStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: siteName,
  alternateName: 'ای‌دایرکت',
  url: siteOrigin + '/',
  inLanguage: 'fa-IR',
};
