'use client';
import { useEffect, useState } from 'react';
import DashboardShell from '../dashboard/dashboard-shell';
import styles from '../dashboard/service.module.css';
type WorkspaceRow = {
  id: string;
  name: string;
  paused: boolean;
  createdAt: string;
  connectionState: string;
  period: { start: string; end: string };
  _count: { memberships: number; pages: number };
  instagram: {
    username: string;
    status: string;
    expiresAt: string;
    subscribed: boolean;
    autoDm: boolean;
  } | null;
};
type Data = {
  role: 'SUPER_ADMIN' | 'SENIOR_ADMIN';
  now: string;
  periodSince: string;
  workspaces: WorkspaceRow[];
  total: number;
  page: number;
  stats: {
    users: number;
    registeredWeek: number;
    paused: number;
    connected: number;
    expiring: number;
    backlog: number;
    automations: number;
    products: number;
  };
  jobs: Record<string, number>;
  errors: { kind: string; count: number }[];
  audit: { id: string; action: string; createdAt: string }[];
  health: { database: string; worker: string; lastWorkerAt: string | null };
  signupEnabled: boolean;
  sendingEnabled: boolean;
};
const labels: Record<string, string> = {
  pending: 'در صف',
  preparing: 'آماده‌سازی',
  sending: 'در حال ارسال',
  accepted: 'پذیرش API',
  failed: 'ناموفق',
  unknown: 'نامعلوم',
  expired: 'مهلت گذشته',
  skipped: 'متوقف',
  connected: 'متصل',
  none: 'بدون اتصال',
  subscription_pending: 'نیازمند عضویت وبهوک',
  disconnected: 'قطع‌شده',
  revoked: 'دسترسی لغوشده',
};
const number = (v: number | undefined) => (v === undefined ? '…' : v.toLocaleString('fa-IR'));
const date = (v: string) =>
  new Date(v).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'medium' });
