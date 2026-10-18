# سئوی AiDirect: اجرا، بررسی و کارهای مالک

تاریخ: 2026-10-18. هدف، کشف محتوای عمومی درست و خارج‌ماندن حساب‌ها از ایندکس است. سئو محصول آزمایشی را آمادهٔ فروش یا ارسال واقعی نمی‌کند؛ رتبه و ایندکس تضمین نمی‌شوند.

## اجراشده در کد

- برداشتن noindex فقط از `/` و `/instagram-comment-to-dm`؛ پیش‌فرض دیگر صفحات noindex است.
- عنوان و توضیح فارسی اختصاصی، canonical مطلق و metadataBase معتبر؛ بدون query، دعوت یا شناسهٔ مشتری.
- `lang=fa` و RTL، یک H1 در صفحات عمومی، لینک HTML به راهنمای مفید و FAQ واقعی.
- WebSite JSON-LD برای نام برند و BreadcrumbList برای راهنما؛ بدون امتیاز، مشتری، قیمت یا FAQ rich-result ساختگی.
- Open Graph/Twitter Card با تصویر 1200×630، آیکن 96×96 و Apple icon 180×180 از آیکون Phosphor برند. `next/og` آن‌ها را هنگام build می‌سازد؛ سرویس پولی یا API تصویر اضافه نشده.
- robots.txt و sitemap.xml فقط با دو صفحهٔ عمومی؛ lastmod تاریخ واقعی ویرایش، نه هر درخواست. priority/changefreq نمایشی اضافه نشده‌اند.
- HTML noindex و X-Robots-Tag روی پنل، اتصال، راهنمای فنی و صفحات حقوقی آزمایش؛ تمام APIها noindex و no-store.
- noindex برای Host غیرcanonical؛ preview/development مجاز به ایندکس نیستند. metadata به deployment تصادفی اشاره نمی‌کند.
- robots صفحات noindex را Disallow نمی‌کند تا crawler دستور را بخواند. امنیت داده با احراز هویت است، نه robots.
- حذف no-store سراسری از محتوای عمومی؛ no-store تمام حساب‌ها/APIها حفظ شده. فونت محلی و فایل‌های هش‌دار Next قابل cache هستند؛ دادهٔ حساب وارد کش عمومی نمی‌شود.
- 404 فارسی با وضعیت واقعی؛ بدون redirect اشتباه همهٔ آدرس‌ها به خانه.
- بررسی HTML، canonical، schema، sitemap، ابعاد تصویر، API خصوصی و Host؛ چهار آزمون جدا برای URL، preview و escape امن JSON-LD.

## تنظیمات

| متغیر                    | کاربرد                             | وضعیت                                                |
| ------------------------ | ---------------------------------- | ---------------------------------------------------- |
| SITE_URL                 | origin عمومی HTTPS بدون path/query | اختیاری؛ fallback به APP_BASE_URL عمومی یا آدرس فعلی |
| GOOGLE_SITE_VERIFICATION | فقط content متاتگ تأیید Google     | اختیاری و عمومی؛ هنوز وارد نشده                      |
| APP_BASE_URL             | برنامه و callback اتصال            | تغییر دامنه باید با provider هماهنگ شود              |

آدرس جاری `https://aidirect-kappa.vercel.app` است. canonical در تست به localhost تبدیل نمی‌شود. تغییر دامنه به build/deploy مجدد نیاز دارد. دامنه یا پلن پولی خریداری نشده است.

## Search Console — فعلاً به درخواست مالک به تعویق افتاده

ثبت و تأیید Search Console طبق درخواست فعلی انجام نمی‌شود؛ زیرساخت متاتگ آماده می‌ماند و هیچ مالکیت یا ایندکس تأییدشده‌ای ادعا نمی‌شود. مراحل زیر برای زمان فعال‌کردن این کار هستند.

### راهنمای آیندهٔ مالک

