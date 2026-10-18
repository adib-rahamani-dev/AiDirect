import type { ReactNode } from 'react';
import { Brand } from './ui';
import Image from 'next/image';

export function AccessIcon({ name }: { name: 'arrow' | 'lock' | 'eye' | 'instagram' | 'check' }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'arrow' && <path d="M19 12H5m6-6-6 6 6 6" />}
      {name === 'lock' && (
        <>
          <rect x="5" y="10" width="14" height="11" rx="3" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
        </>
      )}
      {name === 'eye' && (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
      {name === 'instagram' && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <path d="M17.5 6.5h.01" />
        </>
      )}
      {name === 'check' && <path d="m5 12 4 4L19 6" />}
    </svg>
  );
}
export default function AccessFrame({
  children,
  step = 'login',
  action,
}: {
  children: ReactNode;
  step?: 'login' | 'connect';
  action?: ReactNode;
}) {
  return (
    <div className="access-page">
      <header className="access-header">
        <Brand />
        <div className="access-header-end">
          <span className="access-edition">نسخهٔ آزمایشی</span>
          {action}
        </div>
      </header>
      <main className="access-layout">
        <section
          className="access-workspace"
          aria-label={step === 'login' ? 'ورود به فضای کار' : 'اتصال حساب اینستاگرام'}
        >
          <div className="access-progress" aria-label="مراحل اتصال">
            <span
              className={step === 'login' ? 'current' : 'complete'}
              aria-current={step === 'login' ? 'step' : undefined}
            >
              <b>۰۱</b> ورود به فضای کار
            </span>
            <i aria-hidden="true" />
            <span
              className={step === 'connect' ? 'current' : ''}
              aria-current={step === 'connect' ? 'step' : undefined}
            >
              <b>۰۲</b> اتصال اینستاگرام
            </span>
          </div>
          {children}
        </section>
        <aside className="access-editorial" aria-label="از کامنت تا گفتگو">
          <div className="editorial-topline">
            <span>یک کلمه، نقطهٔ شروع.</span>
            <span dir="ltr">COMMENT → CONVERSATION</span>
          </div>
          <h2>
            حرف از تو.
            <br />
            <span>ادامه‌اش، گفتگو.</span>
          </h2>
          <Image
            className="access-portrait"
            src="/images/creator-hero-v2.webp"
            width={1000}
            height={750}
            sizes="(max-width: 760px) 1px, 45vw"
            alt=""
          />
        </aside>
      </main>
      <footer className="access-footer">
        <span>فضایی برای گفتگوهای بعدی.</span>
        <nav aria-label="اطلاعات حقوقی">
          <a href="/privacy">حریم خصوصی</a>
          <a href="/data-deletion">حذف داده‌ها</a>
        </nav>
      </footer>
    </div>
  );
}
