'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { LinkIcon } from '@phosphor-icons/react/dist/csr/Link';
import { InstagramLogoIcon } from '@phosphor-icons/react/dist/csr/InstagramLogo';
import { ChatTextIcon } from '@phosphor-icons/react/dist/csr/ChatText';
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { TerminalWindowIcon } from '@phosphor-icons/react/dist/csr/TerminalWindow';
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { UserPlusIcon } from '@phosphor-icons/react/dist/csr/UserPlus';
import { PaperPlaneTiltIcon } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import Image from 'next/image';
import { Brand } from '../ui';
import LoginScreen from '../login-screen';
import styles from './admin.module.css';

type Invite = {
  id: string;
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
};
type Overview = {
  configured: boolean;
  sendingEnabled: false;
  connection: { username: string; expiresAt: string; connectedAt: string } | null;
  events: { eventId: string; eventType: string; receivedAt: string }[];
  eventCount: number;
  invites: Invite[];
};
const eventLabels: Record<string, string> = {
  comments: 'کامنت تازه دریافت شد',
  'action.private_reply': 'نتیجهٔ درخواست پاسخ',
  'action.list_posts': 'نتیجهٔ درخواست پست‌ها',
  'action.comment_comments': 'نتیجهٔ درخواست کامنت‌ها',
};
function date(value: string) {
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
function inviteStatus(invite: Invite) {
  return invite.usedAt
    ? 'اتصال کامل شد'
    : invite.revokedAt
      ? 'لغوشده'
      : Date.parse(invite.expiresAt) <= Date.now()
        ? 'منقضی'
        : invite.claimedAt
          ? 'پذیرفته‌شده'
          : 'آمادهٔ اشتراک';
}

export default function AdminPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [share, setShare] = useState<{ url: string; expiresAt: string } | null>(null);
  const pending = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/admin', {
        cache: 'no-store',
        signal: signal ?? AbortSignal.timeout(15000),
      });
      if (response.status === 401) {
        setNeedsLogin(true);
        return;
      }
      if (!response.ok) throw new Error();
      setData(await response.json());
      setFailed(false);
    } catch {
      if (!signal?.aborted) setFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setFailed(true);
      setLoading(false);
    }, 15000);
    void load(controller.signal).finally(() => window.clearTimeout(timeout));
    const result = new URLSearchParams(window.location.search).get('result');
    if (result) {
      setMessage(
        result === 'connected'
          ? 'بازگشت از اتصال انجام شد؛ وضعیت تأییدشده را در پنل می‌بینی.'
          : 'اتصال کامل نشد. می‌توانی دوباره شروع کنی.',
      );
      window.history.replaceState(null, '', '/admin');
    }
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [load]);

  async function action(kind: 'create' | 'revoke' | 'inspect' | 'logout', id?: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        kind === 'logout'
          ? '/api/proof'
          : kind === 'inspect'
            ? '/api/sendbox'
            : '/api/sendbox/invite',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: kind, ...(id ? { id } : {}) }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (response.status === 401) {
        setNeedsLogin(true);
        return;
      }
      if (kind === 'logout' && response.ok) {
        setNeedsLogin(true);
        return;
      }
      const result = await response.json();
      if (!response.ok) {
        setMessage(
          result.error === 'disconnect_first'
            ? 'اول اتصال فعلی را از بخش مدیریت حساب قطع کن؛ سپس دعوت بساز.'
            : 'عملیات کامل نشد. سرویس یا اتصال را بررسی کن و دوباره تلاش کن.',
        );
        return;
      }
      if (kind === 'create') {
        setShare({ url: result.url, expiresAt: result.expiresAt });
        setMessage('دعوت ساخته شد. لینک را فقط برای صاحب پیج بفرست.');
      }
      if (kind === 'revoke') {
        setShare(null);
        setMessage('دعوت لغو شد؛ لینک قبلی دیگر قابل استفاده نیست.');
      }
      if (kind === 'inspect')
        setMessage(
          result.configured
            ? `تنظیمات سرویس درست است؛ ${new Intl.NumberFormat('fa-IR').format(result.accounts.length)} حساب در سرویس دیده شد.`
            : 'تنظیمات سرویس نیاز به بررسی دارد.',
        );
      await load();
    } catch {
      setMessage('نتیجهٔ عملیات دریافت نشد. قبل از تلاش دوباره، پنل را تازه‌سازی کن.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function copy() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setMessage('لینک دعوت کپی شد.');
    } catch {
      setMessage('کپی خودکار در دسترس نیست؛ لینک را از کادر انتخاب و کپی کن.');
    }
  }
  if (needsLogin) return <LoginScreen destination="/admin" />;
  const connected = Boolean(data?.connection && Date.parse(data.connection.expiresAt) > Date.now());
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Brand />
        <nav aria-label="بخش‌های مدیریت">
          <a href="#overview" aria-current="page">
            <SquaresFourIcon aria-hidden="true" size={22} weight="fill" />
            نمای کلی
          </a>
          <a href="#invites">
            <LinkIcon aria-hidden="true" size={22} />
            دعوت اتصال
          </a>
          <a href="#events">
            <ChatTextIcon aria-hidden="true" size={22} />
            رویدادها
          </a>
          <a href="/proof">
            <TerminalWindowIcon aria-hidden="true" size={22} />
            پنل فنی
          </a>
        </nav>
        <button
          className={styles.logout}
          onClick={() => {
            void action('logout');
          }}
          disabled={busy}
        >
          <SignOutIcon aria-hidden="true" size={22} />
          خروج
        </button>
      </aside>
      <main className={styles.main} id="overview">
        <header className={styles.header}>
          <div>
            <h1>اتاق کنترل</h1>
            <p>اتصال‌ها و دعوت‌ها، یک‌جا.</p>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.outline}
              onClick={() => {
                void action('inspect');
              }}
              disabled={busy || loading}
            >
              بررسی سرویس
            </button>
            <a className={styles.outline} href="/">
              نمای سایت
              <ArrowSquareOutIcon aria-hidden="true" size={18} />
            </a>
          </div>
        </header>
        {message && (
          <p className={styles.notice} role="status">
            {message}
          </p>
        )}
        {failed && (
          <div className={styles.notice} role="alert">
            وضعیت پنل دریافت نشد.{' '}
            <button
              className={styles.textButton}
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              تلاش دوباره
            </button>
          </div>
        )}
        <section className={styles.welcome} aria-labelledby="connection-title">
          <Image
            className={styles.bannerArt}
            src="/images/admin-banner-v2.webp"
            width={400}
            height={360}
            alt=""
          />
          <div className={styles.welcomeContent}>
            <h2 id="connection-title">
              {connected ? 'پیجت وصل است. مسیر را بررسی کنیم.' : 'اول، یک پیج واقعی وصل کنیم.'}
            </h2>
            <p>
              {data?.connection ? (
                <>
                  <bdi>@{data.connection.username}</bdi> ·{' '}
                  {connected
                    ? `اعتبار اتصال تا ${date(data.connection.expiresAt)}`
                    : 'اعتبار اتصال تمام شده؛ دوباره وارد اینستاگرام شو.'}
                </>
              ) : (
                'حساب حرفه‌ای خودت را وصل کن یا برای صاحب پیج دعوت بفرست.'
              )}
            </p>
            <div className={styles.welcomeActions}>
              <a
                className={styles.darkButton}
                href={data?.configured ? '/api/sendbox/connect' : '/connect/instagram'}
              >
                <InstagramLogoIcon aria-hidden="true" size={22} />
                {connected ? 'ورود دوباره به اینستاگرام' : 'اتصال اینستاگرام'}
              </a>
              <button
                className={styles.darkOutline}
                onClick={() => {
                  void action('create');
                }}
                disabled={busy || !data?.configured || Boolean(data?.connection)}
              >
                <LinkIcon aria-hidden="true" size={21} />
                ساخت لینک دعوت
              </button>
              {data?.connection && (
                <a className={styles.manageLink} href="/sendbox">
                  مدیریت اتصال
                </a>
              )}
            </div>
          </div>
        </section>
        <section className={styles.summary} aria-label="وضعیت واقعی آزمایش">
          <div>
            <InstagramLogoIcon aria-hidden="true" size={29} />
            <p>
              <strong>
                {loading
                  ? '…'
                  : !data
                    ? '—'
                    : new Intl.NumberFormat('fa-IR').format(connected ? 1 : 0)}
              </strong>
              <span>پیج متصل</span>
            </p>
          </div>
          <div>
            <ChatTextIcon aria-hidden="true" size={29} />
            <p>
              <strong>
                {loading
                  ? '…'
                  : !data
                    ? '—'
                    : new Intl.NumberFormat('fa-IR').format(data.eventCount)}
              </strong>
              <span>رویداد دریافت‌شده</span>
            </p>
          </div>
          <div>
            <PaperPlaneTiltIcon aria-hidden="true" size={29} />
            <p>
              <strong className={styles.noSending}>ارسال غیرفعال</strong>
              <span>در مرحلهٔ اثبات اتصال</span>
            </p>
          </div>
        </section>
        <div className={styles.panels}>
          <section className={styles.panel} id="invites" aria-labelledby="invites-title">
            <div className={styles.panelHeader}>
              <h2 id="invites-title">
                <LinkIcon aria-hidden="true" size={23} />
                دعوت‌های اتصال
              </h2>
              <button
                className={styles.yellowButton}
                onClick={() => {
                  void action('create');
                }}
                disabled={busy || !data?.configured || Boolean(data?.connection)}
              >
                <PlusIcon aria-hidden="true" size={18} />
                دعوت تازه
              </button>
            </div>
            {share && (
              <div className={styles.shareBox}>
                <label htmlFor="invite-link">لینک خصوصی؛ معتبر تا {date(share.expiresAt)}</label>
                <div>
                  <input
                    id="invite-link"
                    value={share.url}
                    readOnly
                    dir="ltr"
                    onFocus={(event) => event.target.select()}
                  />
                  <button
                    className={styles.yellowButton}
                    type="button"
                    onClick={() => {
                      void copy();
                    }}
                    aria-label="کپی لینک دعوت"
                  >
                    <CopyIcon aria-hidden="true" size={20} />
                  </button>
                </div>
              </div>
            )}
            {loading || !data ? (
              <p role="status">
                {loading ? 'در حال دریافت دعوت‌ها…' : 'وضعیت دعوت‌ها هنوز مشخص نیست.'}
              </p>
            ) : data?.invites.length ? (
              <ul className={styles.inviteList}>
                {data.invites.map((invite) => (
                  <li key={invite.id}>
                    <div>
                      <strong>{inviteStatus(invite)}</strong>
                      <span>
                        ساخته‌شده {date(invite.createdAt)} · انقضا {date(invite.expiresAt)}
                      </span>
                    </div>
                    {!invite.usedAt &&
                      !invite.revokedAt &&
                      Date.parse(invite.expiresAt) > Date.now() && (
                        <button
                          className={styles.textButton}
                          disabled={busy}
                          onClick={() => {
                            void action('revoke', invite.id);
                          }}
                        >
                          لغو دعوت
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.empty}>
                <UserPlusIcon aria-hidden="true" size={38} />
                <h3>دعوتی نساخته‌ای.</h3>
                <p>دو ساعت اعتبار؛ بدون دسترسی به پنل مدیریت.</p>
              </div>
            )}
            <p className={styles.panelFoot}>
              <InfoIcon aria-hidden="true" size={18} />
              دعوت تازه، دعوت فعال قبلی را لغو می‌کند. رمز مدیر را برای صاحب پیج نفرست.
            </p>
          </section>
          <section className={styles.panel} id="events" aria-labelledby="events-title">
            <div className={styles.panelHeader}>
              <h2 id="events-title">
                <ClockIcon aria-hidden="true" size={23} />
                آخرین رویدادها
              </h2>
            </div>
            {loading || !data ? (
              <p role="status">
                {loading ? 'در حال دریافت رویدادها…' : 'وضعیت رویدادها هنوز مشخص نیست.'}
              </p>
            ) : data?.events.length ? (
              <ul className={styles.eventList}>
                {data.events.map((event) => (
                  <li key={event.eventId}>
                    <ChatTextIcon aria-hidden="true" size={20} />
                    <div>
                      <strong>{eventLabels[event.eventType] ?? 'رویداد سرویس دریافت شد'}</strong>
                      <time dateTime={event.receivedAt}>{date(event.receivedAt)}</time>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.empty}>
                <ChatTextIcon aria-hidden="true" size={38} />
                <h3>هنوز رویدادی دریافت نشده.</h3>
                <p>پس از اتصال پیج، رویدادهای تازه اینجا دیده می‌شوند.</p>
              </div>
            )}
            <button
              className={styles.outline}
              onClick={() => {
                setLoading(true);
                void load();
              }}
              disabled={busy || loading}
            >
              <ArrowClockwiseIcon aria-hidden="true" size={19} />
              تازه‌سازی
            </button>
          </section>
        </div>
        <footer className={styles.footer}>
          <InfoIcon aria-hidden="true" size={17} />
          دریافت رویداد، ارسال پیام را ثابت نمی‌کند. ارسال پاسخ واقعی هنوز فعال نیست.
        </footer>
      </main>
    </div>
  );
}
