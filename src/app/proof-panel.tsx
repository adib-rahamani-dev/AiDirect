'use client';

import { useEffect, useState } from 'react';
import { Brand, LegalLinks, Section } from './ui';
import LoginScreen from './login-screen';

type Delivery = {
  id: string;
  provider: string;
  source: string;
  status: string;
  attempts: number;
  errorKind?: string;
  errorCode?: number;
  observedAt?: string;
  createdAt: string;
};
type Rule = { mediaId: string; keyword: string; replyText: string; link: string; enabled: boolean };
type Media = { id: string; caption?: string; media_product_type?: string };
type ProofState = {
  connection?: {
    accountId: string;
    username: string;
    status: string;
    subscribed: boolean;
    expiresAt: string;
  };
  rule?: Rule;
  deliveries: Delivery[];
  events: number;
  workerReady: boolean;
  config: {
    provider: string;
    metaConfigured: boolean;
    realSendEnabled: boolean;
    automaticEnabled: boolean;
    callbackUrl: string;
    webhookUrl: string;
  };
};
const initialRule: Rule = {
  mediaId: '',
  keyword: 'لینک',
  replyText: 'سلام! این هم لینکی که خواسته بودی 👋',
  link: '',
  enabled: false,
};
const statuses: Record<string, string> = {
  pending: 'در صف',
  preparing: 'در حال بررسی',
  sending: 'در حال ارسال',
  accepted: 'متا پذیرفت؛ دریافت تأیید نشده',
  simulated: 'شبیه‌سازی؛ ارسال واقعی ندارد',
  unknown: 'نتیجه نامعلوم؛ تکرار مسدود',
  failed: 'ناموفق',
  skipped: 'اجرا نشد',
  expired: 'بازهٔ ارسال گذشته',
};
const errors: Record<string, string> = {
  token: 'دسترسی منقضی شده؛ حساب را دوباره متصل کنید.',
  permission: 'مجوز لازم در متا فعال نیست.',
  rate_limit: 'محدودیت متا؛ تلاش بعدی طبق زمان‌بندی انجام می‌شود.',
  temporary: 'اختلال موقت ارتباط؛ تلاش مجدد کنترل می‌شود.',
  unknown: 'نتیجهٔ ارسال روشن نیست؛ برای جلوگیری از پیام تکراری دوباره ارسال نمی‌شود.',
  meta_not_configured: 'ابتدا شناسه و کلید جدید اپ متا را در تنظیمات سرور قرار دهید.',
  disconnect_first: 'این نسخه یک حساب آزمایشی دارد؛ ابتدا اتصال فعلی را قطع کنید.',
};

