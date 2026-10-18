'use client';
import { useEffect, useState } from 'react';
import { Brand } from '../ui';
import styles from '../admin/catalog/catalog.module.css';
type Data = {
  user: { name: string; email: string; emailVerified: boolean; role: string };
  workspace: { name: string; paused: boolean };
  stats: { pages: number; products: number };
};
export default function CustomerPanel() {
  const [data, setData] = useState<Data | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    void fetch('/api/customer', { signal: c.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setData(await r.json());
      })
      .catch(() => {
        if (!c.signal.aborted) setMessage('دریافت پنل کامل نشد؛ دوباره وارد شو.');
      });
    return () => c.abort();
  }, []);
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error();
      window.location.assign('/login');
    } catch {
      setMessage('خروج تأیید نشد؛ دوباره تلاش کن.');
      setBusy(false);
    }
  }
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="فضای فروشگاه">
          <a href="/dashboard" aria-current="page">
            پنل من
          </a>
          <a href="/dashboard/catalog">محصولات</a>
          <a href="/dashboard/settings">تنظیمات حساب</a>
          {data?.user.role === 'SENIOR_ADMIN' && <a href="/admin/users">مدیریت کاربران</a>}
          <button className={styles.secondary} disabled={busy} onClick={() => void logout()}>
            خروج
          </button>
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>فضای مستقل فروشگاه تو</span>
            <h1>
              {data ? `${data.user.name}،` : 'سلام،'}
              <br />
              <em>خوش آمدی.</em>
            </h1>
            <p>محصولاتت را مرتب کن و قبل از اتصال دایرکت، پیشنهادها را اینجا امتحان کن.</p>
          </div>
          <div className={styles.note}>
            <span>قدم بعد</span>
            <strong>ویترینت را بساز</strong>
            <p>یک پیج برای کاتالوگ تعریف کن، محصول اضافه کن و یک پیام آزمایشی بفرست.</p>
            <a className={styles.link} href="/dashboard/catalog">
              رفتن به محصولات ←
            </a>
          </div>
        </div>
        <p role="status" className={styles.message}>
          {message}
        </p>
        <div className={styles.columns}>
          <section className={styles.panel}>
            <span className={styles.eyebrow}>کاتالوگ من</span>
            <h2>{data?.stats.products.toLocaleString('fa-IR') ?? '…'} محصول</h2>
            <p>
              {data?.stats.pages.toLocaleString('fa-IR') ?? '…'} پیج کاتالوگ ·{' '}
              {data?.workspace.paused ? 'پیشنهادها متوقف‌اند' : 'آمادهٔ تست پیشنهاد'}
            </p>
            <a href="/dashboard/catalog" className={styles.link}>
              مدیریت محصولات و ارتباط پست‌ها
            </a>
          </section>
          <section className={styles.panel}>
            <span className={styles.eyebrow}>حساب من</span>
            <h2>{data?.workspace.name ?? 'فضای فروشگاه'}</h2>
            <p dir="ltr">{data?.user.email}</p>
            <p>
              {data?.user.emailVerified
                ? 'ایمیل تأییدشده'
                : 'ایمیل هنوز تأیید نشده است؛ ارسال ایمیل تأیید و بازیابی رمز فعلاً فعال نیست.'}
            </p>
          </section>
        </div>
        <section className={styles.panel}>
          <h2>اتصال اینستاگرام</h2>
          <p>
            اتصال مستقل Instagram برای مشتری‌ها در این مرحله فعال نشده است. هیچ رمز اینستاگرامی
            دریافت نمی‌کنیم و پیج کاتالوگ به معنی اتصال رسمی نیست.
          </p>
          <p>
            ساخت اتوماسیون ارسال و گزارش دایرکت پس از تأیید مسیر واقعی به همین فضای کاری اضافه
            می‌شود.
          </p>
        </section>
      </main>
    </div>
  );
}
