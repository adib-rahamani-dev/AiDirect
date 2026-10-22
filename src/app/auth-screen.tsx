'use client';
import { useRef, useState, type FormEvent } from 'react';
import AccessFrame, { AccessIcon } from './access-frame';
export default function AuthScreen({ mode = 'login' }: { mode?: 'login' | 'signup' }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [visible, setVisible] = useState(false);
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    const form = event.currentTarget,
      data = new FormData(form);
    const password = String(data.get('password') || '');
    if (mode === 'signup' && password !== data.get('confirmation')) {
      setMessage('تکرار رمز عبور یکسان نیست.');
      setBusy(false);
      pending.current = false;
      return;
    }
    try {
      const response = await fetch(
        mode === 'signup' ? '/api/auth/sign-up/email' : '/api/account/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: String(data.get('email')).trim(),
            password,
            ...(mode === 'signup' ? { name: String(data.get('name')).trim() } : {}),
          }),
          signal: AbortSignal.timeout(45000),
        },
      );
      if (!response.ok) {
        setMessage(
          response.status === 429
            ? 'تلاش‌ها زیاد شده؛ کمی بعد دوباره امتحان کن.'
            : mode === 'signup'
              ? 'حساب ساخته نشد؛ اطلاعات را بررسی کن. اگر قبلاً ثبت‌نام کرده‌ای وارد شو.'
              : 'ایمیل یا رمز عبور درست نیست، یا دسترسی حساب متوقف شده است.',
        );
        return;
      }
      const result = await response.json();
      form.reset();
      setVisible(false);
      const destination = mode === 'signup' ? '/dashboard' : result.destination;
      window.location.assign(
        ['/dashboard', '/admin', '/admin/users'].includes(destination) ? destination : '/dashboard',
      );
    } catch {
      setMessage('ارتباط کامل نشد؛ اگر حساب ساخته شده، از بخش ورود ادامه بده.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <AccessFrame
      action={
        <a href={mode === 'signup' ? '/login' : '/signup'}>
          {mode === 'signup' ? 'حساب دارم؛ ورود' : 'ساخت حساب تازه'}
        </a>
      }
    >
      <div className="access-heading">
        <span className="access-kicker">
          {mode === 'signup' ? 'یک فضای مستقل برای فروشگاه تو' : 'خوش برگشتی'}
        </span>
        <h1>
          {mode === 'signup' ? 'شروع یک' : 'ادامهٔ'}
          <br />
          گفت‌وگوی خوب<span>.</span>
        </h1>
        <p>
          {mode === 'signup'
            ? 'حساب AiDirect بساز؛ محصولات و پیج‌های کاتالوگت فقط در فضای خودت قرار می‌گیرند.'
            : 'با حساب AiDirect وارد شو؛ پنل مناسب سطح دسترسی‌ات باز می‌شود.'}
        </p>
      </div>
      <form method="post" className="access-form" onSubmit={submit} aria-busy={busy}>
        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 20 }}
        >
          {message && (
            <div className="access-feedback" role="alert">
              {message}
            </div>
          )}
          {mode === 'signup' && (
            <div className="access-field">
              <label htmlFor="customer-name">نام تو یا فروشگاه</label>
              <input
                id="customer-name"
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
              />
            </div>
          )}
          <div className="access-field">
            <label htmlFor="customer-email">ایمیل</label>
            <input
              id="customer-email"
              name="email"
              type="email"
              dir="ltr"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </div>
          <div className="access-field">
            <label htmlFor="customer-password">رمز عبور</label>
            <div className="access-password">
              <input
                id="customer-password"
                name="password"
                type={visible ? 'text' : 'password'}
                dir="ltr"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? 12 : undefined}
                maxLength={128}
                required
              />
              <button
                type="button"
                className="access-reveal"
                aria-label={visible ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
                aria-pressed={visible}
                onClick={() => setVisible((v) => !v)}
              >
                <AccessIcon name="eye" />
              </button>
            </div>
            {mode === 'signup' && <small>حداقل ۱۲ نویسه؛ ترکیب چند کلمه انتخاب خوبی است.</small>}
          </div>
          {mode === 'signup' && (
            <div className="access-field">
              <label htmlFor="customer-confirm">تکرار رمز عبور</label>
              <input
                id="customer-confirm"
                name="confirmation"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </div>
          )}
          <button className="access-primary" type="submit">
            <span>
              {busy ? 'در حال بررسی…' : mode === 'signup' ? 'ساخت حساب و ورود' : 'ورود به پنل'}
            </span>
            {busy ? (
              <span className="access-busy" aria-hidden="true" />
            ) : (
              <AccessIcon name="arrow" />
            )}
          </button>
        </fieldset>
      </form>
      <p className="access-footnote">
        {mode === 'signup'
          ? 'ثبت‌نام نسخهٔ آزمایشی رایگان است. ایمیل هنوز به‌صورت خودکار تأیید نمی‌شود.'
          : 'رمز این فرم متعلق به AiDirect است؛ رمز اینستاگرام را اینجا وارد نکن.'}
      </p>
    </AccessFrame>
  );
}
