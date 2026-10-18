'use client';
import { useEffect, useState, useRef } from 'react';
import { Brand } from '../../ui';
import styles from '../catalog/catalog.module.css';
type Overview = {
  paused: boolean;
  workerHealthy: boolean;
  worker: { lastSeenAt: string; provider: string } | null;
  realSending: boolean;
  automaticSending: boolean;
  total: number;
  deliveries: {
    id: string;
    status: string;
    source: string;
    provider: string;
    attempts: number;
    errorKind: string | null;
    createdAt: string;
  }[];
  metaConnection: { expiresAt: string; status: string } | null;
  sendboxConnection: { expiresAt: string } | null;
};
const labels: Record<string, string> = {
  pending: 'در صف',
  preparing: 'در حال آماده‌سازی',
  sending: 'در حال ارسال',
  unknown: 'نتیجه نامعلوم',
  failed: 'خطا',
  expired: 'مهلت گذشته',
  skipped: 'ردشده',
  simulated: 'شبیه‌سازی',
  accepted: 'درخواست پذیرفته‌شده',
  delivered: 'تحویل تأییدشده',
};
function expiry(value: string) {
  const days = Math.ceil((Date.parse(value) - Date.now()) / 86400_000);
  return days <= 0
    ? 'منقضی؛ اتصال دوباره لازم است.'
    : days <= 7
      ? `هشدار انقضا: ${days.toLocaleString('fa-IR')} روز مانده.`
      : `اعتبار: ${days.toLocaleString('fa-IR')} روز.`;
}
export default function OperationsPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [status, setStatus] = useState('');
  const [days, setDays] = useState('30');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [revision, setRevision] = useState(0);
  const query = new URLSearchParams({ status, days, page: String(page) }).toString();
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/admin/operations?' + query, { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setData(await r.json());
        setMessage('');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage('دریافت گزارش کامل نشد؛ نشست ورود و اتصال را بررسی کن.');
      });
    return () => controller.abort();
  }, [query, revision]);
  async function toggle() {
    if (!data || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !data.paused }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error();
      setData({ ...data, paused: !data.paused });
      setMessage('وضعیت توقف ذخیره شد.');
    } catch {
      setMessage('تغییر وضعیت تأیید نشد؛ دوباره بررسی کن.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="مدیریت">
          <a href="/admin">نمای کلی</a>
          <a href="/admin/catalog">محصولات</a>
          <a href="/admin/operations" aria-current="page">
            عملیات و گزارش
          </a>
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>وضعیت واقعی، تصمیم روشن</span>
            <h1>مرکز عملیات.</h1>
            <p>این گزارش مربوط به مسیر آزمایشی مدیر است؛ پنل مشتری‌های مستقل هنوز فعال نشده است.</p>
          </div>
          <div className={styles.note}>
            <strong>{data?.paused ? 'پردازش ارسال متوقف است' : 'کنترل ارسال'}</strong>
            <p>
              توقف اضطراری جلوی شروع ارسال بعدی worker را می‌گیرد. درخواست در حال اجرا قابل پس‌گرفتن
              نیست. ازسرگیری، مجوزهای متا یا کلیدهای ارسال سرور را فعال نمی‌کند.
            </p>
            <button disabled={!data || busy} onClick={() => void toggle()}>
              {data?.paused ? 'ازسرگیری worker' : 'توقف اضطراری worker'}
            </button>
          </div>
        </div>
        <p role="status" className={styles.message}>
          {message}
        </p>
        <div className={styles.columns}>
          <section className={styles.panel}>
            <h2>پردازش پس‌زمینه</h2>
            <p>
              {data?.workerHealthy
                ? 'heartbeat تازه دریافت شده است.'
                : 'worker دائمیِ سالم تأیید نشده است.'}
            </p>
            <p>
              ارسال واقعی متا: {data?.realSending ? 'فعال در تنظیمات سرور' : 'غیرفعال'} · اتوماسیون:{' '}
              {data?.automaticSending ? 'فعال در تنظیمات سرور' : 'غیرفعال'}
            </p>
            <p>
              پذیرفته‌شدن درخواست با تحویل پیام یکسان نیست؛ نتیجهٔ نامعلوم خودکار تکرار نمی‌شود.
            </p>
          </section>
          <section className={styles.panel}>
            <h2>اعتبار اتصال</h2>
            <p>
              متا:{' '}
              {data?.metaConnection ? expiry(data.metaConnection.expiresAt) : 'اتصالی ثبت نشده.'}
            </p>
            <p>
              Sendbox:{' '}
              {data?.sendboxConnection
                ? expiry(data.sendboxConnection.expiresAt)
                : 'اتصالی ثبت نشده.'}
            </p>
            <p>هشدارها داخل همین پنل‌اند؛ ارسال ایمیل یا پیامک فعال نشده است.</p>
          </section>
        </div>
        <section className={styles.panel}>
          <div className={styles.sectionTitle}>
            <span>گزارش ارسال‌ها · بدون متن خصوصی پیام</span>
            <h2>{data ? data.total.toLocaleString('fa-IR') : '…'} نتیجه</h2>
          </div>
          <div className={styles.toolbar}>
            <label>
              وضعیت
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">همه</option>
                {Object.entries(labels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              بازه
              <select
                value={days}
                onChange={(e) => {
                  setDays(e.target.value);
                  setPage(1);
                }}
              >
                <option value="1">یک روز</option>
                <option value="7">۷ روز</option>
                <option value="30">۳۰ روز</option>
                <option value="90">۹۰ روز</option>
              </select>
            </label>
            <button className={styles.secondary} onClick={() => setRevision((v) => v + 1)}>
              به‌روزرسانی
            </button>
            <a className={styles.link} href={'/api/admin/operations?' + query + '&format=csv'}>
              خروجی CSV (تا ۱۰۰۰ ردیف)
            </a>
          </div>
          {data?.deliveries.map((d) => (
            <article className={styles.product} key={d.id}>
              <strong>{labels[d.status] ?? d.status}</strong>
              <p>
                {d.provider} · {d.source} · تعداد تلاش: {d.attempts.toLocaleString('fa-IR')} ·{' '}
                {new Date(d.createdAt).toLocaleString('fa-IR')}
              </p>
              {d.errorKind && <p>نوع خطا: {d.errorKind}</p>}
              <small dir="ltr">{d.id}</small>
            </article>
          ))}
          {!data?.deliveries.length && (
            <p className={styles.empty}>در این فیلتر گزارشی وجود ندارد.</p>
          )}
          <div className={styles.inline}>
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              قبلی
            </button>
            <span>صفحهٔ {page.toLocaleString('fa-IR')}</span>
            <button
              disabled={!data || page * 50 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              بعدی
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
