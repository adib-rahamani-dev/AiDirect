'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import DashboardShell from '../dashboard-shell';
import styles from '../dashboard.module.css';
import InstagramInbox from './instagram-inbox';
import type { AssistantConfig } from '@/lib/instagram-assistant';
type Connection = {
  username: string;
  status: string;
  subscribed: boolean;
  expiresAt: string;
  autoDm: boolean;
  tone: string;
  shippingPolicy: string;
  shorthandMillions: boolean;
  assistantConfig: AssistantConfig;
};
type Thread = {
  id: string;
  preview: string;
  handedOff: boolean;
  lastInboundAt: string;
  lastMessageAt: string;
  canReply: boolean;
};
type Rule = {
  id: string;
  mediaId: string;
  keyword: string;
  replyText: string;
  link: string;
  enabled: boolean;
};
type Job = {
  id: string;
  kind: string;
  status: string;
  errorKind: string | null;
  intent: string;
  attempts: number;
  createdAt: string;
};
type Snapshot = {
  configured: boolean;
  connection: Connection | null;
  threads: Thread[];
  jobs: Job[];
  automations: Rule[];
  stats: { received: number; accepted: number; unknown: number; noMatch: number };
  sendingEnabled: boolean;
  aiAvailable: boolean;
  dmMetrics: {
    analyzed: number;
    aiAttempted: number;
    aiSucceeded: number;
    withoutAiPercent: number | null;
    handoffs: number;
    noMatch: number;
    averageAcceptanceMs: number | null;
    intents: Record<string, number>;
    budgets: Record<string, number>;
  };
};
type Media = { id: string; caption: string; media_product_type?: string };
const endpoint = '/api/customer/instagram';
const tabs = [
  ['connection', 'اتصال پیج'],
  ['inbox', 'صندوق پیام'],
  ['automations', 'اتوماسیون'],
  ['reports', 'گزارش ارسال'],
] as const;
type Tab = (typeof tabs)[number][0];
const statusNames: Record<string, string> = {
  pending: 'در صف',
  sending: 'در حال ارسال',
  accepted: 'پذیرش توسط متا',
  unknown: 'نتیجه نامعلوم؛ تکرار نکن',
  failed: 'ناموفق',
  skipped: 'متوقف‌شده',
  expired: 'مهلت گذشته',
};
const errorNames: Record<string, string> = {
  invalid_input:
    'تنظیمات معتبر نیست؛ هر پاسخ آماده به عبارت و متن نیاز دارد. برای روشن‌کردن AI هم تأیید حریم خصوصی لازم است.',
  connection_required: 'اول یک پیج حرفه‌ای متصل کن.',
  workspace_paused: 'عملیات این فروشگاه متوقف شده است.',
  subscribe_or_enable_sending:
    'ابتدا دریافت رویدادها را فعال کن؛ ارسال هم باید روی سرور آماده باشد.',
  reply_window_closed: 'مهلت پاسخ آزمایشی این گفتگو گذشته؛ منتظر پیام تازهٔ مخاطب باش.',
  meta_permission: 'متا دسترسی لازم را نداد؛ نقش Tester و مجوزهای اپ را بررسی کن.',
  meta_token: 'دسترسی حساب منقضی شده؛ دوباره متصل شو.',
  meta_rate_limit: 'محدودیت متا؛ کمی بعد دوباره امتحان کن.',
  media_not_owned: 'این پست در فهرست پست‌های پیج متصل پیدا نشد.',
  sending_paused: 'ارسال از تنظیمات سرور متوقف است.',
  wait: 'تلاش‌ها زیاد شده؛ کمی بعد دوباره امتحان کن.',
  not_found: 'این مورد در فضای کاری تو پیدا نشد.',
  result_unknown:
    'نتیجهٔ ارسال قبلی مشخص نیست؛ برای جلوگیری از پاسخ تکراری فعلاً دوباره ارسال نمی‌کنیم.',
};
const number = (v: number | undefined) => (v === undefined ? '—' : v.toLocaleString('fa-IR'));
const date = (v: string) =>
  new Intl.DateTimeFormat('fa-IR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(v));
export default function InstagramPanel({
  owner = false,
  initialTab,
}: {
  owner?: boolean;
  initialTab?: string;
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [tab, setTab] = useState<Tab>(
      tabs.some(([key]) => key === initialTab) ? (initialTab as Tab) : 'connection',
    ),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [media, setMedia] = useState<Media[]>([]),
    [mediaLoading, setMediaLoading] = useState(false),
    [editing, setEditing] = useState<Rule | null>(null),
    [formVersion, setFormVersion] = useState(0);
  const pending = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const r = await fetch(endpoint, {
      cache: 'no-store',
      signal: signal ?? AbortSignal.timeout(20000),
    });
    if (!r.ok) throw Error();
    setData(await r.json());
    setLoading(false);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const initial = url.searchParams.get('tab');
    if (tabs.some(([key]) => key === initial)) setTab(initial as Tab);
    const result = url.searchParams.get('result');
    if (result)
      setNotice(
        result === 'connected'
          ? 'پیج متصل شد و دریافت پیام و کامنت فعال است. حالا یک پیام تازه از حساب دوم بفرست.'
          : result === 'connected_subscription_pending'
            ? 'پیج متصل شد؛ فعال‌سازی رویدادها کامل نشد. دکمهٔ «فعال‌کردن دریافت رویدادها» را بزن.'
            : result === 'login_required'
              ? 'نشست سایت تمام شده؛ ابتدا وارد AiDirect شو و اتصال را دوباره شروع کن.'
              : errorNames[result]
                ? errorNames[result]
                : result === 'page_already_connected'
                  ? 'این پیج قبلاً به فروشگاه دیگری متصل شده است.'
                  : result === 'disconnect_before_replacement'
                    ? 'قبل از تعویض پیج، اتصال قبلی را قطع کن.'
                    : 'اتصال کامل نشد. حساب حرفه‌ای، نقش Tester و دسترسی‌های متا را بررسی کن.',
      );
    url.searchParams.delete('result');
    window.history.replaceState(null, '', url.pathname + url.search);
    const c = new AbortController();
    void load(c.signal).catch(() => {
      if (!c.signal.aborted) {
        setNotice('دریافت وضعیت کامل نشد؛ دوباره امتحان کن.');
        setLoading(false);
      }
    });
    return () => c.abort();
  }, [load]);
  const connection = data?.connection,
    connected = connection?.status === 'connected';
  async function mutate(body: Record<string, unknown>) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setNotice('');
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      const result = await r.json();
      if (!r.ok) {
        setNotice(
          errorNames[result.error] ?? 'درخواست کامل نشد؛ مجوزهای متا و ورودی‌ها را بررسی کن.',
        );
        return false;
      }
      setNotice(
        body.action === 'reply'
          ? result.deduplicated
            ? 'این درخواست قبلاً ثبت شده؛ دوباره ارسال نشد.'
            : 'درخواست پاسخ در صف ثبت شد؛ نتیجه را در گزارش بررسی کن.'
          : body.action === 'disconnect'
            ? 'اتصال محلی قطع شد. برای لغو دسترسی اپ، Apps and websites اینستاگرام را هم بررسی کن.'
            : 'تغییرات ثبت شد.',
      );
      await load();
      return true;
    } catch {
      setNotice(
        'ارتباط کامل نشد؛ ممکن است درخواست ثبت شده باشد. گزارش را بررسی کن و متن را بی‌دلیل دوباره نفرست.',
      );
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function loadMedia() {
    setMediaLoading(true);
    setNotice('');
    try {
      const r = await fetch(endpoint + '?view=media', {
        cache: 'no-store',
        signal: AbortSignal.timeout(25000),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error);
      setMedia(v.media);
      if (!v.media.length) setNotice('متا فعلاً پستی برای این پیج برنگرداند.');
    } catch (e) {
      setNotice(
        errorNames[e instanceof Error ? e.message : ''] ??
          'پست‌ها دریافت نشدند؛ مجوز یا اعتبار اتصال را بررسی کن.',
      );
    } finally {
      setMediaLoading(false);
    }
  }
  function selectTab(value: Tab) {
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    window.history.replaceState(null, '', url.pathname + url.search);
  }
  async function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await mutate({
      action: 'settings',
      autoDm: f.get('autoDm') === 'on',
      tone: f.get('tone'),
      shippingPolicy: f.get('shippingPolicy'),
      shorthandMillions: f.get('shorthandMillions') === 'on',
      assistant: {
        aiEnabled: f.get('aiEnabled') === 'on',
        privacyAcknowledged: f.get('privacyAcknowledged') === 'on',
        brandName: String(f.get('brandName') ?? ''),
        welcomeText: String(f.get('welcomeText') ?? ''),
        businessHours: {
          enabled: f.get('hoursEnabled') === 'on',
          days: f.getAll('hoursDay').map(Number),
          start: String(f.get('hoursStart') || '09:00'),
          end: String(f.get('hoursEnd') || '21:00'),
        },
        faqs: Array.from({ length: 5 }, (_, i) => ({
          keyword: String(f.get(`faq-key-${i}`) ?? '').trim(),
          answer: String(f.get(`faq-answer-${i}`) ?? '').trim(),
        })).filter((f) => f.keyword || f.answer),
      },
    });
  }
  async function saveRule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      await mutate({
        action: 'automation',
        ...(editing ? { id: editing.id } : {}),
        mediaId: f.get('mediaId'),
        keyword: f.get('keyword'),
        replyText: f.get('replyText'),
        link: f.get('link'),
        enabled: f.get('enabled') === 'on',
      })
    ) {
      setEditing(null);
      setFormVersion((v) => v + 1);
    }
  }
  return (
    <DashboardShell
      owner={owner}
      active={tab === 'inbox' ? 'صندوق پیام' : tab === 'automations' ? 'اتوماسیون' : 'اینستاگرام'}
      title={tab === 'inbox' ? 'صندوق پیام فروشگاه' : 'اینستاگرام فروشگاه'}
      subtitle="پیج تو، اپ رسمی متا، و کنترل روشن روی هر پاسخ."
    >
      {tab !== 'inbox' && (
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>اتصال مستقیم · بدون واسطهٔ BoxAPI</span>
            <h1 className={styles.heroTitle}>
              {tab === 'automations' ? 'یک کلمه، یک پاسخ.' : 'پیجت را نزدیک‌تر کن.'}
              <br />
              <em>{tab === 'automations' ? 'با اطلاعات خودت.' : 'رسمی و قابل‌کنترل.'}</em>
            </h1>
            <p>
              {connected
                ? '@' + connection.username + ' به فضای همین فروشگاه متصل است.'
                : 'با حساب حرفه‌ای وارد Instagram شو؛ رمز را اینجا دریافت نمی‌کنیم.'}
            </p>
          </div>
          <aside className={styles.heroNote}>
            <span className={`${styles.badge} ${!connected ? styles.badgeWarn : ''}`}>
              {loading
                ? 'در حال بررسی'
                : connected
                  ? 'متصل به متا'
                  : connection?.status === 'expired'
                    ? 'نیاز به ورود دوباره'
                    : 'هنوز متصل نشده'}
            </span>
            <strong>
              {connected
                ? connection.subscribed
                  ? 'دریافت رویدادها فعال است.'
                  : 'یک قدم دیگر: دریافت رویدادها.'
                : 'اول پیج، بعد پاسخ‌ها.'}
            </strong>
            <p>
              ثبت‌نام سایت باز است. تا تأیید متا، اتصال حساب‌های خارج از نقش‌های تست ممکن است رد
              شود؛ این محدودیت را نمی‌توانیم دور بزنیم.
            </p>
          </aside>
        </section>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <div className={styles.tabs} role="tablist" aria-label="بخش‌های اینستاگرام">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            id={'tab-' + value}
            role="tab"
            aria-selected={tab === value}
            aria-controls="instagram-content"
            onClick={() => selectTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="instagram-content" aria-labelledby={'tab-' + tab}>
        {tab === 'connection' && (
          <div className={styles.grid}>
            <div className={styles.stack}>
              <section className={styles.card}>
                <div className={styles.sectionHead}>
                  <h2>اتصال رسمی Instagram</h2>
                  <span className={styles.badge}>Meta API</span>
                </div>
                <div className={styles.steps}>
                  <div className={styles.step}>
                    <span className={connected ? styles.stepDone : styles.stepNumber}>
                      {connected ? '✓' : '۱'}
                    </span>
                    <div>
                      <strong>حساب حرفه‌ای را متصل کن</strong>
                      <p>
                        Business یا Creator، متعلق به خودت یا با اجازهٔ مالک. حساب Facebook مدیر اپ
                        لازم نیست Instagram داشته باشد.
                      </p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <span className={connection?.subscribed ? styles.stepDone : styles.stepNumber}>
                      {connection?.subscribed ? '✓' : '۲'}
                    </span>
                    <div>
                      <strong>اجازهٔ دسترسی را در Instagram تأیید کن</strong>
                      <p>
                        دریافت پیام و کامنت را پس از ورود، خودمان فعال می‌کنیم. پاسخ‌گوی خودکار تا
                        انتخاب تو خاموش می‌ماند.
                      </p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNumber}>۳</span>
                    <div>
                      <strong>با حساب دوم تست کن</strong>
                      <p>پیام تازه بفرست و نتیجهٔ پاسخ را هم در خود Instagram بررسی کن.</p>
                    </div>
                  </div>
                </div>
                <div className={styles.formActions}>
                  {data?.configured ? (
                    <a
                      className={`${styles.button} ${styles.primary}`}
                      href="/api/customer/instagram/connect"
                    >
                      {connected ? 'ورود دوباره به Instagram' : 'اتصال با Instagram'} ↗
                    </a>
                  ) : (
                    <p className={styles.note}>
                      {loading ? 'در حال بررسی اتصال امن…' : 'تنظیمات اپ روی سرور آماده نیست.'}
                    </p>
                  )}
                  {connected && !connection.subscribed && (
                    <button disabled={busy} onClick={() => void mutate({ action: 'subscribe' })}>
                      فعال‌کردن دریافت رویدادها
                    </button>
                  )}
                  {connected && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            'کلید اتصال و متن پیام‌های ذخیره‌شدهٔ این پیج از سرور پاک می‌شوند. برای اتصال دوباره باید وارد Instagram شوی. ادامه می‌دهی؟',
                          )
                        )
                          void mutate({ action: 'disconnect' });
                      }}
                    >
                      قطع اتصال
                    </button>
                  )}
                </div>
                {connection && (
                  <p className={styles.note}>اعتبار دسترسی تا {date(connection.expiresAt)}</p>
                )}
                <details className={styles.connectionHelp}>
                  <summary>برای اتصال به مشکل خوردی؟</summary>
                  <ol>
                    <li>ورود AiDirect و ورود Instagram جدا هستند؛ ابتدا با ایمیل سایت وارد شو.</li>
                    <li>
                      سایت را در Chrome یا Safari باز کن؛ از مرورگر داخل Instagram استفاده نکن.
                    </li>
                    <li>
                      پیج باید Business یا Creator باشد. فعلاً اپ در مرحلهٔ آزمایش است؛ مالک اپ باید
                      همین پیج را در نقش Instagram Tester اضافه کند و مالک پیج دعوت را بپذیرد.
                    </li>
                    <li>
                      مجوزهای نمایش‌داده‌شده در صفحهٔ رسمی Instagram را تأیید کن. رمز یا کد ورود را
                      برای پشتیبانی نفرست.
                    </li>
                  </ol>
                  <p>
                    اگر هنوز خطا داری، متن خطا را بدون اطلاعات ورود برای پشتیبانی بفرست. هیچ اتصال
                    رسمی تضمین مصونیت از محدودیت‌های متا نیست.
                  </p>
                </details>
              </section>
              <section className={styles.card}>
                <h2>ویترین پیج متصل</h2>
                <p>
                  برای پاسخ محصول، قیمت و موجودی را در کاتالوگ پیجی با همان نام کاربری نگه دار. پس
                  از اتصال، پیج کاتالوگ متناظر به‌صورت خودکار ساخته می‌شود.
                </p>
                <a className={styles.link} href={owner ? '/admin/catalog' : '/dashboard/catalog'}>
                  مدیریت محصولات ←
                </a>
              </section>
            </div>
            <section className={styles.card}>
              <h2>شخصیت پاسخ‌گوی فروشگاه</h2>
              <form
                className={styles.form}
                key={
                  connection?.username +
                  String(connection?.autoDm) +
                  connection?.tone +
                  connection?.shippingPolicy +
                  JSON.stringify(connection?.assistantConfig)
                }
                onSubmit={(e) => void saveSettings(e)}
              >
                <fieldset disabled={busy || !connected}>
                  <label>
                    نام فروشگاه در معرفی دستیار
                    <input
                      name="brandName"
                      maxLength={60}
                      defaultValue={connection?.assistantConfig.brandName ?? ''}
                      placeholder="مثلاً فروشگاه آبان"
                    />
                  </label>
                  <label>
                    متن خوشامد
                    <textarea
                      name="welcomeText"
                      maxLength={200}
                      defaultValue={connection?.assistantConfig.welcomeText ?? ''}
                      placeholder="خوش اومدی! دنبال چه محصولی هستی؟"
                    />
                  </label>
                  <label>
                    لحن پاسخ
                    <select name="tone" defaultValue={connection?.tone ?? 'friendly'}>
                      <option value="friendly">صمیمی و روشن</option>
                      <option value="formal">رسمی و دقیق</option>
                    </select>
                  </label>
                  <label>
                    شرایط واقعی ارسال
                    <textarea
                      name="shippingPolicy"
                      maxLength={600}
                      defaultValue={connection?.shippingPolicy ?? ''}
                      placeholder="روش، زمان و هزینهٔ ارسال را با اطلاعات واقعی بنویس."
                    />
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      name="shorthandMillions"
                      defaultChecked={connection?.shorthandMillions}
                    />
                    در فروشگاه من، «۳۰ تومن» یعنی ۳۰ میلیون تومان.
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      name="autoDm"
                      defaultChecked={connection?.autoDm}
                      disabled={!connection?.subscribed || !data?.sendingEnabled}
                    />
                    پاسخ خودکار محصول به دایرکت‌های تازه روشن باشد.
                  </label>
                  <details className={styles.connectionHelp}>
                    <summary>ساعات پاسخ‌گویی دستیار · ساعت تهران</summary>
                    <p className={styles.note}>
                      بیرون این ساعت‌ها پیام در صندوق ثبت می‌شود، ولی پاسخ خودکار دایرکت ساخته
                      نمی‌شود و بعداً هم خودکار بازپخش نمی‌شود. پاسخ دستی و قوانین کامنت مستقل‌اند.
                      بازهٔ شبانه می‌تواند از نیمه‌شب بگذرد؛ ساعت پایان جزو بازه نیست.
                    </p>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        name="hoursEnabled"
                        defaultChecked={connection?.assistantConfig.businessHours.enabled ?? false}
                      />
                      پاسخ خودکار دایرکت فقط در این ساعت‌ها
                    </label>
                    <div className={styles.form}>
                      <label>
                        از ساعت
                        <input
                          type="time"
                          name="hoursStart"
                          defaultValue={connection?.assistantConfig.businessHours.start ?? '09:00'}
                          required
                        />
                      </label>
                      <label>
                        تا ساعت
                        <input
                          type="time"
                          name="hoursEnd"
                          defaultValue={connection?.assistantConfig.businessHours.end ?? '21:00'}
                          required
                        />
                      </label>
                    </div>
                    <fieldset>
                      <legend>روز شروع بازه؛ حداقل یک روز انتخاب کن</legend>
                      {[
                        [6, 'شنبه'],
                        [0, 'یکشنبه'],
                        [1, 'دوشنبه'],
                        [2, 'سه‌شنبه'],
                        [3, 'چهارشنبه'],
                        [4, 'پنجشنبه'],
                        [5, 'جمعه'],
                      ].map(([day, label]) => (
                        <label className={styles.check} key={day}>
                          <input
                            type="checkbox"
                            name="hoursDay"
                            value={day}
                            defaultChecked={
                              connection?.assistantConfig.businessHours.days.includes(
                                Number(day),
                              ) ?? true
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                  </details>
                  <details className={styles.connectionHelp}>
                    <summary>پاسخ‌های تأییدشدهٔ فروشگاه</summary>
                    <p className={styles.note}>
                      برای سؤال‌های روشن، بدون مصرف AI جواب می‌دهیم. قیمت و موجودی را فقط در کاتالوگ
                      ثبت کن. هر ردیف را کامل کن یا هر دو فیلد را خالی بگذار.
                    </p>
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className={styles.form}>
                        <label>
                          عبارت سؤال {number(i + 1)}
                          <input
                            name={`faq-key-${i}`}
                            maxLength={60}
                            defaultValue={connection?.assistantConfig.faqs[i]?.keyword ?? ''}
                            placeholder="مثلاً آدرس فروشگاه"
                          />
                        </label>
                        <label>
                          پاسخ تأییدشده
                          <textarea
                            name={`faq-answer-${i}`}
                            maxLength={450}
                            defaultValue={connection?.assistantConfig.faqs[i]?.answer ?? ''}
                          />
                        </label>
                      </div>
                    ))}
                  </details>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      name="aiEnabled"
                      defaultChecked={connection?.assistantConfig.aiEnabled}
                      disabled={!data?.aiAvailable}
                    />
                    تحلیل پیام‌های مبهم با Groq، پس از رضایت مخاطب
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      name="privacyAcknowledged"
                      defaultChecked={connection?.assistantConfig.privacyAcknowledged}
                    />
                    با پردازش بیرونی نسخهٔ کوتاه و پالایش‌شدهٔ پیام موافقم و حریم خصوصی فروشگاه را
                    به مخاطب اطلاع می‌دهم.
                  </label>
                  {!data?.aiAvailable && (
                    <p className={styles.note}>
                      تحلیل بیرونی روی سرور آماده نیست؛ پاسخ محلی ادامه دارد.
                    </p>
                  )}
                  <button className={styles.primary}>ذخیره تنظیمات پاسخ</button>
                </fieldset>
              </form>
              <p className={styles.privacyNote}>
                پاسخ نخست، خودکاربودن دستیار را معرفی می‌کند. قیمت و موجودی از کاتالوگ همین پیج
                خوانده می‌شوند. AI پیش‌فرض خاموش است؛ پس از فعال‌سازی فروشگاه، برای تحلیل هر پیام
                مبهم از مخاطب رضایت می‌گیریم. مدل فقط نیت و دسته را استخراج می‌کند و اختیار ساخت
                قیمت ندارد. درخواست اپراتور، پاسخ خودکار آن گفتگو را متوقف می‌کند.
              </p>
              {!data?.sendingEnabled && (
                <p className={styles.notice}>
                  ارسال روی سرور فعلاً متوقف است؛ اتصال و کاتالوگ را می‌توانی بررسی کنی.
                </p>
              )}
            </section>
          </div>
        )}
        {tab === 'inbox' && (
          <InstagramInbox
            autoDm={connection?.autoDm ?? false}
            sendingEnabled={data?.sendingEnabled ?? false}
            quickReplies={[
              ...(connection?.assistantConfig.faqs.map((f) => f.answer) ?? []),
              ...(connection?.shippingPolicy ? [connection.shippingPolicy] : []),
            ]}
            onChanged={load}
          />
        )}
        {tab === 'automations' && (
          <div className={styles.grid}>
            <section className={styles.card}>
              <div className={styles.sectionHead}>
                <h2>{editing ? 'ویرایش اتوماسیون' : 'کامنت به پاسخ خصوصی'}</h2>
                <button disabled={!connected || mediaLoading} onClick={() => void loadMedia()}>
                  {mediaLoading ? 'دریافت…' : 'دریافت پست‌ها از متا'}
                </button>
              </div>
              <form
                className={styles.form}
                key={(editing?.id ?? 'new') + formVersion}
                onSubmit={(e) => void saveRule(e)}
              >
                <fieldset disabled={busy || !connected}>
                  <label>
                    پست یا ریلز
                    <select name="mediaId" required defaultValue={editing?.mediaId ?? ''}>
                      <option value="" disabled>
                        ابتدا پست‌ها را دریافت کن
                      </option>
                      {media.map((m, i) => (
                        <option key={m.id} value={m.id}>
                          {m.media_product_type === 'REELS' ? 'ریلز' : 'پست'} {number(i + 1)} ·{' '}
                          {m.caption.slice(0, 65) || m.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    کلمهٔ محرک
                    <input
                      name="keyword"
                      maxLength={80}
                      required
                      defaultValue={editing?.keyword ?? ''}
                      placeholder="مثلاً قیمت"
                    />
                  </label>
                  <label>
                    متن پاسخ خصوصی
                    <textarea
                      name="replyText"
                      maxLength={700}
                      required
                      defaultValue={editing?.replyText ?? ''}
                      placeholder="سلام! این اطلاعات محصولیه که خواستی…"
                    />
                  </label>
                  <label>
                    لینک HTTPS محصول، اختیاری
                    <input
                      name="link"
                      type="url"
                      dir="ltr"
                      maxLength={250}
                      defaultValue={editing?.link ?? ''}
                      placeholder="https://…"
                    />
                  </label>
                  <label className={styles.check}>
                    <input
                      name="enabled"
                      type="checkbox"
                      defaultChecked={editing?.enabled}
                      disabled={!connection?.subscribed || !data?.sendingEnabled}
                    />
                    این اتوماسیون روشن باشد.
                  </label>
                  <div className={styles.formActions}>
                    <button className={styles.primary}>ذخیره اتوماسیون</button>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setFormVersion((v) => v + 1);
                        }}
                      >
                        انصراف
                      </button>
                    )}
                  </div>
                </fieldset>
              </form>
              <p className={styles.privacyNote}>
                حداکثر ۱۰۰ پست آخر در فهرست نمایش داده می‌شود. فقط کامنت منطبق روی پست انتخاب‌شده
                پردازش می‌شود؛ پاسخ خصوصی کامنت، ارسال آزاد دایرکت نیست.
              </p>
            </section>
            <section className={styles.card}>
              <h2>اتوماسیون‌های تو</h2>
              <div className={styles.list}>
                {data?.automations.length ? (
                  data.automations.map((rule) => (
                    <article className={styles.listRow} key={rule.id}>
                      <div>
                        <strong>اگر گفت «{rule.keyword}»</strong>
                        <small>
                          {rule.enabled ? 'روشن' : 'خاموش'} · {rule.replyText.slice(0, 65)}
                        </small>
                      </div>
                      <div className={styles.formActions}>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setEditing(rule);
                            if (!media.length) void loadMedia();
                          }}
                        >
                          ویرایش
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm('این اتوماسیون حذف شود؟'))
                              void mutate({ action: 'delete_automation', id: rule.id });
                          }}
                        >
                          حذف
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className={styles.empty}>
                    <span>⌘</span>اولین پاسخ خصوصی‌ات را تعریف کن.
                    <br />
                    بدون کامنت تازه، پیامی ارسال نمی‌شود.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
        {tab === 'reports' && (
          <>
            <section className={styles.stats}>
              {[
                [data?.stats.received, 'پیام تازه'],
                [data?.stats.accepted, 'ارسال پذیرفته‌شده'],
                [data?.stats.noMatch, 'بدون محصول مناسب'],
                [data?.stats.unknown, 'نیازمند بررسی'],
              ].map(([v, label]) => (
                <article key={String(label)} className={styles.stat}>
                  <span>{label}</span>
                  <strong>{number(v as number | undefined)}</strong>
                  <small>۷ روز اخیر · دادهٔ همین فروشگاه</small>
                </article>
              ))}
            </section>
            <section className={styles.card}>
              <div className={styles.sectionHead}>
                <h2>گفتگوها چه می‌گویند؟</h2>
                <span className={styles.badge}>۷ روز اخیر</span>
              </div>
              <div className={styles.stats}>
                {[
                  [data?.dmMetrics.analyzed, 'پاسخ تحلیل‌شده'],
                  [data?.dmMetrics.aiAttempted, 'تلاش AI'],
                  [data?.dmMetrics.aiSucceeded, 'تحلیل موفق AI'],
                  [data?.dmMetrics.handoffs, 'ارجاع به فروشنده'],
                ].map(([v, label]) => (
                  <article key={String(label)} className={styles.stat}>
                    <span>{label}</span>
                    <strong>{number(v as number | undefined)}</strong>
                  </article>
                ))}
              </div>
              <p className={styles.note}>
                سهم پردازش بدون فراخوانی AI:{' '}
                {data?.dmMetrics.withoutAiPercent == null
                  ? 'هنوز داده‌ای نداریم'
                  : number(data.dmMetrics.withoutAiPercent) + '٪'}{' '}
                · میانگین زمان ثبت در صف تا پذیرش API:{' '}
                {data?.dmMetrics.averageAcceptanceMs == null
                  ? 'هنوز داده‌ای نداریم'
                  : number(data.dmMetrics.averageAcceptanceMs) + ' میلی‌ثانیه'}
              </p>
              <div className={styles.formActions}>
                {Object.entries(data?.dmMetrics.intents ?? {}).map(([intent, count]) => (
                  <span className={styles.badge} key={intent}>
                    {(
                      {
                        greeting: 'سلام',
                        recommendation: 'درخواست محصول',
                        price: 'قیمت',
                        availability: 'موجودی',
                        shipping: 'ارسال',
                        human: 'اپراتور',
                        thanks: 'تشکر',
                        unknown: 'نامشخص',
                      } as Record<string, string>
                    )[intent] ?? intent}
                    : {number(count)}
                  </span>
                ))}
              </div>
              <p className={styles.privacyNote}>
                این اعداد، نیت و نتیجهٔ پردازش هستند؛ فروش یا نرخ تبدیل نیستند. ردیف‌های قدیمی فاقد
                تحلیل، بدون داده حساب می‌شوند. خطای AI هم در تلاش‌ها ثبت می‌شود.
              </p>
              <h3>بودجه‌های مطرح‌شده</h3>
              <div className={styles.formActions}>
                {Object.entries(data?.dmMetrics.budgets ?? {}).map(([band, count]) => (
                  <span className={styles.badge} key={band}>
                    {(
                      {
                        up_to_1m: 'تا ۱ میلیون',
                        '1m_to_10m': '۱ تا ۱۰ میلیون',
                        '10m_to_30m': '۱۰ تا ۳۰ میلیون',
                        '30m_to_100m': '۳۰ تا ۱۰۰ میلیون',
                        over_100m: 'بیش از ۱۰۰ میلیون',
                      } as Record<string, string>
                    )[band] ?? band}{' '}
                    تومان: {number(count)}
                  </span>
                ))}
              </div>
              <p className={styles.note}>
                شمار پاسخ‌های تحلیل‌شده با بودجهٔ مشخص؛ تعداد افراد یکتا نیست. ادامهٔ همان گفتگو هم
                می‌تواند دوباره شمرده شود.
              </p>
              <h3>پیشنهاد عملی بر اساس گزارش</h3>
              {data?.dmMetrics.noMatch ? (
                <p>
                  {number(data.dmMetrics.noMatch)} پاسخ بدون محصول مناسب بوده؛ قیمت، موجودی و پوشش
                  دسته‌های کاتالوگ را بررسی کن.
                </p>
              ) : null}
              {data?.dmMetrics.handoffs ? (
                <p>
                  {number(data.dmMetrics.handoffs)} بار درخواست فروشنده ثبت شده؛ گفتگوهای متوقف‌شده
                  را در صندوق پیام بررسی کن.
                </p>
              ) : null}
              {data && data.dmMetrics.aiAttempted > data.dmMetrics.aiSucceeded ? (
                <p>
                  بخشی از تحلیل‌های AI موفق نبوده‌اند؛ تا بررسی، پاسخ‌های محلی و سؤال روشن‌کننده را
                  مبنا قرار بده.
                </p>
              ) : null}
              {!data?.dmMetrics.analyzed ? (
                <p className={styles.note}>
                  پس از ثبت پاسخ‌های تازه، پیشنهادها از دادهٔ همین فروشگاه ساخته می‌شوند.
                </p>
              ) : null}
            </section>
            <section className={styles.card}>
              <div className={styles.sectionHead}>
                <h2>آخرین تلاش‌های ارسال</h2>
                <button disabled={busy} onClick={() => void mutate({ action: 'process' })}>
                  پردازش صف
                </button>
              </div>
              {data?.jobs.length ? (
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>زمان</th>
                        <th>مسیر</th>
                        <th>وضعیت</th>
                        <th>تلاش</th>
                        <th>خطا</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.jobs.map((job) => (
                        <tr key={job.id}>
                          <td>{date(job.createdAt)}</td>
                          <td>
                            {job.kind === 'private_reply'
                              ? 'پاسخ خصوصی کامنت'
                              : job.kind === 'dm_auto'
                                ? 'پاسخ‌گوی محصول'
                                : 'پاسخ دستی'}
                          </td>
                          <td>{statusNames[job.status] ?? job.status}</td>
                          <td>{number(job.attempts)}</td>
                          <td>{job.errorKind ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.empty}>هنوز تلاشی برای ارسال ثبت نشده است.</div>
              )}
              <p className={styles.privacyNote}>
                پذیرش API به معنی دریافت قطعی نیست. timeout و نتیجهٔ نامعلوم خودکار تکرار نمی‌شوند.
                صف در دیتابیس پایدار است؛ اجرای اولیه با وبهوک انجام می‌شود و worker دائمی هنوز
                تأیید نشده است. فروش و تبدیل بدون منبع سفارش محاسبه نمی‌شوند.
              </p>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
