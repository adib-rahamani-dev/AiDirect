'use client';
import { useState, type ReactNode } from 'react';
import { Brand } from '../ui';
import styles from './dashboard.module.css';
const links = [
  ['/dashboard', '◈', 'خانه'],
  ['/dashboard/instagram', '◎', 'اینستاگرام'],
  ['/dashboard/instagram?tab=inbox', '↗', 'صندوق پیام'],
  ['/dashboard/instagram?tab=automations', '⌘', 'اتوماسیون'],
  ['/dashboard/catalog', '▦', 'محصولات'],
  ['/dashboard/analytics', '◴', 'آمار و تحلیل'],
  ['/dashboard/reports', '≡', 'گزارش ارسال‌ها'],
  ['/dashboard/subscription', '◷', 'اشتراک و مصرف'],
  ['/dashboard/features', '✧', 'امکانات'],
  ['/dashboard/website-development', '◇', 'توسعه وب‌سایت'],
  ['/dashboard/settings', '⚙', 'تنظیمات'],
] as const;
const adminLinks = [
  ['/admin', '◈', 'مرکز مدیریت'],
  ['/admin/users', '♙', 'کاربران و دسترسی‌ها'],
  ['/dashboard/instagram', '◎', 'اینستاگرام'],
  ['/dashboard/instagram?tab=inbox', '↗', 'صندوق پیام'],
  ['/dashboard/subscription', '◷', 'اشتراک و مصرف'],
  ['/admin/catalog', '▦', 'محصولات'],
  ['/admin/analytics', '◴', 'آمار و تحلیل'],
  ['/dashboard/reports', '≡', 'گزارش ارسال‌ها'],
  ['/dashboard/features', '✧', 'امکانات'],
  ['/dashboard/website-development', '◇', 'توسعه وب‌سایت'],
] as const;
export default function DashboardShell({
  children,
  active = 'خانه',
  title = 'فضای فروشگاه',
  subtitle = 'هر گفت‌وگو، یک فرصت برای راهنمایی بهتر.',
  owner = false,
}: {
  children: ReactNode;
  active?: string;
  title?: string;
  subtitle?: string;
  owner?: boolean;
}) {
  const target = (href: string) =>
    !owner
      ? href
      : href === '/dashboard'
        ? '/admin'
        : href === '/dashboard/catalog'
          ? '/admin/catalog'
          : href === '/dashboard/analytics'
            ? '/admin/analytics'
            : href === '/dashboard/settings'
              ? '/admin/users'
              : href;
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw Error();
      const owner = await fetch('/api/proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
        signal: AbortSignal.timeout(15000),
      });
      if (!owner.ok && owner.status !== 401) throw Error();
      window.location.assign('/login');
    } catch {
      setNotice('خروج کامل نشد؛ دوباره امتحان کن.');
      setBusy(false);
    }
  }
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Brand />
        <div className={styles.sideLabel}>میز کار فروشگاه</div>
        <nav aria-label="ناوبری فروشگاه">
          {(owner ? adminLinks : links).map(([href, icon, label]) => (
            <a href={target(href)} key={label} aria-current={active === label ? 'page' : undefined}>
              <span aria-hidden="true">{icon}</span>
              {label}
              {label === 'توسعه وب‌سایت' && <small className={styles.soon}>به‌زودی</small>}
            </a>
          ))}
        </nav>
        <div className={styles.sideFoot}>
          <span className={styles.liveDot} />
          اتصال رسمی Meta<p>کنترل پیج همیشه دست توست.</p>
          <button disabled={busy} onClick={() => void logout()}>
            خروج از حساب ↗
          </button>
        </div>
      </aside>
      <div className={styles.stage}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.kicker}>AIDIRECT / WORKSPACE</span>
            <strong>{title}</strong>
          </div>
          <a className={styles.support} href={owner ? '/admin' : '/dashboard/settings'}>
            حساب من <span>↖</span>
          </a>
          <details className={styles.mobileMenu}>
            <summary>همهٔ بخش‌ها ☰</summary>
            <nav aria-label="همهٔ بخش‌های پنل">
              {(owner ? adminLinks : links).map(([href, icon, label]) => (
                <a
                  key={label}
                  href={target(href)}
                  aria-current={active === label ? 'page' : undefined}
                >
                  <span aria-hidden="true">{icon}</span> {label}
                  {label === 'توسعه وب‌سایت' ? ' · به‌زودی' : ''}
                </a>
              ))}
            </nav>
          </details>
        </header>
        <main className={styles.main}>
          <p className={styles.subtitle}>{subtitle}</p>
          {notice && (
            <p role="alert" className={styles.notice}>
              {notice}
            </p>
          )}
          {children}
        </main>
        <nav className={styles.mobileNav} aria-label="ناوبری موبایل">
          {(owner ? adminLinks : links).slice(0, 5).map(([href, icon, label]) => (
            <a key={label} href={target(href)} aria-current={active === label ? 'page' : undefined}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
