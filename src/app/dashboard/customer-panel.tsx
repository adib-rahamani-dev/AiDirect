'use client';
import { useEffect, useState } from 'react';
import DashboardShell from './dashboard-shell';
import styles from './dashboard.module.css';
type Data = {
  user: { name: string; email: string; emailVerified: boolean; role: string };
  workspace: { name: string; paused: boolean };
  stats: { pages: number; products: number; received: number; accepted: number; unknown: number };
  instagram: { username: string; status: string; subscribed: boolean; autoDm: boolean } | null;
  instagramConnected: boolean;
};
const number = (v: number | undefined) =>
  v === undefined ? '—' : new Intl.NumberFormat('fa-IR').format(v);
export default function CustomerPanel() {
  const [data, setData] = useState<Data | null>(null),
    [notice, setNotice] = useState('');
  useEffect(() => {
    const c = new AbortController();
    void fetch('/api/customer', { signal: c.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw Error();
        setData(await r.json());
      })
      .catch(() => {
        if (!c.signal.aborted) setNotice('دریافت اطلاعات کامل نشد؛ صفحه را دوباره باز کن.');
      });
    return () => c.abort();
  }, []);
  const connected = Boolean(data?.instagramConnected);
  return (
    <DashboardShell
      title={data?.workspace.name ?? 'میز کار تو'}
      subtitle="فروشگاهت را به گفتگو نزدیک‌تر کن؛ با داده‌های واقعی و کنترل روشن."
    >
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>سلام {data?.user.name ?? 'دوست من'}، خوش آمدی</span>
          <h1 className={styles.heroTitle}>
            یک میز خلوت.
            <br />
            <em>برای گفتگوهای بیشتر.</em>
          </h1>
          <p>پیجت را وصل کن، محصولاتت را معرفی کن و انتخاب پاسخ‌ها را دست خودت نگه دار.</p>
          <div className={styles.heroActions}>
            <a className={`${styles.button} ${styles.primary}`} href="/dashboard/instagram">
              {connected ? 'مدیریت اینستاگرام' : 'اتصال پیج با اینستاگرام'} <span>↗</span>
            </a>
            <a className={styles.button} href="/dashboard/catalog">
              محصولات من
            </a>
          </div>
        </div>
        <aside className={styles.heroNote}>
          <span className={`${styles.badge} ${!connected ? styles.badgeWarn : ''}`}>
            {connected ? 'پیج متصل است' : 'منتظر اتصال پیج'}
          </span>
          <strong>
            {connected
              ? '@' + data?.instagram?.username
              : 'اولین گفت‌وگوی خوب، از یک اتصال امن شروع می‌شود.'}
          </strong>
          <p>
            {connected
              ? data?.instagram?.autoDm
                ? 'پاسخ‌گوی محصول روشن است؛ از صندوق پیام نتیجه را بررسی کن.'
                : 'پاسخ‌گوی خودکار خاموش است؛ از بخش اینستاگرام تنظیمش کن.'
              : 'رمز اینستاگرام را فقط در صفحهٔ رسمی Instagram وارد می‌کنی. دسترسی در هر زمان قابل قطع است.'}
          </p>
        </aside>
      </section>
      {notice && (
        <p role="alert" className={styles.notice}>
          {notice}
        </p>
      )}
      {data?.workspace.paused && (
        <p className={styles.notice}>عملیات این فضای کاری متوقف است؛ تنظیمات را بررسی کن.</p>
      )}
      <section className={styles.stats} aria-label="آمار واقعی هفت روز اخیر">
        {[
          [data?.stats.products, 'محصول در ویترین', 'از کاتالوگ خودت'],
          [
            connected ? data?.stats.received : undefined,
            'پیام دریافتی',
            '۷ روز اخیر · پس از اتصال',
          ],
          [
            connected ? data?.stats.accepted : undefined,
            'ارسال پذیرفته‌شده',
            'پذیرش API؛ نه تأیید دریافت',
          ],
          [connected ? data?.stats.unknown : undefined, 'نیازمند بررسی', 'نتیجهٔ ارسال نامعلوم'],
        ].map(([value, label, detail]) => (
          <article className={styles.stat} key={String(label)}>
            <span>{label}</span>
            <strong>{number(value as number | undefined)}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>
      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.sectionHead}>
            <h2>مسیر شروع فروشگاه</h2>
            <span className={styles.badge}>قدم به قدم</span>
          </div>
          <div className={styles.steps}>
            {[
              [
                '۱',
                'اتصال رسمی پیج',
                connected
                  ? 'پیجت متصل است؛ دریافت رویدادها را هم فعال کن.'
                  : 'یک حساب حرفه‌ای Business یا Creator لازم است.',
                '/dashboard/instagram',
              ],
              [
                '۲',
                'چیدن ویترین محصولات',
                data?.stats.products
                  ? 'محصول داری؛ قیمت و موجودی را به‌روز نگه دار.'
                  : 'نام، قیمت، موجودی و لینک معتبر محصول را اضافه کن.',
                '/dashboard/catalog',
              ],
              [
                '۳',
                'ساخت اولین پاسخ',
                'برای یک پست، کلمهٔ محرک و پاسخ خصوصی تعریف کن.',
                '/dashboard/instagram?tab=automations',
              ],
              [
                '۴',
                'بررسی نتیجهٔ واقعی',
                'با حساب دوم پیام تازه بفرست و پاسخ را در Instagram هم بررسی کن.',
                '/dashboard/instagram?tab=inbox',
              ],
            ].map(([n, title, text, href]) => (
              <div className={styles.step} key={n}>
                <span className={styles.stepNumber}>{n}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                  <a href={href}>ادامه ←</a>
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className={styles.stack}>
          <section className={styles.card}>
            <h2>بهتر راهنمایی کن، کمتر حدس بزن.</h2>
            <p>
              پاسخ‌گوی محصول، بودجه و نیاز روشن مشتری را با قواعد محلی می‌فهمد و قیمت را فقط از
              کاتالوگ همین فروشگاه می‌خواند.
            </p>
            <a className={styles.link} href="/dashboard/analytics">
              پیشنهادهای بهبود ویترین ←
            </a>
          </section>
          <section className={styles.card}>
            <h2>کنترل همیشه دست توست</h2>
            <div className={styles.list}>
              <a className={styles.listRow} href="/dashboard/instagram?tab=inbox">
                <div>
                  <strong>صندوق پیام</strong>
                  <small>مشاهدهٔ پیام‌های تازه و پاسخ دستی</small>
                </div>
                <span>↗</span>
              </a>
              <a className={styles.listRow} href="/dashboard/settings">
                <div>
                  <strong>امنیت و اطلاعات حساب</strong>
                  <small>تغییر رمز، دریافت اطلاعات و حذف حساب</small>
                </div>
                <span>↗</span>
              </a>
            </div>
          </section>
        </div>
      </div>
      <p className={styles.privacyNote}>
        ثبت‌نام سایت عمومی است؛ اتصال پیج‌های بیرون از حساب‌های تست به تأیید متا وابسته است. آمار
        سفارش و فروش بدون منبع سفارش ساخته نمی‌شود.
      </p>
    </DashboardShell>
  );
}
