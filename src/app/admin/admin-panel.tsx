'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Brand } from '../ui';
import LoginScreen from '../login-screen';
import styles from './admin.module.css';
import ServiceOverview from './service-overview';
type Data = {
  configured: boolean;
  connection: { username: string; expiresAt: string } | null;
  eventCount: number;
  events: { eventId: string; eventType: string; receivedAt: string }[];
  jobs: {
    id: string;
    workspace: string;
    username: string;
    status: string;
    kind: string;
    errorKind: string | null;
    createdAt: string;
  }[];
};
const status: Record<string, string> = {
  pending: 'در صف',
  sending: 'در حال ارسال',
  accepted: 'متا پذیرفت',
  unknown: 'نتیجه نامعلوم',
  failed: 'ناموفق',
  skipped: 'متوقف‌شده',
  expired: 'مهلت گذشته',
};
const date = (v: string) =>
  new Intl.DateTimeFormat('fa-IR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(v));
export default function AdminPanel() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(''),
    [needsLogin, setNeedsLogin] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin', {
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      if (r.status === 401) {
        setNeedsLogin(true);
        return;
      }
      if (!r.ok) throw Error();
      setData(await r.json());
    } catch {
      setNotice('دریافت وضعیت کامل نشد؛ دوباره امتحان کن.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function logout() {
    const r = await fetch('/api/proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"action":"logout"}',
    });
    if (r.ok) setNeedsLogin(true);
    else setNotice('خروج کامل نشد.');
  }
  if (needsLogin) return <LoginScreen destination="/admin" />;
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Brand />
        <nav aria-label="بخش‌های مدیریت">
          <a href="/admin" aria-current="page">
            ◈ نمای کلی سرویس
          </a>
          <a href="/admin/users">کاربران و دسترسی‌ها</a>
          <a href="/dashboard/instagram">اتصال مستقیم Instagram</a>
          <a href="/dashboard/instagram?tab=inbox">صندوق پیام پیج من</a>
          <a href="/dashboard/instagram?tab=automations">اتوماسیون پیج من</a>
          <a href="/admin/catalog">کاتالوگ مدیر</a>
          <a href="/admin/analytics">تحلیل محصولات</a>
          <a href="/admin/operations">عملیات و توقف اضطراری</a>
          <a href="/proof">آزمایش فنی قدیمی</a>
        </nav>
        <button className={styles.logout} onClick={() => void logout()}>
          خروج ↗
        </button>
      </aside>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1>اتاق کنترل</h1>
            <p>مشتری‌ها، اتصال‌ها و نتیجهٔ واقعی ارسال.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.outline} disabled={loading} onClick={() => void load()}>
              {loading ? 'بررسی…' : 'تازه‌سازی'}
            </button>
            <a href="/signup" className={styles.outline}>
              صفحهٔ ثبت‌نام عمومی ↗
            </a>
          </div>
        </header>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        <ServiceOverview />
        <section className={styles.welcome}>
          <Image
            className={styles.bannerArt}
            src="/images/admin-banner-v2.webp"
            width={400}
            height={360}
            alt=""
          />
          <div className={styles.welcomeContent}>
            <h2>متصل به مسیر رسمی متا.</h2>
            <p>
              {data?.configured
                ? 'اپ AiDirect روی سرور تنظیم شده است. هر فروشگاه از حساب خودش پیج را متصل می‌کند.'
                : 'تنظیم اپ متا روی سرور هنوز کامل نیست.'}
            </p>
            <div className={styles.welcomeActions}>
              <a className={styles.darkButton} href="/dashboard/instagram">
                اتصال پیج خودم ↗
              </a>
              <a className={styles.darkOutline} href="/admin/users">
                مدیریت مشتری‌ها
              </a>
              <a className={styles.darkOutline} href="/dashboard/instagram?tab=automations">
                ساخت اتوماسیون
              </a>
            </div>
          </div>
        </section>
        <div className={styles.panels}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>ثبت‌نام، بدون ارسال رمز مدیر.</h2>
            </div>
            <p>
              مشتری از صفحهٔ عمومی حساب AiDirect می‌سازد؛ کاتالوگ، اتصال، گفتگو و گزارش به workspace
              همان مشتری محدودند.
            </p>
            <p>
              ثبت‌نام عمومی سایت، محدودیت App Review متا را برنمی‌دارد. حساب Instagram باید حرفه‌ای
              و تا قبل از دسترسی عمومی، مجاز به تست اپ باشد.
            </p>
            <a className={styles.yellowButton} href="/signup">
              نمایش صفحهٔ ثبت‌نام ↗
            </a>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>آخرین رویدادهای متا</h2>
              <span>{data?.eventCount.toLocaleString('fa-IR') ?? '—'}</span>
            </div>
            {data?.events.length ? (
              data.events.map((event) => (
                <div className={styles.notice} key={event.eventId}>
                  <strong>
                    {event.eventType === 'instagram_processed'
                      ? 'پردازش شد'
                      : event.eventType === 'instagram_pending'
                        ? 'در صف دریافت'
                        : 'نیازمند بررسی'}
                  </strong>
                  <p>{date(event.receivedAt)}</p>
                </div>
              ))
            ) : (
              <p>هنوز رویدادی برای اتصال‌های مستقیم مشتری‌ها ثبت نشده است.</p>
            )}
          </section>
        </div>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>آخرین ارسال‌های فروشگاه‌ها</h2>
          </div>
          {data?.jobs.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  minWidth: 560,
                  textAlign: 'right',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    <th>فروشگاه</th>
                    <th>مسیر</th>
                    <th>وضعیت</th>
                    <th>زمان</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((job) => (
                    <tr key={job.id}>
                      <td style={{ padding: '18px 8px' }}>
                        {job.workspace}
                        <br />
                        <bdi>@{job.username}</bdi>
                      </td>
                      <td>
                        {job.kind === 'private_reply'
                          ? 'پاسخ خصوصی کامنت'
                          : job.kind === 'dm_auto'
                            ? 'پاسخ‌گوی محصول'
                            : 'پاسخ دستی'}
                      </td>
                      <td>
                        {status[job.status] ?? job.status}
                        {job.errorKind && (
                          <small style={{ display: 'block' }}>{job.errorKind}</small>
                        )}
                      </td>
                      <td>{date(job.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>هنوز تلاشی ثبت نشده است. هیچ ارسال یا فروش نمونه‌ای به آمار اضافه نمی‌شود.</p>
          )}
        </section>
        <footer className={styles.footer}>
          پذیرش API به معنی تحویل قطعی نیست. متن خصوصی دایرکت مشتری‌ها در این نمای مدیریتی نمایش
          داده نمی‌شود. BoxAPI در مسیر فعلی استفاده نمی‌شود.
        </footer>
      </main>
    </div>
  );
}
