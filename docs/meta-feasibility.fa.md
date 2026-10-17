# امکان‌سنجی رسمی متا

تاریخ بررسی: **2026-10-04**. صفحات رسمی از مرورگر خوانده شدند؛ ابزار جست‌وجوی وب برای برخی صفحات قدیمی `/docs` خطای 429 یا Not Logged In داشت. لینک‌های زیر به صفحات فعلی `/documentation` هستند. این تحقیق اثبات عملی دریافت پیام نیست.

## نتیجه و مسیر انتخاب‌شده

قابلیت رسمی برای این سناریو وجود دارد: `Private Replies`. از **Instagram API with Instagram Login / Business Login for Instagram**، میزبان `graph.instagram.com` و **Instagram User access token** استفاده می‌کنیم. مشتری در صفحهٔ رسمی Instagram مجوز می‌دهد؛ برنامه رمز Instagram را دریافت نمی‌کند. حساب **Business یا Creator** لازم است، Facebook Page برای این مسیر لازم نیست. Facebook Login مسیر رسمی دیگری است که حساب حرفه‌ایِ متصل به Facebook Page و مجوزهای Page را لازم دارد؛ برای این MVP پیچیدگی اضافی ایجاد می‌کند.

منابع: [Overview، به‌روزرسانی 2026-09-28](https://developers.facebook.com/documentation/instagram-platform/overview)، [Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login)، [Business Login، به‌روزرسانی 2026-03-13](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login).

## مجوزها و قرارداد API

| کار                                        | مجوز/قرارداد رسمی                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| خواندن حساب و رسانه‌های متعلق به آن        | `instagram_business_basic`                                                                                                                      |
| دریافت webhook کامنت و پاسخ خصوصی به کامنت | `instagram_business_basic` و `instagram_business_manage_comments`                                                                               |
| webhook لازم برای نسخهٔ اول                | object: `instagram`، field: `comments`؛ انتخاب در App Dashboard و اشتراک جداگانهٔ حساب                                                          |
| ارسال پاسخ خصوصی                           | `POST https://graph.instagram.com/{API_VERSION}/{IG_ACCOUNT_ID}/messages`، `recipient.comment_id` و `message.text`، Bearer Instagram User token |
| اشتراک حساب                                | `POST /{IG_ACCOUNT_ID}/subscribed_apps` با `subscribed_fields=comments`                                                                         |
| خواندن حساب                                | `GET /me?fields=id,user_id,username`؛ برای تطبیق webhook و ارسال از **user_id** استفاده شود، نه app-scoped id                                   |
| رسانه‌ها و کامنت‌ها                        | `GET /{IG_ACCOUNT_ID}/media`، `GET /{IG_MEDIA_ID}/comments`، `GET /{IG_COMMENT_ID}?fields=...`                                                  |

درخواست پاسخ خصوصی:

```json
{
  "recipient": { "comment_id": "COMMENT_ID" },
  "message": { "text": "متن پاسخ\nhttps://your-business.example/link" }
}
```

فقط جایگزین‌های نمایشی در این نمونه وجود دارند. در کد مسیر عمومی ارسال به `recipient.id` وجود ندارد؛ پاسخ خصوصیِ کامنت با دایرکت آزاد متفاوت است. متن و لینک در **یک پیام** قرار می‌گیرند.

منابع: [Private Replies، به‌روزرسانی 2026-06-30](https://developers.facebook.com/documentation/instagram-platform/private-replies)، [Webhook fields، 2026-09-16](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields)، [Webhook setup، 2026-09-16](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup)، [Get started](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started)، [Comment moderation](https://developers.facebook.com/documentation/instagram-platform/comment-moderation)، [IG Comment reference](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-comment).

**دقت در مجوز messaging:** جدول رسمی Private Replies فقط دو مجوز basic و manage_comments را برای Instagram Login ذکر می‌کند. `instagram_business_manage_messages` مربوط به پیام‌رسانی معمول/دریافت messages است؛ بی‌دلیل آن را لازم یا معادل پاسخ خصوصی فرض نمی‌کنیم. کد با دو scope رسمی شروع می‌کند. اگر آزمون واقعی خطای permission داد، metadata بدون راز ثبت و با مرجع endpoint و داشبورد بررسی می‌شود؛ تنها در صورت اثبات نیاز، این scope مستند اضافه و با `force_reauth=true` مجوز مجدداً گرفته می‌شود. شواهد وبلاگ‌ها مبنای تغییر permission نیستند. [Send API رسمی متا در Postman](https://www.postman.com/meta/instagram/folder/uxudqu0/send-api)

## آزمایش، انتشار و مشتری واقعی

Standard Access برای حساب حرفه‌ایِ خودتان/تحت مدیریتتان و افراد دارای نقش اپ است. برای SaaS که حساب کسب‌وکارهای دیگر و افراد بدون نقش اپ را متصل می‌کند، **Advanced Access**، **App Review** و **Business Verification** لازم است. افزودن مشتری واقعی به‌عنوان Tester جای انتشار تجاری را نمی‌گیرد.

**مانع مهم webhook:** راهنمای جدید Set up Instagram Webhooks مورخ 2026-09-16 صریحاً می‌گوید اعلان `comments` و `live_comments` به Advanced Access نیاز دارد و اپ باید برای دریافت notification کاربران **Live** باشد. بنابراین از عمومی‌بودن راهنمای Standard Access نتیجه نمی‌گیریم که webhook کامنت واقعی در Development قطعاً کار می‌کند. تست نمونهٔ App Dashboard فقط مسیر HTTP را بررسی می‌کند. اگر حساب آزمایشی دادهٔ واقعی نداد، این مرحله موفق گزارش نمی‌شود. مسیر رسمی برای اثبات اولیه: OAuth و خواندن کامنت حساب مجاز، ارسال دستی پاسخ خصوصی و سپس گرفتن دسترسی لازم برای webhook؛ اگر review پیش از webhook لازم شد، همین UI کوچک و فراخوانی موفق برای پروندهٔ review آماده می‌شوند.

حساب مالک رسانه باید **public** باشد؛ حساب خصوصی comment/mention notification دریافت نمی‌کند. راهنمای ساخت اپ نیز کسب‌وکار تأییدشده را قبل از انتشار لازم دانسته است. منابع قدیمی‌تر عمومی استثناهایی برای app-roleها دارند؛ الزام جدید و اختصاصی webhook را ملاک راه‌اندازی این قابلیت می‌گیریم و رفتار واقعی داشبورد/اپ را ثبت می‌کنیم.

منابع: [Access levels در Overview](https://developers.facebook.com/documentation/instagram-platform/overview)، [App Review، 2026-06-30](https://developers.facebook.com/documentation/instagram-platform/app-review)، [Create an app](https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app)، [Webhook setup](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup).

## احرازهای لازم برای فروش SaaS

- **تأیید حساب شخصی:** امکان ورود/ساخت اپ با حساب واقعی توسعه‌دهنده. بررسی هویت یا محدودیت حساب ممکن است همین مرحله را متوقف کند.
- **Business Verification:** احراز هویت کسب‌وکار مالک اپ در Business Portfolio؛ اپ در Settings > Basic به آن وصل می‌شود. ادمین خود کسب‌وکار باید فرآیند را کامل کند. هویت و اطلاعات کسب‌وکار باید واقعی و مطابق مدارک باشند.
- **App Review و Advanced Access:** بررسی کاربرد هر مجوز، UI قابل آزمون خارجی، دکمهٔ ورود رسمی، privacy URL، راهنمای بررسی و ویدیوی تجربهٔ کامل. درخواست مجوزهای بلااستفاده موجب رد می‌شود. بعضی مجوزها حداقل یک API call موفق لازم دارند.
- **Access Verification / Tech Provider:** جدا از سه مورد بالا است. چون SaaS برای کسب‌وکارهای دیگر سرویس می‌دهد و `instagram_business_basic` در فهرست این فرآیند هست، کسب‌وکار مالک اپ باید به‌عنوان Tech Provider تأیید شود. مسیر App Dashboard > Basics > Verifications > Access verification. پیش‌نیاز: Business Verification و نبود restriction روی کسب‌وکار.
- تأیید کسب‌وکار و تأیید آبی/اشتراک **Meta Verified** را یکی نگیرید. خرید تیک آبی شرط این API یا جایگزین App Review نیست.

منابع: [Business Verification](https://developers.facebook.com/documentation/development/release/business-verification)، [Access Verification](https://developers.facebook.com/documentation/development/release/access-verification)، [App Review](https://developers.facebook.com/documentation/instagram-platform/app-review).

## محدودیت پیام، زمان و ظرفیت

1. فقط **یک پاسخ خصوصی** برای کامنت مجاز است؛ قانون برنامه هم برای هر account/comment/provider فقط یک delivery می‌سازد.
2. برای پست/ریلز ظرف **۷ روز از زمان ایجاد کامنت**؛ `entry.time` زمان ارسال webhook است و سن کامنت را ثابت نمی‌کند. worker timestamp واقعی کامنت را از API می‌خواند.
3. برای Live فقط حین پخش زنده؛ نسخهٔ اول Live را پردازش نمی‌کند.
4. پیام بعدی فقط اگر گیرنده به پاسخ خصوصی جواب بدهد و ظرف **۲۴ ساعت از پاسخ او**. ارسال پاسخ خصوصی به‌تنهایی مجوز ارسال آزاد یا follow-up نمی‌دهد. Human Agent برای پاسخ انسانی است و مجوز دورزدن پنجره برای اتوماسیون نیست.
5. اگر مخاطب دنبال‌کننده باشد پیام در Inbox و در غیر این صورت در Requests قرار می‌گیرد؛ موفقیت HTTP/وجود message_id به معنی مشاهدهٔ پیام نیست.
6. محدودیت مستند Private Replies برای پست/ریلز **۷۵۰ call در ساعت برای هر حساب حرفه‌ای**؛ نسخهٔ آزمایش یک تلاش در ۶ ثانیه رزرو می‌کند و خطای rate limit صریح را با backoff مدیریت می‌کند. سایر callها هم محدودیت مربوط به خود را دارند.

منابع: [Private Replies](https://developers.facebook.com/documentation/instagram-platform/private-replies)، [Messaging rate limits در Overview](https://developers.facebook.com/documentation/instagram-platform/overview).

## حساب، کشور و مدارکی که می‌توانند مانع باشند

- حساب Facebook/Meta در حال بررسی هویت، بسته/محدودشده یا بدون امکان Developer registration: فعلاً ساخت/مدیریت اپ ممکن نیست؛ مسیر رسمی، تکمیل بررسی یا appeal داخل همان سرویس است. حساب جعلی، هویت قرضی یا کشور غیرواقعی پیشنهاد نمی‌شود.
- حساب Instagram Personal، خصوصی یا دارای restriction و رسانهٔ age-gated/کاربر محدودشده می‌تواند خواندن کامنت یا webhook را متوقف کند. حساب حرفه‌ای public، یک پست/ریلز متعلق به آن و حساب دوم برای کامنت لازم‌اند.
- نبود کسب‌وکار قابل احراز، دسترسی Admin به Portfolio، مدارک منطبق یا restriction روی Portfolio می‌تواند انتشار تجاری/Tech Provider verification را متوقف کند.
- کشور واقعی فعالیت/ثبت و وضعیت حقوقی کسب‌وکار هنوز از کاربر دریافت نشده است. فهرست قطعی و جاری کشورهای مجاز **برای همین API و Business Verification** در منابع خوانده‌شده پیدا نشد؛ لذا مجاز/غیرمجازبودن ایران یا کشور دیگری را حدس نمی‌زنیم. دسترسی شبکه به Meta، امکان احراز واقعی کسب‌وکار در Security Center و مقررات مربوط باید برای وضعیت واقعی کاربر بررسی شوند. دسترسی با VPN به‌تنهایی اثبات صلاحیت انتشار/احراز نیست.
- محدودیت شبکهٔ این سیستم به Meta در بعضی ابزارها مشاهده شد؛ مرورگر توانست مستندات را بخواند، اما آزمون بدون توکن با درخواست HEAD از Node به **هر دو** `api.instagram.com` و `graph.instagram.com` ناموفق بود (connection unavailable). این مشکل ممکن است به شبکه/تنظیمات اتصال مربوط باشد؛ علت قطعی هنوز تعیین نشده است. اتصال backend به این میزبان‌ها باید پیش از OAuth واقعی رفع و دوباره بررسی شود. دسترسی با توکن واقعی هنوز آزمایش نشده است.

**نتیجهٔ تجاری فعلی:** وجود قابلیت API تأیید شده؛ امکان راه‌اندازی برای هویت/کشور/کسب‌وکار این مالک و دسترسی production هنوز قطعی نیست. تا رفع این موارد هزینهٔ عمومی یا فروش به مشتری شروع نمی‌شود.