export default function ControlCenter() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(''),
    [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [state, setState] = useState('all'),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true);
  const query = new URLSearchParams({ q: search, state, page: String(page) }).toString();
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    void fetch('/api/admin/service?' + query, {
      cache: 'no-store',
      signal: AbortSignal.any([c.signal, AbortSignal.timeout(20000)]),
    })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            r.status === 403
              ? 'این بخش فقط برای مدیریت سرویس است.'
              : 'دریافت وضعیت کامل نشد؛ دوباره تلاش کن.',
          );
        setData(await r.json());
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setData(null);
          setError(e instanceof Error ? e.message : 'دریافت ناموفق بود.');
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [query, revision]);
  return (
    <DashboardShell
      owner
      active="مرکز مدیریت"
      title="مرکز مدیریت سرویس"
      subtitle="از وضعیت فروشگاه‌ها تا سلامت ارسال؛ با دادهٔ واقعی."
    >
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>AIDIRECT / CONTROL ROOM</span>
          <h1>همهٔ سرویس، زیر نگاه تو.</h1>
          <p>
            {data?.role === 'SENIOR_ADMIN' ? 'مدیر ارشد' : 'مدیر کل'} ·{' '}
            {data
              ? `آخرین دریافت ${new Date(data.now).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' })}`
              : 'در حال دریافت وضعیت…'}
          </p>
        </div>
        <div className={styles.actions}>
          <button disabled={loading} onClick={() => setRevision((v) => v + 1)}>
            {loading ? 'در حال دریافت…' : 'تازه‌سازی ↻'}
          </button>
          <a className={`${styles.link} ${styles.primary}`} href="/admin/users">
            مدیریت کاربران ←
          </a>
        </div>
      </div>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
      {data?.health.worker === 'missing' && (
        <p className={styles.alert} role="status">
          پردازشگر دائمی heartbeat تازه ندارد. وبهوک و پردازش درخواستی جای زمان‌بند دائمی را
          نمی‌گیرند؛ ارسال زمان‌بندی‌شدهٔ بدون وقفه تضمین نمی‌شود.
        </p>
      )}
      <div className={styles.grid}>
        {[
          ['حساب ثبت‌شده', data?.stats.users],
          ['ثبت‌نام هفت روز', data?.stats.registeredWeek],
          ['پیج رسمی متصل', data?.stats.connected],
          ['محصول ثبت‌شده', data?.stats.products],
          ['پذیرش API در ۳۰ روز', data ? (data.jobs.accepted ?? 0) : undefined],
          ['نتیجهٔ نامعلوم در ۳۰ روز', data ? (data.jobs.unknown ?? 0) : undefined],
          ['قانون روشن', data?.stats.automations],
          ['انقضا در هفت روز', data?.stats.expiring],
        ].map(([label, count]) => (
          <section className={styles.card} key={String(label)}>
            <small>{label}</small>
            <strong>{number(typeof count === 'number' ? count : undefined)}</strong>
          </section>
        ))}
      </div>
      <div className={styles.two}>
        <section className={styles.card}>
          <h2>نبض سرویس</h2>
          <ul className={styles.list}>
            <li>
              <span>دیتابیس</span>
              <b>{data ? 'پاسخ‌گو' : '—'}</b>
            </li>
            <li>
              <span>پردازشگر دائمی</span>
              <b>
                {data
                  ? data.health.worker === 'ready'
                    ? 'heartbeat تازه'
                    : 'نیازمند راه‌اندازی'
                  : '—'}
              </b>
            </li>
            <li>
              <span>وبهوک در انتظار پردازش</span>
              <b>{number(data?.stats.backlog)}</b>
            </li>
            <li>
              <span>ثبت‌نام عمومی</span>
              <b>{data ? (data.signupEnabled ? 'باز' : 'بسته') : '—'}</b>
            </li>
            <li>
              <span>اجازهٔ کلی ارسال مستقیم</span>
              <b>
                {data ? (data.sendingEnabled ? 'روشن؛ مشروط به تنظیمات هر پیج' : 'خاموش') : '—'}
              </b>
            </li>
            <li>
              <span>فروشگاه متوقف</span>
              <b>{number(data?.stats.paused)}</b>
            </li>
          </ul>
          {data?.role === 'SUPER_ADMIN' && (
            <a className={styles.link} href="/admin/operations">
              عملیات و توقف اضطراری ←
            </a>
          )}
        </section>
        <section className={styles.card}>
          <span className={styles.badge} data-state="ready">
            اشتراک ماهانه
          </span>
          <h2 style={{ marginTop: 15 }}>رایگان، با مصرف شفاف.</h2>
          <div className={styles.price}>
            ۰ <small>تومان / ماه</small>
          </div>
          <p>
            همهٔ فروشگاه‌ها در طرح ماهانهٔ رایگان‌اند؛ دوره‌ها از تاریخ ایجاد فروشگاه محاسبه
            می‌شوند. هیچ برداشت وجه یا تمدید پولی انجام نمی‌شود.
          </p>
          <p>
            درآمد وصول‌شده از اشتراک این سامانه: صفر؛ درگاه و فاکتور پرداخت فعال نیستند. تغییر به
            طرح پولی نیازمند خرید صریح مشتری خواهد بود.
          </p>
          <div className={styles.actions}>
            <a className={styles.link} href="/dashboard/subscription">
              مصرف فروشگاه من
            </a>
            <a className={styles.link} href="/dashboard/features">
              وضعیت همهٔ قابلیت‌ها
            </a>
          </div>
        </section>
      </div>
      <div className={styles.sectionHead}>
        <div>
          <h2>فروشگاه‌ها و اشتراک‌ها</h2>
          <p>هر ردیف یک فضای کاری؛ اطلاعات محرمانهٔ پیام و توکن در این گزارش نیست.</p>
        </div>
        <span className={styles.badge}>{number(data?.total)} نتیجه</span>
      </div>
      <form
        className={styles.toolbar}
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <input
          aria-label="جستجوی نام فروشگاه"
          placeholder="نام فروشگاه…"
          maxLength={80}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="وضعیت فروشگاه"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">همهٔ فروشگاه‌ها</option>
          <option value="connected">پیج متصل</option>
          <option value="attention">اتصال نیازمند توجه</option>
          <option value="paused">متوقف‌شده</option>
        </select>
        <button disabled={loading}>جستجو</button>
        <a className={styles.link} href={'/api/admin/service?' + query + '&format=csv'}>
          CSV همین صفحه ↓
        </a>
      </form>
      <div className={styles.tableWrap} aria-busy={loading}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>فروشگاه</th>
              <th>وضعیت اتصال</th>
              <th>اشتراک</th>
              <th>دورهٔ جاری</th>
              <th>اعضا / کاتالوگ</th>
            </tr>
          </thead>
          <tbody>
            {data?.workspaces.map((w) => (
              <tr key={w.id}>
                <td>
                  <span className={styles.rowTitle}>{w.name}</span>
                  <small>{w.paused ? 'فروشگاه متوقف است' : 'فضای کاری فعال'}</small>
                </td>
                <td>
                  <span
                    className={styles.badge}
                    data-state={w.connectionState === 'connected' ? 'ready' : 'pilot'}
                  >
                    {labels[w.connectionState] ?? 'نیازمند بررسی'}
                  </span>
                  {w.instagram && (
                    <small dir="ltr">
                      @{w.instagram.username} · {date(w.instagram.expiresAt)}
                    </small>
                  )}
                </td>
                <td>
                  ماهانهٔ رایگان<small>صفر تومان</small>
                </td>
                <td>
                  {date(w.period.start)}
                  <small>تا {date(w.period.end)}</small>
                </td>
                <td>
                  {number(w._count.memberships)} عضو
                  <small>{number(w._count.pages)} پیج کاتالوگ</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.workspaces.length && (
          <p className={styles.empty}>فروشگاهی با این فیلتر پیدا نشد.</p>
        )}
      </div>
      <div className={styles.toolbar}>
        <button disabled={loading || page === 1} onClick={() => setPage((v) => v - 1)}>
          صفحهٔ قبل
        </button>
        <span className={styles.muted}>صفحهٔ {number(page)} · هر صفحه ۲۵ فروشگاه</span>
        <button
          disabled={loading || !data || page * 25 >= data.total}
          onClick={() => setPage((v) => v + 1)}
        >
          صفحهٔ بعد
        </button>
      </div>
      <div className={styles.two}>
        <section className={styles.card}>
          <h2>نتیجهٔ درخواست‌ها · ۳۰ روز</h2>
          <ul className={styles.list}>
            {data &&
              Object.entries(data.jobs).map(([s, count]) => (
                <li key={s}>
                  <span>{labels[s] ?? s}</span>
                  <b>{number(count)}</b>
                </li>
              ))}
          </ul>
          {data && !Object.keys(data.jobs).length && <p>در این بازه درخواستی ثبت نشده است.</p>}
          <p>پذیرش API، تحویل قطعی یا فروش نیست. نتیجهٔ نامعلوم نباید بی‌محابا تکرار شود.</p>
        </section>
        <section className={styles.card}>
          <h2>خطاهای پرتکرار · ۳۰ روز</h2>
          <ul className={styles.list}>
            {data?.errors.map((e) => (
              <li key={e.kind}>
                <code>{e.kind}</code>
                <b>{number(e.count)}</b>
              </li>
            ))}
          </ul>
          {data && !data.errors.length && <p>خطای ثبت‌شده‌ای در این بازه نداریم.</p>}
          <a className={styles.link} href="/admin/users">
            کاربران و تاریخچهٔ دسترسی ←
          </a>
        </section>
      </div>
      {data?.role === 'SUPER_ADMIN' && (
        <section className={styles.card}>
          <h2>آخرین تغییرات مدیریتی</h2>
          <ul className={styles.list}>
            {data.audit.map((a) => (
              <li key={a.id}>
                <span>{a.action}</span>
                <time dateTime={a.createdAt}>{date(a.createdAt)}</time>
              </li>
            ))}
          </ul>
          {!data.audit.length && <p>هنوز تغییر مدیریتی ثبت نشده است.</p>}
          <a className={styles.link} href="/admin/technical">
            جزئیات فنی و ابزارهای قبلی ←
          </a>
        </section>
      )}
      <div className={styles.coming}>
        <span className={styles.badge} data-state="soon">
          به‌زودی
        </span>
        <h2>توسعه وب‌سایت</h2>
        <p>خدمت ساخت وب‌سایت کسب‌وکار در مسیر توسعه است؛ سفارش یا پرداخت آن هنوز فعال نیست.</p>
        <a className={styles.link} href="/dashboard/website-development">
          دیدن صفحهٔ خدمت ←
        </a>
      </div>
    </DashboardShell>
  );
}
