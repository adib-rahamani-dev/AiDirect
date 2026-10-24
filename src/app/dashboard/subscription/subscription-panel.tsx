'use client';
import { useEffect, useState } from 'react';
import DashboardShell from '../dashboard-shell';
import styles from '../service.module.css';
import type { workspaceSubscription } from '@/lib/service-billing';
type Data = Awaited<ReturnType<typeof workspaceSubscription>>;
type JsonData = Omit<Data, 'workspace' | 'period'> & {
  workspace: Omit<Data['workspace'], 'createdAt'> & { createdAt: string };
  period: { start: string; end: string };
};
export default function SubscriptionPanel({ owner = false }: { owner?: boolean }) {
  const [data, setData] = useState<JsonData | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void fetch('/api/customer/subscription', {
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        setData(await r.json());
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('مصرف دریافت نشد. دوباره تلاش کن.');
      });
    return () => controller.abort();
  }, [revision]);
  const date = (v: string) =>
    new Date(v).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'long' });
  return (
    <DashboardShell
      owner={owner}
      active="اشتراک و مصرف"
      title="اشتراک فروشگاه"
      subtitle="دورهٔ ماهانه، مصرف روشن و بدون هزینهٔ پنهان."
    >
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>AIDIRECT / MEMBERSHIP</span>
          <h1>فعلاً مهمان مایی.</h1>
          <p>اشتراک ماهانه در این مرحله رایگان است. کارت بانکی و پرداخت لازم نیست.</p>
        </div>
        <a className={styles.link} href="/dashboard/features">
          همهٔ امکانات ←
        </a>
      </div>
      {error && (
        <div role="alert" className={styles.alert}>
          {error} <button onClick={() => setRevision((v) => v + 1)}>تلاش مجدد</button>
        </div>
      )}
      <div className={styles.two}>
        <section className={styles.card}>
          <span className={styles.badge} data-state="ready">
            ماهانهٔ رایگان
          </span>
          <div className={styles.price}>
            ۰ <small>تومان / ماه</small>
          </div>
          <p>
            بدون تمدید پولی خودکار. هر طرح پولی آینده، قیمت روشن و خرید جداگانهٔ خودت را لازم دارد.
          </p>
          <ul className={styles.list}>
            <li>
              <span>شروع دوره</span>
              <b>{data ? date(data.period.start) : '…'}</b>
            </li>
            <li>
              <span>پایان دورهٔ آماری</span>
              <b>{data ? date(data.period.end) : '…'}</b>
            </li>
            <li>
              <span>مبلغ برداشت بعدی</span>
              <b>صفر تومان</b>
            </li>
            <li>
              <span>وضعیت فروشگاه</span>
              <b>{data ? (data.workspace.paused ? 'متوقف‌شده' : 'دسترسی رایگان') : '…'}</b>
            </li>
          </ul>
          <p>
            دورهٔ آماری ماهانه از تاریخ ایجاد فروشگاه محاسبه می‌شود؛ فاکتور پرداخت نیست و پایان آن
            باعث پولی‌شدن خودکار نمی‌شود.
          </p>
        </section>
        <section className={styles.card}>
          <h2>مصرف و سقف آزمایش</h2>
          <p>
            سقف فعلی پاسخ، ۱۰۰ درخواست ارسال در ۲۴ ساعت لغزان است؛ این سقف ماهانه نیست و محدودیت
            Meta هم جدا اعمال می‌شود.
          </p>
          <progress
            aria-label="درخواست‌های ارسال در ۲۴ ساعت گذشته"
            className={styles.meter}
            max={100}
            value={data ? Math.min(100, data.usage.dailyJobs) : 0}
          />
          <p>
            {data ? data.usage.dailyJobs.toLocaleString('fa-IR') : '…'} از ۱۰۰ درخواست در ۲۴ ساعت
            گذشته
          </p>
          <ul className={styles.list}>
            <li>
              <span>پیج رسمی متصل</span>
              <b>{data ? `${data.connectedPages} / ۱` : '…'}</b>
            </li>
            <li>
              <span>محصول ثبت‌شده</span>
              <b>{data?.usage.products.toLocaleString('fa-IR') ?? '…'}</b>
            </li>
            <li>
              <span>فاکتور و برداشت وجه</span>
              <b>غیرفعال</b>
            </li>
          </ul>
          <a className={styles.link} href="/api/customer/subscription?format=csv">
            دریافت مصرف این دوره CSV ↓
          </a>
        </section>
      </div>
      <h2>گزارش همین دوره</h2>
      <div className={styles.grid}>
        {[
          ['ورودی تازه', data?.usage.inbound],
          ['درخواست ارسال', data?.usage.jobs],
          ['پذیرش API', data?.usage.accepted],
          ['نتیجهٔ نامعلوم', data?.usage.unknown],
        ].map(([label, count]) => (
          <div key={String(label)} className={styles.card}>
            <small>{label}</small>
            <strong>{typeof count === 'number' ? count.toLocaleString('fa-IR') : '…'}</strong>
          </div>
        ))}
      </div>
      <p className={styles.muted}>
        ورودی تازه، تاریخچهٔ واردشده را شامل نمی‌شود. پذیرش API به معنی خوانده‌شدن، تحویل یا خرید
        نیست. پرداخت اشتراک هنوز فعال نیست.
      </p>
    </DashboardShell>
  );
}
