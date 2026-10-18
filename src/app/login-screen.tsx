'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import AccessFrame, { AccessIcon } from './access-frame';
import { loginDestination } from '@/lib/login-destination';
export default function LoginScreen({
  initialMessage = '',
  destination = '/sendbox',
}: {
  initialMessage?: string;
  destination?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const submitting = useRef(false);
  const messageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!retryAt) return;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) setRetryAt(0);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || Date.now() < retryAt) return;
    submitting.current = true;
    setPending(true);
    setMessage('');
    try {
      const response = await fetch('/api/proof/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        if (response.status === 429) {
          const seconds = Math.min(
            60,
            Math.max(1, Number(response.headers.get('retry-after')) || 3),
          );
          setRemaining(Math.ceil(seconds));
          setRetryAt(Date.now() + seconds * 1000);
          setMessage('چند لحظه صبر کن؛ بعد دوباره می‌توانی وارد شوی.');
        } else if (response.status === 401)
          setMessage('ایمیل یا رمز عبور درست نیست. دوباره بررسی کن.');
        else setMessage('ورود فعلاً انجام نشد. کمی بعد دوباره تلاش کن.');
        requestAnimationFrame(() => messageRef.current?.focus());
        return;
      }
      setPassword('');
      setVisible(false);
      window.location.assign(loginDestination(destination));
    } catch {
      setMessage('ارتباط کامل نشد. اتصال اینترنت را بررسی کن و دوباره تلاش کن.');
      requestAnimationFrame(() => messageRef.current?.focus());
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <AccessFrame>
      <div className="access-heading">
        <span className="access-kicker">
          {destination === '/admin' ? 'ورود مدیر' : 'فضای کار تو'}
        </span>
        <h1>
          ادامهٔ گفتگو
          <br />
          از اینجاست<span>.</span>
        </h1>
        <p>با حساب AiDirect وارد شو و پیجت را متصل کن.</p>
      </div>
      <form className="access-form" onSubmit={login} aria-busy={pending}>
        {message && (
          <div className="access-feedback" role="alert" tabIndex={-1} ref={messageRef}>
            {message}
          </div>
        )}
        <div className="access-field">
          <label htmlFor="access-email">ایمیل</label>
          <input
            id="access-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
            disabled={pending}
          />
        </div>
        <div className="access-field">
          <label htmlFor="access-password">رمز عبور</label>
          <div className="access-password">
            <input
              id="access-password"
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
              onKeyDown={(e) => setCapsLock(e.getModifierState('CapsLock'))}
              onBlur={() => setCapsLock(false)}
              aria-describedby={capsLock ? 'caps-lock-hint' : undefined}
              required
              maxLength={256}
              disabled={pending}
            />
            <button
              type="button"
              className="access-reveal"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
              aria-controls="access-password"
              aria-pressed={visible}
              disabled={pending}
            >
              <AccessIcon name="eye" />
            </button>
          </div>
          {capsLock && (
            <span id="caps-lock-hint" className="access-input-hint">
              کلید Caps Lock روشن است.
            </span>
          )}
        </div>
        <button className="access-primary" type="submit" disabled={pending || remaining > 0}>
          <span>
            {pending
              ? 'در حال ورود…'
              : remaining
                ? `${remaining.toLocaleString('fa-IR')} ثانیه تا تلاش بعدی`
                : 'ورود به فضای کار'}
          </span>
          {pending ? (
            <span className="access-busy" aria-hidden="true" />
          ) : (
            <AccessIcon name="arrow" />
          )}
        </button>
        <div className="access-security">
          <AccessIcon name="lock" />
          <p>
            این رمز برای پنل AiDirect است.
            <br />
            <span>حساب اینستاگرام را در مرحلهٔ بعد متصل می‌کنی.</span>
          </p>
        </div>
      </form>
      <p className="access-footnote">دسترسی این نسخه با دعوت مدیر است.</p>
    </AccessFrame>
  );
}