1. [Google Search Console](https://search.google.com/search-console/welcome) را با حساب Google خودت باز کن.
2. **URL prefix** را انتخاب و `https://aidirect-kappa.vercel.app/` را وارد کن. Domain برای vercel.app متعلق به ما نیست و DNS آن را نمی‌توانیم تأیید کنیم.
3. **Other verification methods → HTML tag**: فقط مقدار content تگ را بردار. کد تأیید عمومی است؛ رمز Google، cookie یا کد ورود به کسی نده.
4. آن را در GOOGLE_SITE_VERIFICATION محیط production پروژهٔ aidirect بگذار و redeploy کن. پشتیبانی کد آماده است؛ برای انجام تنظیم توسط ما، فقط همان کد عمومی تأیید کافی است.
5. وجود متاتگ google-site-verification را در خانه بررسی و در Google **Verify** را بزن. تا این قدم، مالکیت تأییدشده محسوب نمی‌شود.
6. **Sitemaps → Add a new sitemap**: مقدار `sitemap.xml`؛ موفقیت یعنی Success بدون خطای خواندن.
7. خانه و راهنما را در **URL inspection → Test live URL** بررسی و سپس Request indexing کن. ثبت درخواست، ایندکس قطعی نیست.
8. Page indexing، Performance و Core Web Vitals را پس از جمع‌شدن داده ببین. سایت تازه ممکن است دادهٔ میدانی کافی نداشته باشد؛ امتیاز خیالی گزارش نکن.

ثبت Bing و اتصال analytics بعداً با نیاز و حریم خصوصی متناسب انجام شوند. هیچ tracker یا cookie بازاریابی در این تغییر اضافه نشده است.

## بررسی و انتشار

```powershell
node --import tsx --test tests/seo.test.ts
npm run build
node scripts/smoke-seo.mjs --local
# بعد از انتشار canonical
node scripts/smoke-seo.mjs
```

تست محلی Host اصلی را روی loopback شبیه‌سازی می‌کند؛ Host عادی localhost باید X-Robots-Tag: noindex داشته باشد. تست آنلاین فقط دامنهٔ ثابت را هدف می‌گیرد، وارد Google نمی‌شود و رتبه را نمی‌سنجد. نتایج در STATUS.md ثبت می‌شوند.

## کارهای مستمر

- قبل از صفحات تعرفه/فروش، پاسخ واقعی و قیمت/محدودیت محصول کامل شوند؛ صفحهٔ وعدهٔ کاذب برای کلمهٔ کلیدی نسازیم.
- بعد از آزمایش واقعی: راهنمای انتخاب کلمه، خطاهای اتصال، محدودیت پاسخ و مطالعهٔ موردی با اجازه و آمار واقعی.
- هر صفحه یک نیت؛ بدون متن تکراری انبوه، keyword stuffing، لینک‌خریدن یا review جعلی.
- دامنهٔ اختصاصی: DNS، HTTPS، redirect دائمی قدیم، canonical، sitemap، Search Console و callbackها هماهنگ تغییر کنند؛ webhook طبق provider.
- عملکرد با PageSpeed/Lighthouse و دادهٔ میدانی سنجیده شود؛ بودجهٔ عکس/فونت/JS. نمرهٔ ۱۰۰ یا قبولی Core Web Vitals بدون اندازه‌گیری ادعا نشود.
- بعد از تغییر محتوا/مسیر، لینک خراب، 404، noindex ناخواسته و canonical/sitemap بررسی شوند؛ lastmod فقط برای ویرایش مهم به‌روز شود.

## منابع رسمی

- [Google: noindex و دسترسی crawler](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google: sitemap و lastmod صحیح](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: عنوان توصیفی](https://developers.google.com/search/docs/appearance/title-link)
- [Google: نام سایت و WebSite](https://developers.google.com/search/docs/appearance/site-names)
- [Google: canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Search Console: تأیید مالکیت](https://support.google.com/webmasters/answer/9008080)
- [Google: تجربهٔ صفحه و Core Web Vitals](https://developers.google.com/search/docs/appearance/page-experience)
- راهنمای نصب‌شدهٔ Next.js 16.3.8 برای metadata، robots، sitemap، app icons و headers در node_modules/next/dist/docs.

صفحهٔ Meta Private Replies در مرور این مرحله قابل خواندن نبود؛ مقاله هیچ endpoint، permission یا عدد زمانی تازه‌ای از حدس اضافه نمی‌کند و به مرجع اصلی لینک می‌دهد. قرارداد دقیق provider همچنان در بستهٔ اثبات بررسی می‌شود.
