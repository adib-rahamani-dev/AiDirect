import { Brand, LegalLinks } from '../ui';
import SendboxPanel from './sendbox-panel';
export default function SendboxPage() {
  return (
    <>
      <header className="document-header">
        <Brand />
        <a href="/">برگشت به پنل ←</a>
      </header>
      <main className="document-page">
        <span className="eyebrow">آزمایش اتصال Sendbox / BoxAPI</span>
        <h1>ابتدا اتصال پیج، سپس آزمون پاسخ.</h1>
        <p>
          این مسیر از سرویس Sendbox استفاده می‌کند. اتصال مستقیم متا و شبیه‌سازی در پنل اصلی مسیرهای
          جدا هستند.
        </p>
        <SendboxPanel />
        <h2>تنظیمات پنل سرویس</h2>
        <p>
          در «تنظیمات API رسمی اینستاگرام»، دامنه و آدرس‌های زیر را ثبت کن. متد webhook باید POST
          باشد؛ Webhook Secret باید با تنظیم خصوصی سرور یکسان باشد.
        </p>
        <dl className="sendbox-addresses">
          <dt>Domain</dt>
          <dd dir="ltr">https://aidirect-kappa.vercel.app</dd>
          <dt>Redirect URL</dt>
          <dd dir="ltr">https://aidirect-kappa.vercel.app/api/sendbox/callback</dd>
          <dt>Webhook URL</dt>
          <dd dir="ltr">https://aidirect-kappa.vercel.app/api/sendbox/webhook</dd>
        </dl>
        <p>
          بعد از ذخیرهٔ تنظیمات، «بررسی تنظیمات سرویس» را بزن. سپس «اتصال پیج با اینستاگرام» را
          انتخاب کن و فقط در صفحهٔ رسمی Instagram وارد حساب حرفه‌ای شو. رمز اینستاگرام را در
          AiDirect وارد نکن.
        </p>
        <h2>معیار موفقیت این مرحله</h2>
        <p>
          نمایش پیج متصل و ثبت رویداد امضاشدهٔ comments با یک کامنت آزمایشی تازه. دریافت webhook
          به‌تنهایی ارسال پیام را ثابت نمی‌کند. پاسخ خصوصی و پردازش نتایج آسنکرون در این مرحله فعال
          نیستند.
        </p>
        <p>
          <a href="https://sendbox.chat/api" target="_blank" rel="noreferrer">
            معرفی API سرویس
          </a>{' '}
          ·{' '}
          <a href="https://boxapi.ir/docs/instagram/dm/webhook/" target="_blank" rel="noreferrer">
            مستندات امضای webhook
          </a>
        </p>
        <LegalLinks />
      </main>
    </>
  );
}
