import type { ReactNode } from 'react';
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="AiDirect، صفحهٔ اصلی">
      <span className="brand-mark" aria-hidden="true">
        ↗
      </span>
      <span dir="ltr">
        ai<span className="brand-light">direct</span>
        <span className="brand-dot">.</span>
      </span>
    </a>
  );
}
export function Section({
  id,
  number,
  title,
  description,
  children,
}: {
  id: string;
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="card" id={id}>
      <div className="section-heading">
        <span className="step-number">{number}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="اطلاعات حقوقی">
      <a href="/privacy">حریم خصوصی</a>
      <span>·</span>
      <a href="/data-deletion">حذف داده‌ها</a>
      <span>·</span>
      <a href="/guide">راهنمای شروع</a>
      <span>·</span>
      <a href="/sendbox">اتصال Sendbox</a>
    </nav>
  );
}
