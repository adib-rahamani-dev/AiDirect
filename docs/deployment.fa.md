# استقرار آزمایشی AiDirect

محیط متعلق به همین پروژه است؛ هیچ پروژهٔ دیگری حذف نشده و هیچ خرید یا Trial فعال نشده است. این استقرار برای آزمایش محدود است؛ انتشار و فروش SaaS هنوز آماده نیست.

- آدرس اصلی: https://aidirect-kappa.vercel.app
- مخزن: https://github.com/adib-rahamani-dev/AiDirect
- تیم Vercel: rahmaniadib17-5888s-projects
- پروژهٔ Vercel: aidirect
- منطقهٔ وب و Neon: iad1 / US East
- دیتابیس: aidirect-test-db، پلن free_v3؛ نام DB برنامه neondb و DB ایزولهٔ تست aidirect_test
- runtime هدف: Node 24

## ورود مدیر

فایل خصوصی `.local/operator-login.txt` را روی همین کامپیوتر باز کنید و ایمیل و رمز را در صفحهٔ اصلی وارد کنید. رمز در چت چاپ نشده، در GitHub نیست و به صاحب پیج آزمایشی داده نمی‌شود. هش رمز با scrypt و نشست HttpOnly/Secure ذخیره می‌شود. خروج، نشست فعلی را در سرور باطل می‌کند.

## زمان‌بند رایگان آزمایش

وب، API و ذخیرهٔ صف روی Vercel و Neon اجرا می‌شوند. اسکریپت محلی فقط درخواست احرازشدهٔ اجرای یک مرحلهٔ صف را ارسال می‌کند؛ توکن Instagram را دریافت نمی‌کند.

```powershell
npm run worker:remote
```

فایل `.env.remote.local` فقط URL همین پروژه، کلید خصوصی زمان‌بند و مدت اجرا دارد. پیش‌فرض پس از دو ساعت متوقف می‌شود؛ فقط هنگام آزمایش اجرا کنید تا سهمیهٔ رایگان بی‌جهت مصرف نشود. کامپیوتر باید روشن و بیدار و اینترنت آن وصل باشد. توقف زمان‌بند، صف را پاک نمی‌کند؛ وضعیت worker در پنل و `/api/health` مشخص است.

این سازوکار برای worker دائمی SaaS نیست. Hobby برای سرویس تجاری مجاز نیست و Cron آن حداکثر روزی یک بار است؛ قبل از فروش باید میزبانی تجاری مجاز و اجرای پایدار انتخاب شود. [شرایط Hobby](https://vercel.com/legal/terms)، [محدودیت Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## تنظیم متا، بدون فرستادن کلید در چت

۱. App Secret که در عکس دیده شده بود را در متا Reset کنید. مقادیر مربوط به **Instagram App** را از API setup with Instagram login بردارید؛ آن‌ها را با Meta App ID بالای داشبورد یکی فرض نکنید.

۲. فایل خصوصی `.env.meta.local` را محلی با این قالب پر کنید. هیچ مقدار واقعی در فایل نمونهٔ Git نگذارید:

```dotenv
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
META_WEBHOOK_APP_SECRET=
APP_SECRET_ROTATED=false
```

فقط بعد از Reset واقعی، APP_SECRET_ROTATED را true کنید. برای secret امضای webhook، تطابق امضای واقعیِ همین اپ لازم است؛ اگر خالی بماند اسکریپت از Instagram App Secret استفاده می‌کند. اعتبارسنجی امضا نباید حذف شود.

۳. پس از تکمیل فایل:

```powershell
node scripts/sync-meta.mjs
vercel deploy --prod --archive=tgz --scope rahmaniadib17-5888s-projects
```

اسکریپت مقادیر را از stdin به Vercel می‌فرستد؛ مقدار رازها چاپ نمی‌شود. ارسال واقعی و خودکار را خاموش نگه می‌دارد. پس از redeploy، دعوت اتصال را از پنل بسازید و فقط برای مالک مجاز پیج بفرستید.

## مقادیر متا

| تنظیم                  | مقدار                                                |
| ---------------------- | ---------------------------------------------------- |
| OAuth redirect URI     | https://aidirect-kappa.vercel.app/api/meta/callback  |
| Webhook callback URL   | https://aidirect-kappa.vercel.app/api/meta/webhook   |
| Verify token           | مقدار خصوصی META_WEBHOOK_VERIFY_TOKEN؛ در چت نفرستید |
| Privacy Policy         | https://aidirect-kappa.vercel.app/privacy            |
| راهنمای حذف برای انسان | https://aidirect-kappa.vercel.app/data-deletion      |

callback ماشینی حذف و deauthorization هنوز تأیید نشده‌اند؛ URL راهنمای انسان را به‌جای endpoint ماشینی وارد نکنید. ایمیل پاسخ‌گویی و مشخصات حقوقی مالک نیز قبل از انتشار عمومی باید تکمیل شوند.

## آزمون و سلامت

```powershell
node --env-file=.env.deployment.local scripts/smoke-deployment.mjs
```

این اسکریپت فقط روی محیط شبیه‌سازی اجازهٔ ادامه می‌دهد. ورود، CSRF، صف، dedupe، عدم برگشت راز، دسترسی محدود دعوت، حذف داده و خروج را بررسی می‌کند؛ به متا پیام واقعی نمی‌فرستد. اطلاعات fixture دعوت پس از آزمایش پاک می‌شوند.

`/api/health` وقتی DB و heartbeat اخیر آماده باشند 200 می‌دهد؛ بدون زمان‌بند 503/degraded می‌دهد و ادعای اتصال واقعی نمی‌کند. در نبود App Secret، POST webhook با 503 رد می‌شود؛ امضای نامعتبر با secret تنظیم‌شده 403 می‌گیرد که در CI بررسی می‌شود.

## مهاجرت، اسرار و نسخه‌های بعدی

- مهاجرت با اتصال مستقیم DATABASE_URL_UNPOOLED؛ queryهای برنامه با اتصال pooled و TLS معتبر انجام می‌شوند.
- فایل‌های .env، .local، .vercel و خروجی‌های خصوصی در Git و بستهٔ انتشار قرار نمی‌گیرند.
- قبل از migration آینده روی دادهٔ واقعی، backup و آزمون بازیابی لازم است. محیط کنونی فقط fixture آزمایش دارد؛ وجود backup انجام‌شده ادعا نشده است.
- برای CI از PostgreSQL مجزا استفاده می‌شود؛ رازهای واقعی متا و DB برنامه وارد GitHub Actions نشده‌اند.
- اتصال خودکار GitHub→Vercel فعلاً فعال نشده؛ تلاش CLI برای اتصال repo مجوز کافی نداشت. Push و CI برقرارند و استقرار دستی CLI کار می‌کند. برای خودکارکردن، مالک از Project Settings → Git، دسترسی مخزن AiDirect را به اتصال GitHub خود Vercel بدهد.
- خطای اینترنت در آپلود معمولی با archive=tgz رفع شد. از تغییر تنظیمات شبکه یا غیرفعال‌کردن TLS استفاده نشده است.

پلن‌های رایگان سهمیه دارند؛ قبل از تست طولانی Usage دو سرویس را بررسی کنید. هیچ ارتقای پولی یا خرید API در این مرحله لازم/انجام‌شده اعلام نمی‌شود.
