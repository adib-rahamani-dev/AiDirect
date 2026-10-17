'use client';
import { useEffect, useState } from 'react';
import { Brand, LegalLinks } from '../ui';

export default function ConnectPage() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [metaReady, setMetaReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [returned, setReturned] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const value = new URLSearchParams(url.hash.slice(1)).get('token');
    if (value) setToken(value);
    if (url.searchParams.get('result') === 'connected') {
      setReturned(true);
      setNotice('فرآیند اتصال با موفقیت برگشت. برای ادامهٔ آزمایش به دعوت‌کننده خبر بده.');
    } else if (url.searchParams.has('result'))
      setNotice('اتصال کامل نشد. وضعیت حساب، دعوت Tester و مجوزها را با دعوت‌کننده بررسی کن.');
    window.history.replaceState(null, '', '/connect');
    void fetch('/api/meta/invitation', { cache: 'no-store' })
      .then(async (response) => {
        if (response.ok) {
          const value = await response.json();
          setReady(value.ready);
          setMetaReady(value.metaReady);
        }
      })
      .catch(() => setNotice('ارتباط با سرور برقرار نشد؛ دوباره تلاش کن.'));
  }, []);
  async function redeem() {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/meta/invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redeem', token }),
      });
      if (!response.ok) {
        setNotice('این دعوت استفاده شده یا اعتبارش گذشته است. از دعوت‌کننده لینک جدید بگیر.');
        return;
      }
      setToken('');
      const status = await fetch('/api/meta/invitation', { cache: 'no-store' });
      const value = await status.json();
      setReady(value.ready);
      setMetaReady(value.metaReady);
    } catch {
      setNotice('ارتباط برقرار نشد. دوباره تلاش کن.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="connect-page">
      <header className="auth-header">
        <Brand />
        <span className="pill">دعوت اختصاصی</span>
      </header>
      <main className="connect-card">
        <span className="card-symbol">◎</span>
        <span className="eyebrow">اتصال آزمایشی یک پیج</span>
        <h1>پیجت را امن متصل کن.</h1>
        <p>
          با این دعوت، به AiDirect اجازه می‌دهی برای آزمایش کامنت به پاسخ خصوصی به پیج حرفه‌ای تو
          متصل شود. ورود و انتخاب حساب در سایت رسمی Instagram انجام می‌شود.
        </p>
        <ul className="connect-checks">
          <li>مالک یا مدیر مجاز پیج باش.</li>
          <li>حساب باید سالم، عمومی و Business یا Creator باشد.</li>
          <li>برای اپ آزمایشی، دعوت Instagram Tester را قبلاً قبول کن.</li>
        </ul>
        <p className="helper">
          توکن دسترسی به‌صورت رمزنگاری‌شده در سرور نگهداری می‌شود. دعوت‌کننده می‌تواند برای پیج
          آزمایشی قانون پاسخ بسازد؛ این لینک دسترسی پنل مدیریت نمی‌دهد. از تنظیمات Apps and websites
          اینستاگرام می‌توانی مجوز را لغو کنی.
        </p>
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {!returned &&
          (ready ? (
            metaReady ? (
              <a className="button full" href="/api/meta/connect">
                ادامه در Instagram ↗
              </a>
            ) : (
              <p className="mode-note warning">
                تنظیمات متا هنوز آماده نیست؛ به دعوت‌کننده خبر بده.
              </p>
            )
          ) : token ? (
            <button className="full" disabled={busy} onClick={redeem}>
              {busy ? 'در حال بررسی دعوت…' : 'پذیرش دعوت و آماده‌سازی اتصال ←'}
            </button>
          ) : (
            <p className="mode-note">برای شروع، لینک خصوصی دعوت را از دعوت‌کننده بگیر.</p>
          ))}
        <LegalLinks />
      </main>
      <footer className="auth-footer">
        اتصال حساب، به‌تنهایی اثبات ارسال واقعی یا تأیید متا برای انتشار عمومی نیست.
      </footer>
    </div>
  );
}
