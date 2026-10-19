'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import AccessFrame, { AccessIcon } from '../access-frame';
import LoginScreen from '../login-screen';
type Status = {
  configured: boolean;
  sendingEnabled: false;
  connection: { username: string; expiresAt: string } | null;
  events: { eventType: string; receivedAt: string }[];
};
const eventLabels: Record<string, string> = {
  comments: 'کامنت تازه دریافت شد',
  'action.private_reply': 'نتیجهٔ درخواست پاسخ دریافت شد',
  'action.list_posts': 'نتیجهٔ درخواست پست‌ها دریافت شد',
  'action.comment_comments': 'نتیجهٔ درخواست کامنت‌ها دریافت شد',
};
export default function SendboxPanel() {
  const [state, setState] = useState<Status | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const actionPending = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/sendbox', {
        cache: 'no-store',
        signal: signal ?? AbortSignal.timeout(15000),
      });
      if (response.status === 401) {
        setState(null);
        setNeedsLogin(true);
        return;
      }
      if (!response.ok) throw new Error();
      setState(await response.json());
      setNeedsLogin(false);
      setError(false);
    } catch {
      if (signal?.aborted) return;
      setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    void load(controller.signal).finally(() => {
      window.clearTimeout(timeout);
      if (active && controller.signal.aborted) {
        setError(true);
        setLoading(false);
      }
    });
    const result = new URLSearchParams(window.location.search).get('result');
    const messages: Record<string, string> = {
      connected: 'حساب متصل شد. حالا وضعیتش را اینجا می‌بینی.',
      settings_required: 'اتصال حساب فعلاً آماده نیست. کمی بعد دوباره تلاش کن.',
      connect_not_ready: 'اتصال شروع نشد. ورودت را بررسی کن و دوباره تلاش کن.',
      connection_failed: 'اتصال کامل نشد. می‌توانی دوباره از همین‌جا شروع کنی.',
    };
    if (result) {
      setMessage(messages[result] ?? 'وضعیت حساب را بررسی کن.');
      window.history.replaceState(null, '', window.location.pathname);
    }
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [load]);
  async function action(kind: 'logout' | 'disconnect') {
    if (actionPending.current) return;
    if (
      kind === 'disconnect' &&
      !window.confirm(
        'حساب و فعالیت‌های آن از AiDirect پاک شوند؟ برای لغو مجوز اینستاگرام، تنظیمات برنامه‌ها و وب‌سایت‌های Instagram را هم بررسی کن.',
      )
    )
      return;
    actionPending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(kind === 'logout' ? '/api/proof' : '/api/sendbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: kind }),
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 401 || (kind === 'logout' && response.ok)) {
        setState(null);
        setNeedsLogin(true);
        return;
      }
      if (!response.ok) throw new Error();
      await load();
      setMessage('اتصال حساب و فعالیت‌های آن از AiDirect حذف شدند.');
    } catch {
      setMessage('عملیات کامل نشد. وضعیت حساب را بررسی کن و دوباره تلاش کن.');
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  if (needsLogin) return <LoginScreen destination="/sendbox" />;
  const connected = Boolean(
    state?.connection && Date.parse(state.connection.expiresAt) > Date.now(),
  );
  return (
    <AccessFrame
      step="connect"
      action={
        state && (
          <button
            className="access-exit"
            onClick={() => {
              void action('logout');
            }}
            disabled={busy}
          >
            خروج
          </button>
        )
      }
    >
      <div className="access-heading">
        <a className="access-text-button" href="/admin">
          بازگشت به پنل مدیریت
        </a>
        <span className="access-kicker">حساب اینستاگرام</span>
        <h1>
          {connected ? (
            <>
              حساب تو،
              <br />
              همین‌جاست<span>.</span>
            </>
          ) : (
            <>
              پیجت را
              <br />
              به گفتگو وصل کن<span>.</span>
            </>
          )}
        </h1>
        <p>
          {connected
            ? 'اتصال و فعالیت‌های حسابت را از اینجا دنبال کن.'
            : 'ورود به اینستاگرام، یک قدم تا اتصال حسابت.'}
        </p>
      </div>
      {message && (
        <p className="access-feedback" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <div className="account-loading" role="status">
          <span className="access-busy" aria-hidden="true" />
          در حال بررسی حساب…
        </div>
      ) : error ? (
        <div className="account-unavailable">
          <p role="alert">وضعیت حساب دریافت نشد. دوباره بررسی کنیم؟</p>
          <button
            className="access-primary"
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            تلاش دوباره
            <AccessIcon name="arrow" />
          </button>
        </div>
      ) : (
        state && (
          <>
            <div className="account-identity">
              <span className="account-avatar">
                <AccessIcon name="instagram" />
              </span>
              <div>
                <strong>
                  {state.connection ? <bdi>@{state.connection.username}</bdi> : 'اینستاگرام تو'}
                </strong>
                <span>
                  {connected
                    ? 'متصل به AiDirect'
                    : state.connection
                      ? 'نیاز به ورود دوباره'
                      : 'هنوز حسابی متصل نکرده‌ای'}
                </span>
              </div>
              {connected && (
                <span className="account-check">
                  <AccessIcon name="check" />
                </span>
              )}
            </div>
            {!connected && (
              <>
                <a
                  className={'access-primary' + (!state.configured || busy ? ' is-disabled' : '')}
                  href={state.configured && !busy ? '/api/sendbox/connect' : undefined}
                  aria-disabled={!state.configured || busy}
                >
                  <span>
                    {state.connection ? 'ورود دوباره به اینستاگرام' : 'اتصال با اینستاگرام'}
                  </span>
                  <AccessIcon name="arrow" />
                </a>
                {!state.configured && (
                  <p className="access-feedback" role="status">
                    اتصال حساب موقتاً در دسترس نیست. کمی بعد دوباره بررسی کن.
                  </p>
                )}
                <div className="access-security">
                  <AccessIcon name="lock" />
                  <p>
                    ورود در صفحهٔ رسمی Instagram انجام می‌شود.
                    <br />
                    <span>AiDirect رمز اینستاگرامت را دریافت نمی‌کند.</span>
                  </p>
                </div>
                <p className="access-footnote">حساب Business یا Creator خودت را متصل کن.</p>
              </>
            )}
            {connected && (
              <div className="account-send-status">
                <span className="account-status-dot" />
                پاسخ خصوصی کامنت فعلاً غیرفعال است.{' '}
                <a href="/admin/inbox">مدیریت پاسخ دایرکت آزمایشی</a>
              </div>
            )}
            <div className="account-activity">
              <div className="account-section-title">
                <h2>فعالیت حساب</h2>
                <button
                  className="access-text-button"
                  disabled={busy}
                  onClick={() => {
                    void load();
                  }}
                >
                  تازه‌سازی
                </button>
              </div>
              {state.events.length ? (
                <ul>
                  {state.events.map((event, index) => (
                    <li key={event.receivedAt + index}>
                      <span>{eventLabels[event.eventType] ?? 'رویداد جدید حساب'}</span>
                      <time dateTime={event.receivedAt}>
                        {new Date(event.receivedAt).toLocaleString('fa-IR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="account-empty">
                  هنوز فعالیتی ثبت نشده.
                  <span>رویدادهای حساب پس از اتصال، اینجا نمایش داده می‌شوند.</span>
                </p>
              )}
            </div>
            {state.connection && (
              <details className="account-manage">
                <summary>مدیریت اتصال</summary>
                <p>
                  این گزینه اتصال و فعالیت‌های حساب را از AiDirect حذف می‌کند. لغو دسترسی در
                  Instagram جداگانه انجام می‌شود.
                </p>
                <button
                  className="access-text-button access-danger"
                  disabled={busy}
                  onClick={() => {
                    void action('disconnect');
                  }}
                >
                  قطع اتصال از AiDirect
                </button>
              </details>
            )}
          </>
        )
      )}
    </AccessFrame>
  );
}