export default function ProofPanel() {
  const [state, setState] = useState<ProofState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<Media[]>([]);
  const [comments, setComments] = useState<{ id: string; text: string }[]>([]);
  const [rule, setRule] = useState<Rule>(initialRule);
  const [invite, setInvite] = useState('');
  const [tab, setTab] = useState<'setup' | 'activity'>('setup');

  async function load(preserveDraft = false) {
    try {
      const response = await fetch('/api/proof', { cache: 'no-store' });
      if (response.ok) {
        const value: ProofState = await response.json();
        setState(value);
        if (value.rule && !preserveDraft) setRule(value.rule);
      } else if (response.status === 401) {
        setState(null);
        setInvite('');
      } else setNotice('فضای کار بارگیری نشد. کمی بعد دوباره تلاش کن.');
    } catch {
      setNotice('ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.');
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    const result = new URL(window.location.href).searchParams.get('result');
    const messages: Record<string, string> = {
      connected: 'حساب متصل شد. قدم بعدی انتخاب پست و آزمایش یک پاسخ خصوصی است.',
      oauth_failed: 'اتصال کامل نشد. مجوزها، نقش Tester و تنظیمات ورود متا را بررسی کنید.',
      connect_not_ready: 'اتصال آماده نیست؛ ورود مدیر و تنظیمات متا را بررسی کنید.',
      select_meta_adapter: 'برای اتصال واقعی، حالت Meta باید در تنظیمات سرور فعال شود.',
    };
    if (result && messages[result]) {
      setNotice(messages[result]);
      window.history.replaceState(null, '', window.location.pathname);
    }
    void load();
  }, []);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(
          errors[value.error] ?? 'عملیات انجام نشد. تنظیمات و وضعیت اتصال را بررسی کنید.',
        );
      if (value.media) setMedia(value.media);
      if (value.comments) setComments(value.comments);
      if (action === 'logout') {
        setMedia([]);
        setComments([]);
        setRule(initialRule);
        setInvite('');
      }
      if (action === 'disconnect' || action === 'purge') {
        setMedia([]);
        setComments([]);
        setInvite('');
        if (action === 'purge') setRule(initialRule);
      }
      await load(['media', 'comments'].includes(action));
      setNotice(
        action === 'rule'
          ? 'اتوماسیون ذخیره شد.'
          : action === 'logout'
            ? 'از پنل خارج شدید.'
            : 'انجام شد؛ وضعیت تازه در پنل نمایش داده می‌شود.',
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'خطای ارتباط با سرور');
    } finally {
      setBusy(false);
    }
  }
  async function createInvite() {
    setBusy(true);
    setNotice('');
    setInvite('');
    try {
      const response = await fetch('/api/meta/invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(errors[value.error] ?? 'ساخت دعوت ممکن نشد.');
      setInvite(value.url);
      setNotice(
        'لینک دعوت ساخته شد؛ دو ساعت اعتبار دارد و فقط برای اتصال یک پیج است. دعوت قبلی باطل شد.',
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'خطای ارتباط');
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('کپی شد.');
    } catch {
      setNotice('کپی خودکار ممکن نشد؛ متن لینک را انتخاب و کپی کنید.');
    }
  }
  async function purge() {
    const confirm = window.prompt(
      'توکن، اتوماسیون و گزارش‌های پیج فعلی حذف می‌شوند. برای تأیید DELETE را بنویس.',
    );
    if (confirm === 'DELETE') await act('purge', { confirm });
  }
  const connected = state?.connection?.status === 'connected';
  const simulated = state?.config.provider === 'simulated';
  if (!loaded)
    return (
      <main className="loading-page">
        <Brand />
        <div className="spinner" />
        <p>در حال آماده‌سازی فضای شما…</p>
      </main>
    );
  if (!state) return <LoginScreen initialMessage={notice} destination="/proof" />;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-name">
          <span className="workspace-avatar">A</span>
          <div>
            <strong>فضای آزمایش</strong>
            <small>یک پیج · یک اتوماسیون</small>
          </div>
        </div>
        <span className="nav-label">فضای کار</span>
        <nav aria-label="منوی اصلی">
          <button
            className={'nav-item ' + (tab === 'setup' ? 'active' : '')}
            onClick={() => setTab('setup')}
          >
            <span>⌘</span>راه‌اندازی اتوماسیون
          </button>
          <button
            className={'nav-item ' + (tab === 'activity' ? 'active' : '')}
            onClick={() => setTab('activity')}
          >
            <span>◷</span>گزارش فعالیت
          </button>
          <a className="nav-item" href="/guide">
            <span>?</span>راهنمای شروع
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="scope-note">
            <span className="dot" />
            آزمایش قبل از انتشار<p>موفقیت واقعی با دریافت پیام در پیج دوم تأیید می‌شود.</p>
          </div>
          <button className="nav-item" disabled={busy} onClick={() => act('logout')}>
            <span>↪</span>خروج از حساب
          </button>
          <LegalLinks />
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <div>
            <span className="eyebrow">فضای کار شما</span>
            <h1>{tab === 'setup' ? 'از اینجا گفتگو بساز.' : 'همهٔ اتفاق‌ها، شفاف.'}</h1>
          </div>
          <span className={'pill ' + (simulated ? 'warning' : '')}>
            <span className="dot" />
            {simulated ? 'حالت شبیه‌سازی' : 'حالت API متا'}
          </span>
          <button className="mobile-logout secondary" disabled={busy} onClick={() => act('logout')}>
            خروج
          </button>
        </header>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button className="notice-close" aria-label="بستن پیام" onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}
        <div className={'mode-note ' + (simulated ? 'warning' : '')}>
          <strong>
            {simulated
              ? 'این محیط هیچ پیام واقعی ارسال نمی‌کند.'
              : state.config.realSendEnabled
                ? 'ارسال واقعی فعال است.'
                : 'ارسال واقعی فعلاً خاموش است.'}
          </strong>
          <span>
            {simulated
              ? 'با نمونهٔ آماده، جریان را بررسی کن.'
              : 'اتصال حساب به‌تنهایی اثبات ارسال خصوصی نیست.'}
          </span>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span>کامنت ثبت‌شده</span>
            <strong>{state.events.toLocaleString('fa-IR')}</strong>
            <small>رویدادهای ذخیره‌شده</small>
          </div>
          <div className="stat-card">
            <span>{simulated ? 'پاسخ شبیه‌سازی‌شده' : 'درخواست پذیرفته‌شدهٔ متا'}</span>
            <strong>
              {state.deliveries
                .filter((item) => item.status === (simulated ? 'simulated' : 'accepted'))
                .length.toLocaleString('fa-IR')}
            </strong>
            <small>در آخرین ۵۰ درخواست</small>
          </div>
          <div className="stat-card">
            <span>پردازش صف</span>
            <strong className={state.workerReady ? 'status-good' : 'status-warn'}>
              {state.workerReady ? 'آماده' : 'متوقف'}
            </strong>
            <small>
              {state.workerReady ? 'زمان‌بند اخیراً پاسخ داده' : 'زمان‌بند باید اجرا شود'}
            </small>
          </div>
        </div>
        {tab === 'setup' ? (
          <div className="setup-grid">
            <div className="setup-main">
              <Section
                id="connection"
                number="۰۱"
                title="پیجت را متصل کن"
                description="ورود امن، مستقیم در صفحهٔ رسمی اینستاگرام."
              >
                <div className="account-card">
                  <span className="instagram-icon" aria-hidden="true">
                    ◎
                  </span>
                  <div>
                    <strong>{connected ? state.connection?.username : 'حسابی متصل نیست'}</strong>
                    <small>
                      {connected
                        ? simulated
                          ? 'حساب نمایشی؛ اتصال واقعی نیست'
                          : 'دسترسی حساب ثبت شده'
                        : 'با حساب حرفه‌ای Business یا Creator شروع کن'}
                    </small>
                  </div>
                  <span
                    className={'connection-dot ' + (connected ? 'on' : '')}
                    aria-label={connected ? 'متصل' : 'قطع'}
                  />
                </div>
                <div className="actions">
                  {simulated ? (
                    <button disabled={busy} onClick={() => act('simulation_setup')}>
                      آماده‌سازی نمونهٔ آزمایشی
                    </button>
                  ) : (
                    <a
                      className={'button ' + (!state.config.metaConfigured ? 'disabled' : '')}
                      href={state.config.metaConfigured ? '/api/meta/connect' : undefined}
                      aria-disabled={!state.config.metaConfigured}
                    >
                      اتصال رسمی Instagram ↗
                    </a>
                  )}
                  {connected && (
                    <button className="secondary" disabled={busy} onClick={() => act('disconnect')}>
                      قطع اتصال
                    </button>
                  )}
                </div>
                {!simulated && !state.config.metaConfigured && (
                  <p className="helper">
                    کلیدهای اپ متا هنوز روی سرور تنظیم نشده‌اند. راهنمای تنظیمات را ببین.
                  </p>
                )}
                {!simulated && (
                  <details>
                    <summary>اتصال پیج شخص دیگر با دعوت</summary>
                    <p>
                      برای یک مالک مجاز لینک بساز. دعوت دو ساعت اعتبار دارد و دسترسی مدیریت پنل
                      نمی‌دهد. حساب او باید برای آزمایش در متا نقش Tester داشته باشد.
                    </p>
                    <button
                      className="secondary"
                      disabled={busy || !state.config.metaConfigured}
                      onClick={createInvite}
                    >
                      ساخت لینک دعوت
                    </button>
                    {invite && (
                      <div className="invite-box">
                        <input aria-label="لینک خصوصی دعوت" readOnly dir="ltr" value={invite} />
                        <button className="secondary" onClick={() => copy(invite)}>
                          کپی لینک
                        </button>
                        <small>
                          فقط برای همان آزمایش‌کننده ارسال کن. با ساخت دعوت جدید، قبلی باطل می‌شود.
                        </small>
                      </div>
                    )}
                  </details>
                )}
                <details>
                  <summary>حذف داده‌های آزمایش</summary>
                  <p>
                    توکن، قانون، شناسه‌های کامنت و گزارش‌های پیج فعلی حذف می‌شوند. این کار پیام‌هایی
                    را که قبلاً در Instagram ارسال شده‌اند پس نمی‌گیرد.
                  </p>
                  <button className="secondary" disabled={busy || !connected} onClick={purge}>
                    حذف داده‌های این پیج
                  </button>
                </details>
              </Section>
              <Section
                id="automation"
                number="۰۲"
                title="یک کلمه، یک پاسخ"
                description="پست یا ریلز را انتخاب کن و بگو چه پیامی ارسال شود."
              >
                <button
                  className="secondary"
                  disabled={busy || !connected}
                  onClick={() => act('media')}
                >
                  دریافت پست‌ها و ریلزها ↻
                </button>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void act('rule', { rule });
                  }}
                >
                  <label htmlFor="media">پست یا ریلز</label>
                  <select
                    id="media"
                    value={rule.mediaId}
                    onChange={(event) => setRule({ ...rule, mediaId: event.target.value })}
                    required
                  >
                    <option value="">رسانه را انتخاب کن</option>
                    {!media.some((item) => item.id === rule.mediaId) && rule.mediaId && (
                      <option value={rule.mediaId}>{rule.mediaId}</option>
                    )}
                    {media
                      .filter((item) => ['FEED', 'REELS'].includes(item.media_product_type ?? ''))
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.caption?.slice(0, 60) || item.id} · {item.media_product_type}
                        </option>
                      ))}
                  </select>
                  <label htmlFor="keyword">کلمه یا عبارت محرک</label>
                  <input
                    id="keyword"
                    value={rule.keyword}
                    onChange={(event) => setRule({ ...rule, keyword: event.target.value })}
                    maxLength={80}
                    required
                    placeholder="مثلاً لینک"
                  />
                  <small>
                    حروف فارسی و عربی و فاصله‌ها یکسان‌سازی می‌شوند؛ کلمه باید مستقل باشد.
                  </small>
                  <label htmlFor="reply">متن پاسخ خصوصی</label>
                  <textarea
                    id="reply"
                    value={rule.replyText}
                    onChange={(event) => setRule({ ...rule, replyText: event.target.value })}
                    maxLength={700}
                    required
                    rows={4}
                  />
                  <div className="field-footer">
                    {rule.replyText.length.toLocaleString('fa-IR')} / ۷۰۰
                  </div>
                  <label htmlFor="link">لینک مقصد</label>
                  <input
                    id="link"
                    type="url"
                    dir="ltr"
                    value={rule.link}
                    onChange={(event) => setRule({ ...rule, link: event.target.value })}
                    maxLength={250}
                    placeholder="https://your-brand.com/offer"
                    required
                  />
                  <label className="toggle-row">
                    <span>
                      <strong>فعال‌بودن اتوماسیون</strong>
                      <small>اجرای واقعی به تنظیمات ارسال سرور هم وابسته است.</small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={rule.enabled}
                      onChange={(event) => setRule({ ...rule, enabled: event.target.checked })}
                    />
                  </label>
                  <button className="full" disabled={busy || !connected}>
                    {busy ? 'در حال ثبت…' : 'ذخیرهٔ اتوماسیون'}
                    <span>←</span>
                  </button>
                </form>
              </Section>
              <Section
                id="test"
                number="۰۳"
                title="اولین پاسخ را بررسی کن"
                description="اول ارسال دستی؛ سپس یک کامنت تازه برای آزمون خودکار."
              >
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={busy || !state.rule || !connected}
                    onClick={() => act('comments')}
                  >
                    دریافت کامنت‌های اخیر
                  </button>
                  {simulated && (
                    <button disabled={busy || !connected} onClick={() => act('simulation_comment')}>
                      ثبت کامنت نمایشی
                    </button>
                  )}
                </div>
                {comments.map((comment) => (
                  <div className="comment-row" key={comment.id}>
                    <p>{comment.text}</p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => act('manual', { commentId: comment.id })}
                    >
                      {simulated ? 'آزمایش پاسخ' : 'ارسال پاسخ خصوصی'}
                    </button>
                  </div>
                ))}
                {!simulated && (
                  <button
                    className="secondary"
                    disabled={busy || !connected}
                    onClick={() => act('subscribe')}
                  >
                    فعال‌سازی اشتراک comments
                  </button>
                )}
                <p className="helper">
                  هر کامنت فقط یک پاسخ خصوصی می‌گیرد. آزمایش دوم را با کامنت تازه انجام بده. پاسخ
                  خودکار نیاز به webhook واقعی و دسترسی لازم در متا دارد.
                </p>
              </Section>
            </div>
            <aside className="preview-aside">
              <div className="preview-card">
                <div className="preview-heading">
                  <span className="dot" />
                  پیش‌نمایش پاسخ
                </div>
                <p className="preview-hint">چیزی که قصد داری برای کامنت‌گذار بفرستی.</p>
                <div className="phone-preview">
                  <div className="phone-header">
                    <span className="avatar small-avatar">A</span>
                    <div>
                      <strong>{connected ? state.connection?.username : 'پیج شما'}</strong>
                      <small>پاسخ خصوصی</small>
                    </div>
                    <span>•••</span>
                  </div>
                  <div className="phone-body">
                    <span className="sample-comment">کامنت: {rule.keyword || 'کلمهٔ شما'}</span>
                    <div className="message-bubble">
                      <p>{rule.replyText || 'متن پاسخ اینجا نمایش داده می‌شود.'}</p>
                      {rule.link && (
                        <span dir="ltr" className="preview-url">
                          {rule.link}
                        </span>
                      )}
                    </div>
                    <span className="preview-only">فقط پیش‌نمایش؛ ارسال نشده</span>
                  </div>
                </div>
                <div className="tip">
                  <strong>یک شروع خوب، کوتاه و روشن است.</strong>
                  <p>بگو لینک مربوط به چیست تا مخاطب بداند چه چیزی را باز می‌کند.</p>
                </div>
              </div>
              <details className="technical-settings">
                <summary>تنظیمات اتصال متا</summary>
                <label>
                  OAuth callback<code dir="ltr">{state.config.callbackUrl}</code>
                </label>
                <button className="text-button" onClick={() => copy(state.config.callbackUrl)}>
                  کپی آدرس
                </button>
                <label>
                  Webhook callback<code dir="ltr">{state.config.webhookUrl}</code>
                </label>
                <button className="text-button" onClick={() => copy(state.config.webhookUrl)}>
                  کپی آدرس
                </button>
                <p>
                  اشتراک حساب:{' '}
                  {state.connection?.subscribed
                    ? 'API پذیرفته؛ دریافت واقعی باید بررسی شود'
                    : 'ثبت نشده'}
                </p>
                <a href="/guide">راهنمای تنظیمات ←</a>
              </details>
            </aside>
          </div>
        ) : (
          <section className="card activity-card">
            <div className="activity-heading">
              <div>
                <h2>گزارش درخواست‌ها</h2>
                <p>آخرین ۵۰ مورد · پذیرش API به‌معنی مشاهدهٔ پیام نیست.</p>
              </div>
              <button className="secondary" disabled={busy} onClick={() => load(true)}>
                تازه‌سازی ↻
              </button>
            </div>
            {!state.deliveries.length ? (
              <div className="empty-state">
                <span>↗</span>
                <h3>هنوز پاسخی در مسیر نیست.</h3>
                <p>یک اتوماسیون بساز و اولین کامنت را آزمایش کن.</p>
                <button onClick={() => setTab('setup')}>شروع راه‌اندازی</button>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>نتیجه</th>
                      <th>مسیر</th>
                      <th>زمان</th>
                      <th>تلاش</th>
                      <th>بررسی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.deliveries.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className={'status-badge status-' + item.status}>
                            {statuses[item.status] ?? item.status}
                          </span>
                          {item.errorKind && (
                            <small>
                              {errors[item.errorKind] ?? 'خطای پردازش'}
                              {item.errorCode ? ' (' + item.errorCode + ')' : ''}
                            </small>
                          )}
                        </td>
                        <td>
                          {item.provider === 'meta' ? 'Meta' : 'شبیه‌سازی'}
                          <small>
                            {item.source === 'webhook'
                              ? 'کامنت واقعی'
                              : item.source === 'manual'
                                ? 'درخواست دستی'
                                : 'رویداد نمایشی'}
                          </small>
                        </td>
                        <td>
                          <time dateTime={item.createdAt}>
                            {new Date(item.createdAt).toLocaleString('fa-IR', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </td>
                        <td>{item.attempts.toLocaleString('fa-IR')}</td>
                        <td>
                          {item.observedAt ? (
                            <span className="status-good">مشاهده ثبت شد</span>
                          ) : item.provider === 'meta' && item.status === 'accepted' ? (
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() => act('observed', { id: item.id })}
                            >
                              پیام را دیدم
                            </button>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        <footer className="workspace-footer">
          AiDirect · ابزار آزمایش یک پیج. نسخهٔ چندمشتری پس از اثبات مسیر واقعی ساخته می‌شود.
        </footer>
      </div>
    </div>
  );
}
