'use client';
import { useEffect, useState } from 'react';
import DashboardShell from '../dashboard-shell';
import styles from '../service.module.css';
type Row = {
  id: string;
  kind: string;
  status: string;
  errorKind: string | null;
  intent: string;
  aiAttempted: boolean;
  aiSucceeded: boolean;
  attempts: number;
  responseMs: number | null;
  createdAt: string;
};
const labels: Record<string, string> = {
  pending: 'در صف',
  sending: 'در حال ارسال',
  accepted: 'پذیرش API',
  unknown: 'نتیجهٔ نامعلوم',
  failed: 'ناموفق',
  skipped: 'متوقف',
  expired: 'مهلت گذشته',
  dm_auto: 'پاسخ خودکار دایرکت',
  dm_manual: 'پاسخ دستی',
  private_reply: 'پاسخ خصوصی کامنت',
};
export default function ReportsPanel({ owner = false }: { owner?: boolean }) {
  const [data, setData] = useState<{ rows: Row[]; total: number; page: number } | null>(null),
    [status, setStatus] = useState(''),
    [kind, setKind] = useState(''),
    [days, setDays] = useState('30'),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const query = new URLSearchParams({ status, kind, days, page: String(page) }).toString();
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    void fetch('/api/customer/reports?' + query, {
      cache: 'no-store',
      signal: AbortSignal.any([c.signal, AbortSignal.timeout(15000)]),
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        setData(await r.json());
      })
      .catch(() => {
        if (!c.signal.aborted) {
          setData(null);
          setError('گزارش دریافت نشد. دوباره تلاش کن.');
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [query, revision]);
  return (
    <DashboardShell
      owner={owner}
      active="گزارش ارسال‌ها"
      title="گزارش ارسال‌ها"
      subtitle="چه چیزی ارسال شد، چه چیزی متوقف ماند و کدام نتیجه هنوز روشن نیست."
    >
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>ACTIVITY / DELIVERY LOG</span>
          <h1>نتیجهٔ هر پاسخ، روشن.</h1>
          <p>گزارش فقط متعلق به همین فروشگاه است؛ متن خصوصی مخاطب در خروجی قرار نمی‌گیرد.</p>
        </div>
        <button disabled={loading} onClick={() => setRevision((v) => v + 1)}>
          {loading ? 'در حال دریافت…' : 'تازه‌سازی ↻'}
        </button>
      </div>
      <div className={styles.toolbar}>
        <select
          aria-label="بازهٔ گزارش"
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setPage(1);
          }}
        >
          <option value="1">۲۴ ساعت گذشته</option>
          <option value="7">۷ روز</option>
          <option value="30">۳۰ روز</option>
          <option value="90">۹۰ روز</option>
        </select>
        <select
          aria-label="وضعیت ارسال"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">همهٔ وضعیت‌ها</option>
          {['pending', 'sending', 'accepted', 'unknown', 'failed', 'skipped', 'expired'].map(
            (s) => (
              <option value={s} key={s}>
                {labels[s]}
              </option>
            ),
          )}
        </select>
        <select
          aria-label="نوع پاسخ"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
        >
          <option value="">همهٔ پاسخ‌ها</option>
          {['dm_auto', 'dm_manual', 'private_reply'].map((s) => (
            <option value={s} key={s}>
              {labels[s]}
            </option>
          ))}
        </select>
        <a className={styles.link} href={'/api/customer/reports?' + query + '&format=csv'}>
          CSV نتایج فیلترشده ↓
        </a>
      </div>
      {error && (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      )}
      <p className={styles.muted}>
        {data ? data.total.toLocaleString('fa-IR') : '…'} نتیجه · خروجی CSV حداکثر ۵۰۰ نتیجهٔ تازهٔ
        همین فیلتر را می‌دهد؛ مستقل از صفحهٔ جدول.
      </p>
      <div className={styles.tableWrap} aria-busy={loading}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>زمان و نوع</th>
              <th>وضعیت</th>
              <th>نیت / خطا</th>
              <th>پردازش</th>
              <th>تلاش</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {labels[r.kind] ?? r.kind}
                  <small>
                    {new Date(r.createdAt).toLocaleString('fa-IR', {
                      timeZone: 'Asia/Tehran',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </small>
                </td>
                <td>
                  <span
                    className={styles.badge}
                    data-state={r.status === 'accepted' ? 'ready' : 'pilot'}
                  >
                    {labels[r.status] ?? r.status}
                  </span>
                </td>
                <td>
                  <code>{r.intent}</code>
                  {r.errorKind && (
                    <small>
                      <code>{r.errorKind}</code>
                    </small>
                  )}
                </td>
                <td>
                  {r.aiAttempted
                    ? r.aiSucceeded
                      ? 'استخراج AI موفق'
                      : 'تلاش AI ناموفق'
                    : 'بدون تلاش AI'}
                  <small>
                    {r.responseMs === null
                      ? 'زمان ثبت نشده'
                      : `${(r.responseMs / 1000).toLocaleString('fa-IR')} ثانیه`}
                  </small>
                </td>
                <td>{r.attempts.toLocaleString('fa-IR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.rows.length && (
          <p className={styles.empty}>در این بازه و فیلتر، پاسخی ثبت نشده است.</p>
        )}
      </div>
      <div className={styles.toolbar}>
        <button disabled={loading || page === 1} onClick={() => setPage((v) => v - 1)}>
          قبلی
        </button>
        <span className={styles.muted}>صفحهٔ {page.toLocaleString('fa-IR')}</span>
        <button
          disabled={loading || !data || page * 25 >= data.total}
          onClick={() => setPage((v) => v + 1)}
        >
          بعدی
        </button>
      </div>
      <p className={styles.alert}>
        پذیرش API به معنی تحویل، خواندن یا خرید نیست. نتیجهٔ نامعلوم خودکار تکرار نمی‌شود؛ از تکرار
        دستی بدون بررسی خودداری کن.
      </p>
    </DashboardShell>
  );
}
