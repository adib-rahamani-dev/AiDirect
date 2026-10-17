'use client';
import { useEffect, useState } from 'react';
type Status = {
  configured: boolean;
  sendingEnabled: false;
  connection: { username: string; expiresAt: string } | null;
  events: { eventType: string; receivedAt: string }[];
};
type Inspection = {
  configured: boolean;
  accountLimit: number;
  accounts: { id: string; username: string; is_active: boolean }[];
};
export default function SendboxPanel() {
  const [state, setState] = useState<Status | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    try {
      const response = await fetch('/api/sendbox', { cache: 'no-store' });
      if (response.status === 401) {
        setLogin(true);
        return;
      }
      if (!response.ok) throw new Error();
      setState(await response.json());
      setLogin(false);
    } catch {
      setMessage('بررسی وضعیت ممکن نشد؛ دوباره تلاش کن.');
    }
  }
  useEffect(() => {
    void load();
    const result = new URLSearchParams(window.location.search).get('result');
    const messages: Record<string, string> = {
      connected: 'اتصال پیج با API سرویس تأیید شد؛ ارسال پیام هنوز فعال نیست.',
      settings_required: 'ابتدا Domain و Redirect URL را در پنل سرویس ذخیره کن.',
      connect_not_ready: 'تنظیمات اتصال کامل نیست یا نشست مدیریت تمام شده است.',
      connection_failed: 'اتصال تأیید نشد. از همین صفحه اتصال را دوباره شروع کن.',
    };
    if (result) setMessage(messages[result] ?? 'وضعیت اتصال را بررسی کن.');
  }, []);
  async function inspect() {
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/sendbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'inspect' }),
      });
      if (!r.ok) throw new Error();
      setInspection(await r.json());
      await load();
    } catch {
      setMessage('API در دسترس نیست یا نشست مدیریت تمام شده؛ ورود و تنظیمات سرور را بررسی کن.');
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    if (
      !window.confirm(
        'اتصال محلی و رویدادهای Sendbox از AiDirect حذف شوند؟ لغو دسترسی در پنل سرویس جداگانه است.',
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch('/api/sendbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      if (!response.ok) throw new Error();
      setInspection(null);
      await load();
      setMessage(
        'اتصال محلی و رویدادها حذف شدند. برای لغو دسترسی، پنل سرویس یا تنظیمات Instagram را باز کن.',
      );
    } catch {
      setMessage('حذف اتصال محلی انجام نشد؛ دوباره بررسی کن.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" aria-label="وضعیت اتصال Sendbox">
      {message && <p role="status">{message}</p>}
      {login ? (
        <p>
          برای بررسی اتصال، ابتدا <a href="/">وارد پنل مدیریت شو</a> و به این صفحه برگرد.
        </p>
      ) : state ? (
        <>
          <p>تنظیمات خصوصی سرور: {state.configured ? 'ثبت شده' : 'ناقص'}</p>
          <p>
            پیج متصل به AiDirect:{' '}
            {state.connection ? <bdi>@{state.connection.username}</bdi> : 'هنوز متصل نشده'}
          </p>
          <p>ارسال پاسخ خصوصی: در انتظار اثبات مسیر واقعی</p>
          <div className="sendbox-actions">
            <button disabled={busy} onClick={inspect}>
              {busy ? 'در حال بررسی…' : 'بررسی تنظیمات سرویس'}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                void load();
              }}
            >
              به‌روزرسانی رویدادها
            </button>
            {inspection?.configured && state.configured && (
              <a className="button" href="/api/sendbox/connect">
                اتصال پیج با اینستاگرام
              </a>
            )}
            {state.connection && (
              <button className="secondary" disabled={busy} onClick={disconnect}>
                قطع اتصال محلی و حذف رویدادها
              </button>
            )}
          </div>
          {inspection && (
            <p role="status">
              دامنه و مسیر بازگشت: {inspection.configured ? 'صحیح' : 'نیازمند اصلاح در پنل سرویس'}.
              تعداد پیج‌های سرویس: {inspection.accounts.length}؛ سقف پلن: {inspection.accountLimit}.
            </p>
          )}
          <h2>رویدادهای امضاشدهٔ اخیر</h2>
          {state.events.length ? (
            <ul>
              {state.events.map((event, i) => (
                <li key={i}>
                  <bdi>{event.eventType}</bdi> —{' '}
                  <time dateTime={event.receivedAt}>
                    {new Date(event.receivedAt).toLocaleString('fa-IR')}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p>هنوز رویدادی از پیج متصل ثبت نشده است.</p>
          )}
        </>
      ) : (
        !login && <p role="status">در حال بررسی وضعیت…</p>
      )}
    </section>
  );
}
