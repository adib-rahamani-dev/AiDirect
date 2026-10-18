import { Brand } from './ui';
export const metadata = { title: 'صفحه پیدا نشد' };

export default function NotFound() {
  return (
    <>
      <header className="document-header">
        <Brand />
      </header>
      <main className="document-page">
        <span className="eyebrow">خطای ۴۰۴</span>
        <h1>این صفحه پیدا نشد.</h1>
        <p>ممکن است آدرس تغییر کرده باشد یا لینک را کامل وارد نکرده باشی.</p>
        <p>
          <a href="/">برگشت به صفحهٔ اصلی</a> ·{' '}
          <a href="/instagram-comment-to-dm">راهنمای کامنت به دایرکت</a>
        </p>
      </main>
    </>
  );
}
