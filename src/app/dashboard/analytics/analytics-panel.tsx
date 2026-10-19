'use client';
import { useEffect, useRef, useState } from 'react';
import { Brand } from '../../ui';
import type { AnalyticsSnapshot } from '@/lib/analytics';
import base from '../../admin/catalog/catalog.module.css';
import styles from './analytics.module.css';
type Data = AnalyticsSnapshot & { ai: { mode: string; configured: boolean; enabled: boolean } };
type AiReport = {
  source: 'external_ai';
  mode: 'ai_prioritized_rules';
  provider: 'groq';
  generatedAt: string;
  summary: string;
  focus: { suggestionId: string; reason: string }[];
};
const n = (value: number) => value.toLocaleString('fa-IR');
const money = (value: string | null) =>
  value === null ? '—' : BigInt(value).toLocaleString('fa-IR');
export default function AnalyticsPanel({ customer = false }: { customer?: boolean }) {
  const endpoint = customer ? '/api/customer/analytics' : '/api/admin/analytics';
  const catalog = customer ? '/dashboard/catalog' : '/admin/catalog';
  const [data, setData] = useState<Data | null>(null),
    [days, setDays] = useState('30'),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [report, setReport] = useState<AiReport | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setMessage('');
    setReport(null);
    setConsent(false);
    void fetch(endpoint + '?days=' + days, { signal: controller.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const next: Data = await r.json();
        if (!controller.signal.aborted) setData(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData(null);
          setMessage('دریافت آمار کامل نشد؛ دوباره تلاش کن یا وارد حساب شو.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, days, revision]);
  async function analyze() {
    if (pending.current || !data || !consent) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    setReport(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true, days, workspaceId: data.workspace.id }),
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) {
        setMessage(
          response.status === 429
            ? 'سهمیهٔ تحلیل فعلاً پر است؛ بعداً دوباره امتحان کن.'
            : response.status === 409
              ? 'تحلیل هوش مصنوعی هنوز فعال نشده است.'
              : 'پاسخ معتبر هوش مصنوعی دریافت نشد؛ آمار و پیشنهادهای داخلی در دسترس‌اند.',
        );
        return;
      }
      setReport(await response.json());
    } catch {
      setMessage('تحلیل کامل نشد؛ دوباره‌فرستادن خودکار انجام نمی‌شود.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const m = data?.metrics,
    max = Math.max(1, ...(data?.timeline.map((p) => p.count) ?? []));
  return (
    <div className={base.shell}>
      <header className={base.header}>
        <Brand />
        <nav aria-label={customer ? 'فضای فروشگاه' : 'مدیریت سرویس'}>
          <a href={customer ? '/dashboard' : '/admin'}>{customer ? 'پنل من' : 'نمای کلی سرویس'}</a>
          <a href={catalog}>محصولات</a>
          <a href={customer ? '/dashboard/analytics' : '/admin/analytics'} aria-current="page">
            آمار و تحلیل
          </a>
          {customer && <a href="/dashboard/settings">تنظیمات حساب</a>}
        </nav>
      </header>
      <main className={base.main} aria-busy={loading}>
        <div className={base.intro}>
          <div>
            <span className={base.eyebrow}>آمار روشن، تصمیم آگاهانه</span>
            <h1>
              ویترینت را
              <br />
              <em>دقیق‌تر ببین.</em>
            </h1>
            <p>آمار واقعی کاتالوگ، قدم‌های بعدی و تحلیل اختیاری هوش مصنوعی؛ همه در فضای خودت.</p>
          </div>
          <aside className={base.note}>
            <span>منبع این گزارش</span>
            <strong>{data?.workspace.name ?? 'کاتالوگ فروشگاه'}</strong>
            <p>
              آمار از اطلاعات ثبت‌شدهٔ خودت محاسبه می‌شود. ارزش موجودی، درآمد نیست؛ پیج کاتالوگ هم
              اتصال Instagram نیست.
            </p>
            <small>
              {data
                ? 'به‌روز شده: ' +
                  new Date(data.generatedAt).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })
                : 'در انتظار داده'}
            </small>
          </aside>
        </div>
        <div className={base.toolbar}>
          <label>
            بازهٔ نمودار ثبت محصول
            <select value={days} disabled={busy} onChange={(e) => setDays(e.target.value)}>
              <option value="7">۷ روز اخیر</option>
              <option value="30">۳۰ روز اخیر</option>
              <option value="90">۹۰ روز اخیر</option>
            </select>
          </label>
          <button
            className={base.secondary}
            disabled={loading || busy}
            onClick={() => setRevision((v) => v + 1)}
          >
            به‌روزرسانی آمار
          </button>
          <a href={catalog} className={base.link}>
            اصلاح کاتالوگ ←
          </a>
        </div>
        <p role="status" className={base.message}>
          {message}
        </p>
        {loading && <p role="status">در حال محاسبهٔ آمار…</p>}
        {data && m && (
          <>
            <section className={styles.metrics} aria-label="آمار فعلی کاتالوگ">
              {[
                ['محصول ثبت‌شده', n(m.products), 'همهٔ محصولات این فضای کاری'],
                ['آمادهٔ پیشنهاد', n(m.available), 'فعال و دارای موجودی'],
                ['فعالِ ناموجود', n(m.outOfStock), 'از پیشنهاد خرید کنار گذاشته می‌شود'],
                ['پیج کاتالوگ', n(m.pages), 'ثبت دستی؛ اتصال رسمی نیست'],
              ].map(([label, value, hint]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{hint}</small>
                </article>
              ))}
            </section>
            <div className={base.columns}>
              <section className={base.panel}>
                <span className={base.eyebrow}>ثبت محصول، نه فروش</span>
                <h2>حرکت ویترین در {n(data.days)} روز</h2>
                <p>
                  {n(data.timeline.reduce((sum, p) => sum + p.count, 0))} محصول در این بازه ثبت شده
                  · زمان تهران
                </p>
                <div
                  className={styles.chart}
                  role="img"
                  aria-label={
                    'تعداد محصولات ثبت‌شده در ' + n(data.days) + ' روز؛ جزئیات در جدول زیر'
                  }
                >
                  {data.timeline.map((p) => (
                    <div key={p.day} title={p.day + ' · ' + n(p.count)}>
                      <i
                        style={{ height: `${Math.max(3, (p.count / max) * 100)}%` }}
                        data-empty={!p.count}
                      />
                    </div>
                  ))}
                </div>
                <div className={styles.chartEnds}>
                  <span>
                    {new Date(data.timeline[0].day + 'T12:00:00Z').toLocaleDateString('fa-IR')}
                  </span>
                  <span>امروز</span>
                </div>
                <details>
                  <summary>جزئیات روزانه</summary>
                  <div className={styles.tableScroll}>
                    <table>
                      <caption>محصول‌های تازه ثبت‌شده</caption>
                      <thead>
                        <tr>
                          <th scope="col">تاریخ</th>
                          <th scope="col">تعداد</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.timeline.map((p) => (
                          <tr key={p.day}>
                            <td>{new Date(p.day + 'T12:00:00Z').toLocaleDateString('fa-IR')}</td>
                            <td>{n(p.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
              <section className={base.panel}>
                <span className={base.eyebrow}>سلامت کاتالوگ</span>
                <h2>جا برای بهتر شدن</h2>
                {[
                  ['توضیح کافی', m.products - m.missingDescription],
                  ['ارتباط دستی با پست', m.mapped],
                  ['فعال و موجود', m.available],
                ].map(([label, value]) => (
                  <div className={styles.coverage} key={String(label)}>
                    <div>
                      <span>{label}</span>
                      <strong>
                        {n(Number(value))} از {n(m.products)}
                      </strong>
                    </div>
                    <progress
                      max={Math.max(1, m.products)}
                      value={Number(value)}
                      aria-label={String(label)}
                    />
                  </div>
                ))}
                <p>
                  توضیح کافی یعنی حداقل چهل نویسه؛ این شاخص‌ها کیفیت فروش یا آمادگی تجاری سرویس را
                  تأیید نمی‌کنند.
                </p>
              </section>
            </div>
            <div className={base.columns}>
              <section className={base.panel}>
                <span className={base.eyebrow}>دسته‌های کاتالوگ</span>
                <h2>ترکیب محصولاتت</h2>
                {data.categories.length ? (
                  <ul className={styles.categories}>
                    {data.categories.map((c) => (
                      <li key={c.category}>
                        <strong>{c.category}</strong>
                        <span>
                          {n(c.products)} محصول · {n(c.available)} آمادهٔ پیشنهاد
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>با ثبت اولین محصول، ترکیب دسته‌ها اینجا نمایش داده می‌شود.</p>
                )}
                <small>
                  حداکثر هشت دسته با بیشترین محصول؛ این فهرست محبوبیت یا تقاضای مشتری نیست.
                </small>
              </section>
              <section className={base.panel}>
                <span className={base.eyebrow}>موجودی و قیمت ثبت‌شده</span>
                <h2>{money(m.inventoryValueToman)} تومان</h2>
                <p>
                  مجموع قیمت × موجودی محصولات فعال؛ برآورد ارزش ویترین است و فروش انجام‌شده نیست.
                </p>
                <p>
                  بازهٔ قیمت محصولات آمادهٔ پیشنهاد: {money(m.minPriceToman)} تا{' '}
                  {money(m.maxPriceToman)} تومان
                </p>
                <p>
                  {n(m.lowStock)} محصول با موجودی یک تا سه · {n(m.posts)} پست مرتبط دستی
                </p>
              </section>
            </div>
            <section className={base.panel}>
              <span className={base.eyebrow}>پیشنهادهای داخلی · بدون API خارجی</span>
              <h2>قدم بعدی که ارزش برداشتن دارد</h2>
              <div className={styles.suggestions}>
                {data.suggestions.map((s, index) => (
                  <article key={s.id}>
                    <div>
                      <span className={styles.index}>{n(index + 1)}</span>
                      <small>
                        {
                          { high: 'اولویت بالا', medium: 'اولویت میانه', low: 'برای بررسی بعدی' }[
                            s.priority
                          ]
                        }
                      </small>
                    </div>
                    <h3>{s.title}</h3>
                    <p>{s.detail}</p>
                    {s.affected > 0 && <small>{n(s.affected)} محصول مرتبط</small>}
                    <a className={base.link} href={catalog}>
                      بررسی در کاتالوگ ←
                    </a>
                  </article>
                ))}
              </div>
            </section>
            <section className={base.panel}>
              <div className={styles.aiHeading}>
                <div>
                  <span className={base.eyebrow}>اولویت‌بندی اختیاری با مدل</span>
                  <h2>نگاه دوم با هوش مصنوعی</h2>
                </div>
                <span className={styles.badge}>
                  {report
                    ? 'پاسخ واقعی دریافت شد'
                    : data.ai.mode === 'available'
                      ? 'آمادهٔ درخواست؛ نتیجه هنوز تولید نشده'
                      : 'API هوش مصنوعی فعال نیست'}
                </span>
              </div>
              <p>
                آمار و پیشنهادهای بالا داخل پروژه محاسبه می‌شوند. این بخش، در صورت فعال‌سازی، فقط
                شمارش‌های تجمیعی و کد پیشنهادها را به Groq می‌فرستد؛ نام، ایمیل، پیج، متن دایرکت،
                محصول، قیمت و توکن ارسال نمی‌شوند. مدل فقط اقدام‌ها را اولویت‌بندی می‌کند؛ آمار و
                متن توضیحات از قواعد برنامه می‌آیند.
              </p>
              {data.ai.mode !== 'available' && (
                <p>
                  فعلاً کلید و مجوز اجرای سرویس خارجی فعال نیست؛ گزارشی از مدل تولید نشده است. برای
                  آمار و پیشنهادهای داخلی به کلید نیاز نداری.
                </p>
              )}
              <label className={styles.consent}>
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={data.ai.mode !== 'available' || busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />{' '}
                با ارسال همین آمار تجمیعی برای تولید این تحلیل موافقم.
              </label>
              <button
                disabled={!consent || busy || data.ai.mode !== 'available' || loading}
                onClick={() => void analyze()}
              >
                {busy ? 'در انتظار پاسخ مدل…' : 'تولید تحلیل با Groq'}
              </button>
              <p>
                حداکثر یک تلاش در دقیقه و پنج تلاش روزانه برای هر فضا؛ خطا خودکار تکرار نمی‌شود.
                پیشنهاد مدل به معنی تضمین فروش نیست و چیزی را تغییر نمی‌دهد.
              </p>
              {report && (
                <div className={styles.report}>
                  <span>
                    اولویت‌بندی واقعی Groq · توضیحات از قواعد برنامه ·{' '}
                    {new Date(report.generatedAt).toLocaleString('fa-IR', {
                      timeZone: 'Asia/Tehran',
                    })}
                  </span>
                  <p>{report.summary}</p>
                  {report.focus.map((f) => (
                    <article key={f.suggestionId}>
                      <h3>{data.suggestions.find((s) => s.id === f.suggestionId)?.title}</h3>
                      <p>{f.reason}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className={base.panel}>
              <h2>آمار گفتگو و فروش</h2>
              <div className={styles.unavailable}>
                {['کامنت واقعی', 'پاسخ خصوصی', 'سفارش', 'درآمد', 'نرخ تبدیل'].map((label) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>—</strong>
                    <small>داده متصل نیست</small>
                  </div>
                ))}
              </div>
              <p>
                پس از اتصال مستقل Instagram و منبع معتبر سفارش، این بخش دادهٔ واقعی می‌گیرد. مقدار
                ناموجود را صفر یا فروش ازدست‌رفته حساب نمی‌کنیم.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
