'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { InstagramLogoIcon } from '@phosphor-icons/react/dist/csr/InstagramLogo';
import { ShieldCheckIcon } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { Brand } from '../../ui';
import styles from './connect.module.css';

type State = {
  role?: 'operator' | 'owner';
  status: 'loading' | 'invite_required' | 'ready' | 'completed' | 'unavailable';
  expiresAt?: string;
};
export default function InstagramConnect() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/sendbox/invite', {
        cache: 'no-store',
        signal: signal ?? AbortSignal.timeout(15000),
      });
      if (response.status === 401) {
        setState({ status: 'invite_required' });
        return;
      }
      if (!response.ok) throw new Error();
      const result = await response.json();
      setState(result);
      if (result.role === 'owner' && ['ready', 'completed'].includes(result.status)) setToken('');
    } catch {
      if (!signal?.aborted) setState({ status: 'unavailable' });
    }
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const invite = new URLSearchParams(url.hash.slice(1)).get('token');
    if (invite && /^[\w-]{43}$/.test(invite)) setToken(invite);
    else if (invite) setMessage('لینک دعوت معتبر نیست؛ از مدیر لینک تازه بگیر.');
    if (url.searchParams.has('result') && url.searchParams.get('result') !== 'connected')
      setMessage('اتصال کامل نشد. وضعیت حساب یا اعتبار دعوت را بررسی کن و دوباره شروع کن.');
    window.history.replaceState(null, '', '/connect/instagram');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setState({ status: 'unavailable' });
    }, 15000);
    void load(controller.signal).finally(() => window.clearTimeout(timeout));
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [load]);
  async function redeem() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/sendbox/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redeem', token }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        setToken('');
        setState({ status: 'invite_required' });
        setMessage('این دعوت قابل استفاده نیست؛ از مدیر لینک تازه بگیر.');
        return;
      }
      setToken('');
      await load();
    } catch {
      setMessage(
        'ارتباط کامل نشد. ممکن است دعوت پذیرفته شده باشد؛ ابتدا وضعیت را دوباره بررسی کن.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.page}>
      <header>
        <Brand />
        <a href="/admin">ورود مدیر</a>
      </header>
      <main className={styles.layout}>
        <section className={styles.intro}>
          <span>اتصال اینستاگرام</span>
          <h1>
            پیج از تو. <br />
            مسیر گفتگو، <br />
            <em>از اینجا.</em>
          </h1>
          <p>برای اتصال، رمز اینستاگرامت را فقط در صفحهٔ Instagram وارد کن.</p>
        </section>
        <section className={styles.card} aria-labelledby="owner-title">
          <InstagramLogoIcon size={39} className={styles.instagram} aria-hidden="true" />
          <h2 id="owner-title">
            {state.status === 'completed' ? 'اتصال ثبت شد.' : 'یک قدم تا اتصال پیجت.'}
          </h2>
          <p>
            این مسیر برای آزمایش یک حساب حرفه‌ای Business یا Creator است. اتصال از طریق سرویس
            Sendbox انجام می‌شود؛ رمز مدیر AiDirect را لازم نداری.
          </p>
          <ul>
            <li>مالک یا مدیر مجاز پیج باش.</li>
            <li>حساب باید سالم و حرفه‌ای باشد.</li>
            <li>دسترسی فقط برای اتصال پیج است، نه پنل مدیریت.</li>
          </ul>
          {message && (
            <div className={styles.notice} role="status">
              <p>{message}</p>
              <button
                className={styles.statusButton}
                onClick={() => {
                  void load();
                }}
              >
                بررسی وضعیت دسترسی
              </button>
            </div>
          )}
          {token ? (
            <button
              className={styles.primary}
              disabled={busy}
              onClick={() => {
                void redeem();
              }}
            >
              {busy ? 'در حال بررسی دعوت…' : 'پذیرش دعوت و ادامه'}
              <ArrowLeftIcon size={21} aria-hidden="true" />
            </button>
          ) : state.status === 'loading' ? (
            <p role="status">در حال بررسی دسترسی…</p>
          ) : state.status === 'completed' ? (
            <p className={styles.success} role="status">
              اتصال از سمت سرور تأیید شد. برای ادامهٔ آزمایش به دعوت‌کننده خبر بده.
            </p>
          ) : state.status === 'ready' ? (
            <a className={styles.primary} href="/api/sendbox/connect">
              ادامه در اینستاگرام
              <ArrowLeftIcon size={21} aria-hidden="true" />
            </a>
          ) : state.status === 'unavailable' ? (
            <button
              className={styles.primary}
              onClick={() => {
                void load();
              }}
            >
              بررسی دوباره
            </button>
          ) : (
            <div className={styles.required}>
              <p>برای اتصال بدون رمز مدیر، لینک دعوت خصوصی را از صاحب AiDirect بگیر.</p>
              <a href="/admin">مدیر هستی؟ وارد پنل شو.</a>
            </div>
          )}
          <p className={styles.privacy}>
            <ShieldCheckIcon size={20} aria-hidden="true" />
            با ادامه، اجازهٔ ذخیرهٔ شناسه و نام پیج و دریافت رویدادهای کامنت برای آزمایش را می‌دهی.
            ارسال خودکار فعلاً خاموش است.
          </p>
          <nav aria-label="اطلاعات اتصال">
            <a href="/privacy">حریم خصوصی</a>
            <a href="/data-deletion">حذف داده‌ها</a>
          </nav>
        </section>
      </main>
    </div>
  );
}
