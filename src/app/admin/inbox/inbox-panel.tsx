'use client';
import { useCallback, useEffect, useState } from 'react';
import styles from './inbox.module.css';
type Snapshot = {
  connection: { username: string; expiresAt: string } | null;
  settings: {
    enabled: boolean;
    shorthandMillions: boolean;
    pageId: string;
    enabledSince: string;
  } | null;
  pages: { id: string; name: string; _count: { products: number } }[];
  emergencyPaused: boolean;
  deliveries: {
    id: string;
    status: string;
    errorKind: string | null;
    attempts: number;
    receivedAt: string;
  }[];
};
const statuses: Record<string, string> = {
  pending: 'در صف',
  sending: 'در حال ارسال',
  accepted: 'پذیرفته‌شده توسط BoxAPI؛ دریافت بررسی شود',
  unknown: 'نتیجه نامعلوم؛ بدون ارسال دوباره',
  failed: 'ناموفق',
  suppressed: 'متوقف‌شده',
  expired: 'مهلت تمام‌شده',
};
export default function InboxPanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [pageId, setPageId] = useState('');
  const [millions, setMillions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const r = await fetch('/api/admin/inbox', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    const value: Snapshot = await r.json();
    setData(value);
    setPageId(value.settings?.pageId ?? value.pages[0]?.id ?? '');
    setMillions(value.settings?.shorthandMillions ?? true);
  }, []);
  useEffect(() => {
    void load().catch(() => setNotice('دریافت وضعیت کامل نشد؛ ورود مدیر را بررسی کن.'));
  }, [load]);
  async function action(input: unknown) {
    setBusy(true);
    setNotice('');
    try {
      const r = await fetch('/api/admin/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!r.ok) throw new Error();
      await load();
      setNotice('انجام شد. برای آزمون، یک پیام تازه از حساب دوم بفرست.');
    } catch {
      setNotice('عملیات کامل نشد؛ اتصال پیج، نام پیج کاتالوگ و توقف اضطراری را بررسی کن.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.main} dir="rtl">
      <nav>
        <a href="/admin">مدیریت</a>
        <a href="/admin/catalog">محصولات</a>
        <a href="/admin/operations">توقف اضطراری</a>
      </nav>
      <header>
        <span>آزمایش محدود یک پیج</span>
        <h1>دایرکت، با جواب مشخص.</h1>
        <p>پیشنهاد محصول از قیمت و موجودی کاتالوگ همین پیج؛ متن دایرکت برای Groq ارسال نمی‌شود.</p>
      </header>
      <section>
        <h2>
          {data?.connection ? `پیج @${data.connection.username}` : 'ابتدا پیج را از مدیریت وصل کن'}
        </h2>
        <p>
          وضعیت: {data?.settings?.enabled ? 'پاسخ خودکار دایرکت روشن' : 'پاسخ خودکار دایرکت خاموش'}
          {data?.emergencyPaused ? ' · توقف اضطراری فعال است' : ''}
        </p>
        <label htmlFor="dm-catalog">کاتالوگ متناظر با نام پیج</label>
        <select
          id="dm-catalog"
          value={pageId}
          onChange={(e) => setPageId(e.target.value)}
          disabled={busy}
        >
          <option value="">کاتالوگ را انتخاب کن</option>
          {data?.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p._count.products} محصول
            </option>
          ))}
        </select>
        <p>
          فعلاً فقط کاتالوگ مدیر با نام کاربری یکسان قابل اتصال است. محصولات پنل مشتری وارد این
          آزمایش نمی‌شوند.
        </p>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={millions}
            onChange={(e) => setMillions(e.target.checked)}
            disabled={busy}
          />
          «۳۰ تومن» یعنی ۳۰ میلیون تومان؛ مبلغ‌های مبهم دیگر سؤال می‌شوند.
        </label>
        <div className={styles.actions}>
          <button
            disabled={busy || !pageId || !data?.connection}
            onClick={() =>
              void action({
                action: 'configure',
                pageId,
                enabled: true,
                shorthandMillions: millions,
              })
            }
          >
            روشن‌کردن با این کاتالوگ
          </button>
          <button
            disabled={busy || !pageId}
            onClick={() =>
              void action({
                action: 'configure',
                pageId,
                enabled: false,
                shorthandMillions: millions,
              })
            }
          >
            خاموش‌کردن
          </button>
        </div>
        <p>
          پس از روشن‌کردن، از حساب دوم بنویس: «تا ۳۰ میلیون تومان محصول پیشنهاد بده». پیام‌های قبل
          از روشن‌شدن بازپخش نمی‌شوند. فقط متن تازه پاسخ می‌گیرد؛ عکس، صوت و پیام‌های خود پیج پاسخ
          داده نمی‌شوند.
        </p>
        <p>
          این آزمون پاسخ به دایرکت است؛ پاسخ خصوصی به کامنت هنوز فعال نیست. پیشنهادها با قواعد
          کاتالوگ ساخته می‌شوند؛ گفت‌وگوی آزاد هوش مصنوعی و ثبت سفارش فعال نیست.
        </p>
      </section>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <section>
        <h2>نتیجهٔ تلاش‌ها</h2>
        <div className={styles.actions}>
          <button
            disabled={busy}
            onClick={() => void load().catch(() => setNotice('تازه‌سازی انجام نشد.'))}
          >
            تازه‌سازی
          </button>
          <button disabled={busy} onClick={() => void action({ action: 'process' })}>
            پردازش صف مانده
          </button>
        </div>
        <p>
          صف در دیتابیس ثبت و بعد از دریافت وبهوک پردازش می‌شود. زمان‌بند دائمی هنوز نداریم؛ پس از
          وقفه، از «پردازش صف مانده» استفاده کن. نتیجهٔ نامعلوم خودکار دوباره ارسال نمی‌شود. سقف
          آزمایش ۱۰۰ پیام در روز است.
        </p>
        <div className={styles.table}>
          <table>
            <thead>
              <tr>
                <th scope="col">زمان</th>
                <th scope="col">وضعیت</th>
                <th scope="col">تلاش</th>
                <th scope="col">خطا</th>
              </tr>
            </thead>
            <tbody>
              {data?.deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{new Date(d.receivedAt).toLocaleString('fa-IR')}</td>
                  <td>{statuses[d.status] ?? d.status}</td>
                  <td>{d.attempts}</td>
                  <td>{d.errorKind ?? '—'}</td>
                </tr>
              ))}
              {!data?.deliveries.length && (
                <tr>
                  <td colSpan={4}>هنوز پیامی برای پاسخ در صف ثبت نشده است.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
