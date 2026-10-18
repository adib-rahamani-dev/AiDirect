import './globals.css';
import './access.css';
import '@fontsource-variable/estedad';
import type { Metadata } from 'next';
import { noIndex, siteName, siteOrigin } from '@/lib/seo';
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: 'AiDirect — از کامنت تا گفتگو', template: '%s | AiDirect' },
  applicationName: siteName,
  description: 'فضای آزمایشی اتصال رسمی اینستاگرام و پاسخ خصوصی به کامنت',
  robots: noIndex,
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION?.trim() || undefined },
  formatDetection: { telephone: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
