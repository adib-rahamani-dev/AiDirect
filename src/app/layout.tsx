import './globals.css';
import './access.css';
import '@fontsource-variable/estedad';
export const metadata = {
  title: 'AiDirect — از کامنت تا گفتگو',
  description: 'فضای آزمایشی اتصال رسمی اینستاگرام و پاسخ خصوصی به کامنت',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
