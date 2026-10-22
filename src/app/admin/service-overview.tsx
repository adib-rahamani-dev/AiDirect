'use client';
import { useEffect, useState } from 'react';
import styles from './users/users.module.css';
export default function ServiceOverview() {
  const [data, setData] = useState<{
    users: number;
    suspended: number;
    products: number;
    pages: number;
    signupEnabled: boolean;
    connections: number;
    accepted: number;
    unknown: number;
    queued: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    void fetch('/api/admin/summary', { cache: 'no-store', signal: c.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setData(await r.json());
      })
      .catch(() => {
        if (!c.signal.aborted) setFailed(true);
      });
    return () => c.abort();
  }, []);
  return (
    <section aria-label="مدیریت کل سرویس">
      <div className={styles.results}>
        <div>
          <h2>مدیریت کل سرویس</h2>
          <p>ثبت‌نام، فروشگاه‌ها و دسترسی‌ها زیر نظر تو.</p>
        </div>
        <a href="/admin/users">مدیریت کاربران و مدیران ←</a>
      </div>
      {failed ? (
        <p role="status">آمار دریافت نشد؛ صفحهٔ کاربران را بررسی کن.</p>
      ) : (
        <div className={styles.stats}>
          {[
            ['حساب کاربری', data?.users],
            ['پیج متصل به متا', data?.connections],
            ['ارسال پذیرفته‌شده', data?.accepted],
            ['نتیجه نامعلوم', data?.unknown],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <span>{label}</span>
              <strong>{typeof value === 'number' ? value.toLocaleString('fa-IR') : '…'}</strong>
            </div>
          ))}
        </div>
      )}
      <p>
        ثبت‌نام عمومی: {data ? (data.signupEnabled ? 'فعال' : 'متوقف') : 'در حال بررسی…'} · پیج
        کاتالوگ به معنی اتصال رسمی اینستاگرام نیست. در صف:{' '}
        {data?.queued.toLocaleString('fa-IR') ?? '—'}
      </p>
    </section>
  );
}
