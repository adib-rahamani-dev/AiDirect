'use client';
import { useCallback, useEffect, useState } from 'react';
import styles from './inbox.module.css';
import type { DialogueState } from '@/lib/dm-dialogue';
import type { dmMetrics } from '@/lib/dm-metrics';
type Snapshot = {
  connection: { username: string; expiresAt: string } | null;
  settings: {
    enabled: boolean;
    shorthandMillions: boolean;
    pageId: string;
    enabledSince: string;
    tone: string;
    shippingPolicy: string;
    aiEnabled: boolean;
  } | null;
  pages: { id: string; name: string; _count: { products: number } }[];
  emergencyPaused: boolean;
  aiConfigured: boolean;
  metrics: Awaited<ReturnType<typeof dmMetrics>> | null;
  deliveries: {
    id: string;
    status: string;
    errorKind: string | null;
    attempts: number;
    receivedAt: string;
    intent: string;
    interpretation: string;
    resultKind: string | null;
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
  const [tone, setTone] = useState('friendly');
  const [shipping, setShipping] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [previewState, setPreviewState] = useState<DialogueState | undefined>();
  const [previewReply, setPreviewReply] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewHandedOff, setPreviewHandedOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const r = await fetch('/api/admin/inbox', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    const value: Snapshot = await r.json();
    setData(value);
    setPageId(value.settings?.pageId ?? value.pages[0]?.id ?? '');
    setMillions(value.settings?.shorthandMillions ?? true);
    setTone(value.settings?.tone ?? 'friendly');
    setShipping(value.settings?.shippingPolicy ?? '');
    setAiEnabled(value.settings?.aiEnabled ?? false);
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
      const result = await r.json();
      await load();
      setNotice(
        result.source === 'synthetic_ai_test'
          ? 'Groq با متن ساختگی پاسخ ساختاریافته داد؛ هیچ دایرکتی ارسال نشد.'
          : 'انجام شد. برای آزمون، یک پیام تازه از حساب دوم بفرست.',
      );
    } catch {
      setNotice('عملیات کامل نشد؛ اتصال پیج، نام پیج کاتالوگ و توقف اضطراری را بررسی کن.');
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    setPreviewBusy(true);
    try {
      const response = await fetch('/api/admin/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', pageId, text: previewText, state: previewState }),
      });
      if (!response.ok) throw new Error();
      const plan = await response.json();
      setPreviewState(plan.state);
      setPreviewHandedOff(plan.handedOff);
      setPreviewReply(plan.reply + '\n\n[پیش‌نمایش؛ چیزی به Instagram ارسال نشد]');
      setPreviewText('');
    } catch {
      setPreviewReply('پیش‌نمایش کامل نشد. وضعیت کاتالوگ و ورود مدیر را بررسی کن.');
    } finally {
      setPreviewBusy(false);
    }
  }
  const preferences = { tone, shippingPolicy: shipping, aiEnabled, aiConsent: aiEnabled };
  const labels: Record<string, string> = {
    greeting: 'سلام',
    recommendation: 'پیشنهاد محصول',
    price: 'قیمت',
    availability: 'موجودی',
    shipping: 'ارسال',
    human: 'درخواست انسان',
    thanks: 'تشکر',
    unknown: 'نامشخص',
    unclassified: 'تحلیل‌نشده',
    up_to_1m: 'تا ۱ میلیون',
    '1m_to_10m': '۱ تا ۱۰ میلیون',
    '10m_to_30m': '۱۰ تا ۳۰ میلیون',
    '30m_to_100m': '۳۰ تا ۱۰۰ میلیون',
    over_100m: 'بیش از ۱۰۰ میلیون',
  };
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
        <p>
          فهم پیام‌های معمول داخل برنامه؛ هوش مصنوعی فقط برای ابهام و با رضایت. قیمت و موجودی از
          کاتالوگ همین پیج است.
        </p>
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
        <label htmlFor="dm-tone">لحن فروشگاه</label>
        <select id="dm-tone" value={tone} onChange={(e) => setTone(e.target.value)} disabled={busy}>
          <option value="friendly">صمیمی و محترمانه</option>
          <option value="formal">رسمی</option>
        </select>
        <label htmlFor="dm-shipping">شرایط واقعی ارسال فروشگاه</label>
        <textarea
          id="dm-shipping"
          value={shipping}
          onChange={(e) => setShipping(e.target.value)}
          maxLength={600}
          rows={3}
          disabled={busy}
          placeholder="روش، هزینه و زمان ارسال؛ فقط اطلاعات تأییدشدهٔ خودت"
        />
        <p>اگر خالی باشد، برنامه هزینه یا زمان ارسال نمی‌سازد و درخواست بررسی فروشنده می‌دهد.</p>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={aiEnabled}
            disabled={busy || !data?.aiConfigured}
            onChange={(e) => setAiEnabled(e.target.checked)}
          />
          با فعال‌سازی تحلیل اختیاری پیام مبهم با Groq و پردازش بیرونی آن موافقم.
        </label>
        <p>
          به‌صورت پیش‌فرض خاموش است. قبل از هر تحلیل بیرونی از فرستنده هم رضایت همان درخواست پرسیده
          می‌شود. متن کوتاه و پالایش می‌شود؛ حذف همهٔ اطلاعات شخصی تضمین نمی‌شود. پاسخ‌های معمول و
          کاتالوگ به مدل وابسته نیستند. <a href="/privacy">حریم خصوصی</a>
        </p>
        <div className={styles.actions}>
          <button
            disabled={busy || !data?.aiConfigured || !aiEnabled}
            onClick={() => void action({ action: 'test_ai', consent: true })}
          >
            تست Groq با متن ثابتِ ساختگی
          </button>
          <button
            disabled={busy || !pageId || !data?.connection}
            onClick={() =>
              void action({
                action: 'configure',
                pageId,
                enabled: true,
                shorthandMillions: millions,
                ...preferences,
              })
            }
          >
            ذخیرهٔ تنظیمات و روشن‌کردن
          </button>
          <button
            disabled={busy || !pageId}
            onClick={() =>
              void action({
                action: 'configure',
                pageId,
                enabled: false,
                shorthandMillions: millions,
                ...preferences,
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
      <section>
        <h2>آزمایش گفتگو بدون ارسال دایرکت</h2>
        <p>
          تنظیمات ذخیره‌شده استفاده می‌شود. ابتدا «سلام»، سپس بودجه و بعد «اولی موجوده؟» را امتحان
          کن. برای این آزمایش متن ساختگی بنویس؛ این بخش در آمار دایرکت واقعی شمرده نمی‌شود.
        </p>
        <label htmlFor="dm-preview">پیام آزمایشی</label>
        <textarea
          id="dm-preview"
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          maxLength={1000}
          rows={3}
        />
        <div className={styles.actions}>
          <button
            disabled={previewBusy || previewHandedOff || !pageId || !previewText.trim()}
            onClick={() => void preview()}
          >
            دیدن پاسخ آزمایشی
          </button>
          <button
            disabled={previewBusy}
            onClick={() => {
              setPreviewState(undefined);
              setPreviewReply('');
              setPreviewHandedOff(false);
            }}
          >
            گفتگوی آزمایشی تازه
          </button>
        </div>
        <p className={styles.reply} role="status">
          {previewReply}
        </p>
      </section>
      <section>
        <h2>آمار واقعی دایرکت · ۳۰ روز</h2>
        {data?.metrics ? (
          <>
            <div className={styles.metrics}>
              {[
                ['پیام ثبت‌شده', data.metrics.received],
                ['گفتگوی متمایز', data.metrics.conversations],
                ['پذیرفته‌شده توسط API', data.metrics.accepted],
                ['بدون محصول مناسب', data.metrics.noMatch],
                ['ارجاع انسانی فعال', data.metrics.handoffs],
                [
                  'سهم بدون فراخوانی AI',
                  data.metrics.withoutAiPercent === null
                    ? '—'
                    : data.metrics.withoutAiPercent + '٪',
                ],
                ['تلاش AI', data.metrics.aiAttempts],
                ['نتیجهٔ نامعلوم ارسال', data.metrics.unknown],
                [
                  'میانگین تا پذیرش API',
                  data.metrics.averageAcceptanceMs === null
                    ? '—'
                    : Math.round(data.metrics.averageAcceptanceMs / 100) / 10 + ' ثانیه',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p>
              منبع: رکوردهای واقعی همین پیج؛ حداکثر {data.metrics.sampledLimit} رکورد. سهم بدون AI
              بر مبنای {data.metrics.analyzed} پیام تحلیل‌شده است. پذیرش API تأیید دریافت نیست. آمار
              فروش، سفارش و تبدیل نداریم.
            </p>
            <h3>نیازها و بودجه‌های ثبت‌شده</h3>
            <ul>
              {data.metrics.intents.map((v) => (
                <li key={v.label}>
                  {labels[v.label] ?? v.label}: {v.count}
                </li>
              ))}
            </ul>
            <ul>
              {data.metrics.budgets.map((v) => (
                <li key={v.label}>
                  {labels[v.label] ?? v.label} تومان: {v.count}
                </li>
              ))}
            </ul>
            <h3>محصولات پیشنهادشده در پاسخ‌های پذیرفته‌شده</h3>
            <ul>
              {data.metrics.products.map((v, i) => (
                <li key={i}>
                  {v.name}: {v.count}
                </li>
              ))}
            </ul>
            {data.metrics.noMatch > 0 && (
              <p>
                پیشنهاد بررسی: پیام‌های بدون محصول مناسب را با تنوع محصولات و موجودی کاتالوگ مقایسه
                کن؛ این عدد فروش ازدست‌رفته نیست.
              </p>
            )}
            {data.metrics.handoffs > 0 && (
              <p>
                درخواست بررسی انسانی داریم؛ Inbox پیج را بررسی کن. پاسخ خودکار این گفتگوها تا
                ازسرگیری یا پایان مهلت زمینه متوقف است.
              </p>
            )}
            <div className={styles.actions}>
              <button
                disabled={busy || !data.metrics.handoffs}
                onClick={() => void action({ action: 'resume_handoffs' })}
              >
                ازسرگیری گفتگوهای ارجاع‌شده پس از بررسی
              </button>
            </div>
          </>
        ) : (
          <p>پس از اتصال پیج و ذخیرهٔ پاسخ‌گو، آمار ثبت‌شدهٔ واقعی اینجا دیده می‌شود.</p>
        )}
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
                <th scope="col">نیت / مسیر تحلیل</th>
              </tr>
            </thead>
            <tbody>
              {data?.deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{new Date(d.receivedAt).toLocaleString('fa-IR')}</td>
                  <td>{statuses[d.status] ?? d.status}</td>
                  <td>{d.attempts}</td>
                  <td>{d.errorKind ?? '—'}</td>
                  <td>
                    {labels[d.intent] ?? d.intent} /{' '}
                    {d.interpretation === 'ai'
                      ? 'AI'
                      : d.interpretation === 'none'
                        ? '—'
                        : d.interpretation === 'context'
                          ? 'زمینهٔ گفتگو'
                          : 'قواعد محلی'}
                  </td>
                </tr>
              ))}
              {!data?.deliveries.length && (
                <tr>
                  <td colSpan={5}>هنوز پیامی برای پاسخ در صف ثبت نشده است.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
