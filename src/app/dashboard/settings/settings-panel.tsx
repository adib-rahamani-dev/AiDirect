'use client';
import DashboardShell from '../dashboard-shell';
import { useRef, useState, type FormEvent } from 'react';
import { Brand } from '../../ui';
import styles from '../../admin/catalog/catalog.module.css';
export default function SettingsPanel() {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>, deleting = false) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget,
      data = new FormData(form);
    if (!deleting && data.get('newPassword') !== data.get('confirmPassword')) {
      setMessage('تکرار رمز جدید یکسان نیست.');
      return;
    }
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        deleting ? '/api/customer/account' : '/api/auth/change-password',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            deleting
              ? {
                  action: 'delete_account',
                  confirmation: data.get('confirmation'),
                  password: data.get('password'),
                }
              : {
                  currentPassword: data.get('currentPassword'),
                  newPassword: data.get('newPassword'),
                  revokeOtherSessions: true,
                },
          ),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) throw new Error();
      form.reset();
      if (deleting) {
        window.location.assign('/login');
        return;
      }
      setMessage('رمز تغییر کرد؛ نشست‌های دیگر باطل شدند.');
    } catch {
      setMessage('درخواست انجام نشد؛ رمز فعلی و ورودی‌ها را بررسی کن.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const content = (
    <div className={styles.embedded}>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="فضای فروشگاه">
          <a href="/dashboard">پنل من</a>
          <a href="/dashboard/catalog">محصولات</a>
          <a href="/dashboard/analytics">آمار و تحلیل</a>
          <a href="/dashboard/settings" aria-current="page">
            تنظیمات حساب
          </a>
        </nav>
      </header>
      <main className={styles.embeddedMain}>
        <h1>اختیار حساب، دست تو.</h1>
        <p role="status" className={styles.message}>
          {message}
        </p>
        <div className={styles.columns}>
          <section className={styles.panel}>
            <h2>تغییر رمز عبور</h2>
            <form className={styles.form} onSubmit={(e) => void submit(e)}>
              <fieldset disabled={busy}>
                <label>
                  رمز فعلی
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    dir="ltr"
                    required
                    maxLength={128}
                  />
                </label>
                <label>
                  رمز جدید، حداقل ۱۲ نویسه
                  <input
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    dir="ltr"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
                <label>
                  تکرار رمز جدید
                  <input
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    dir="ltr"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
                <button>ذخیره رمز جدید</button>
              </fieldset>
            </form>
          </section>
          <section className={styles.panel}>
            <h2>دریافت اطلاعات</h2>
            <p>
              نام، ایمیل و کاتالوگ متعلق به فضای خودت را در یک فایل JSON دریافت کن. رمز، کلیدها و
              نشست‌ها در فایل نیستند.
            </p>
            <a className={styles.link} href="/api/customer/account">
              دریافت اطلاعات من ←
            </a>
            <p>
              تأیید ایمیل و ارسال لینک بازیابی رمز هنوز فعال نیست. تا راه‌اندازی سرویس ایمیل، رمزت
              را در جای امن نگه دار.
            </p>
          </section>
        </div>
        <details className={styles.danger}>
          <summary>حذف حساب و کاتالوگ من</summary>
          <p>
            حساب، نشست‌ها، فضای کاری متعلق به تو و محصولات و ارتباط پست‌های آن حذف می‌شوند. این کار
            قابل برگشت از داخل پنل نیست. داده‌های مستقل سرویس‌های بیرونی و پشتیبان‌ها تابع روند
            جداگانه‌اند؛ در حال حاضر این پنل اتصال Instagram مستقلی ندارد.
          </p>
          <form className={styles.form} onSubmit={(e) => void submit(e, true)}>
            <fieldset disabled={busy}>
              <label>
                برای تأیید بنویس «حذف حساب»
                <input name="confirmation" required pattern="حذف حساب" autoComplete="off" />
              </label>
              <label>
                رمز فعلی حساب
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  dir="ltr"
                  required
                  maxLength={128}
                />
              </label>
              <button>حذف قطعی حساب و کاتالوگ</button>
            </fieldset>
          </form>
        </details>
      </main>
    </div>
  );
  return (
    <DashboardShell active="تنظیمات" title="تنظیمات حساب">
      {content}
    </DashboardShell>
  );
}
