# عملیات، استقرار و کارهای لازم قبل از انتشار

مرحلهٔ فعلی: ابزار آزمایش تک‌اپراتور؛ **آمادگی انتشار عمومی SaaS ندارد**. نسخهٔ آزمایشی روی Vercel و Neon با پلن‌های رایگان مستقر شده است؛ [جزئیات استقرار](deployment.fa.md). هیچ سرویس پولی یا Trial خریداری/فعال نشده است. پیش از فروش، شرایط تجاری، worker دائمی و کشور/روش پرداخت باید روشن شوند.

## معماری فعلی

Next.js App Router و TypeScript برای ابزار و endpointها، PostgreSQL 17 و Prisma برای ذخیرهٔ پایدار، worker مستقل برای ارسال. صف در جدول Delivery است و نیازی به Redis جدا برای این proof ندارد. درخواست webhook پس از commit پاسخ می‌گیرد؛ با DB قطع، 503 می‌دهد تا متا تحویل را دوباره تلاش کند. `FOR UPDATE SKIP LOCKED` و reservation حساب از اجرای هم‌زمان/سرعت بی‌قاعده جلوگیری می‌کنند. قید یکتای accountId/commentId/provider در DB برقرار است و با قطع/وصل اتصال حذف نمی‌شود.

میزبانی نهایی باید **وب همیشه قابل دسترسی + worker همیشه فعال + PostgreSQL با دیسک پایدار** فراهم کند. worker نباید در callback، task مرورگر یا عملیات پس از response یک تابع serverless رها شود. انتخاب PaaS با background worker یا VPS مدیریت‌شده، پس از بررسی منطقه، قیمت، backups و امکانات انجام می‌شود. sleep سرویس رایگان، محدودیت مدت تابع و DB ناپایدار معیار مناسب این محصول نیستند.

## راه‌اندازی و migration

```powershell
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm start
```

worker جداگانه با `npm run worker` اجرا می‌شود. سرویس میزبانی باید برای هر دو process restart خودکار، graceful shutdown و env یکسان داشته باشد. بعد از تغییر provider، تمام processهای قدیمی باید stop شوند و leaseهای `sending` طبق سازوکار unknown قرنطینه شوند. `.env` واقعی در Git، artifact عمومی، screenshot یا گزارش قرار نگیرد. `migrate dev` فقط برای توسعه؛ production از `migrate deploy` استفاده می‌کند. دیتابیس آزمایش جداست و اسکریپت tests به دیتابیس production متصل نمی‌شود.

## متغیرهای محیطی

| متغیر                                   | کاربرد                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| APP_BASE_URL                            | URL دقیق HTTPS بیرونی؛ origin اقدامات اپراتور و callbackها                        |
| DATABASE_URL                            | ارتباط سرور با DB خصوصی؛ TLS معتبر در production                                  |
| POSTGRES_PASSWORD                       | فقط compose محلی؛ در production secret مدیریت‌شده                                 |
| TOKEN_ENCRYPTION_KEY                    | کلید ۳۲ بایتی base64url برای AES-GCM؛ خارج از DB و backup داده نگهداری شود        |
| OPERATOR_EMAIL / OPERATOR_PASSWORD_HASH | ورود مدیر با ایمیل و هش scrypt؛ رمز خام فقط در فایل خصوصی محلی اولیه              |
| CRON_SECRET                             | احراز endpoint اجرای صف؛ برای مرورگر یا صاحب پیج ارسال نمی‌شود                    |
| DATABASE_URL_UNPOOLED                   | اتصال مستقیم برای migration؛ در حالت خالی از DATABASE_URL استفاده می‌شود          |
| PRIVACY_CONTACT_EMAIL                   | ایمیل واقعی پاسخ‌گویی مالک؛ پیش از انتشار عمومی تکمیل شود                         |
| PROOF_ADMIN_SECRET                      | سازگاری قدیمی فقط محلی؛ در Vercel غیرفعال و جایگزین فرم ایمیل/رمز شده است         |
| SESSION_SECRET                          | HMAC session با HttpOnly، SameSite=Lax، Secure روی HTTPS                          |
| INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET | شناسه/راز Instagram business login، نه حدس از Meta app اصلی                       |
| META_WEBHOOK_APP_SECRET                 | secret امضاکنندهٔ webhook؛ با نمونهٔ واقعی همین اپ بررسی شود                      |
| META_WEBHOOK_VERIFY_TOKEN               | handshake؛ access token نیست                                                      |
| META_API_VERSION                        | نسخهٔ pinشده v26.0 مطابق مثال‌های رسمی خوانده‌شده؛ قبل از انتشار دوباره تأیید شود |
| META_OAUTH_SCOPES                       | scopeهای حداقلی؛ تغییر scope نیاز به اتصال/رضایت دوباره دارد                      |
| META_ADAPTER                            | simulated یا meta؛ هیچ simulated به‌عنوان proof واقعی شمرده نمی‌شود               |
| REAL_SEND_ENABLED                       | مجوز ارسال واقعی؛ پیش‌فرض false                                                   |
| AUTOMATION_ENABLED                      | مجوز پردازش اتوماتیک؛ آزمون دستی پیش از فعال‌کردن این گزینه                       |

چرخش کلید رمزنگاری باید با key version و re-encryption برنامه‌ریزی شود؛ تغییر ناگهانی کلید فعلی توکن‌های موجود را غیرقابل خواندن می‌کند. این فرآیند چندکلیدی هنوز در proof پیاده نشده است. توکن بلندمدت Instagram طبق مستندات ۶۰ روز اعتبار دارد و فقط پس از حداقل ۲۴ ساعت و پیش از انقضا قابل refresh است. worker از ۷ روز مانده به انقضا ساعتی بررسی می‌کند؛ توکن منقضی/لغوشده اتصال مجدد می‌خواهد. نامناسب بودن شبکه یا خطای refresh موقت موفقیت تمدید گزارش نمی‌شود.

## HTTPS، لاگ و سلامت

- HTTPS با گواهی معتبر لازم است؛ self-signed برای متا قابل قبول نیست.
- در proxy/CDN حداکثر body مناسب، عدم دست‌کاری raw body پیش از HMAC، rate limiting اتصال/login و DB خصوصی لازم‌اند.
- لاگ URL `/api/meta/callback` باید حذف یا query کامل آن scrub شود؛ query شامل authorization code است. ابزار Next incoming request logging را خاموش کرده است. ngrok inspection و APM نباید token، cookie، header Authorization، body login یا URL تبادل توکن را نگه دارند.
- `/api/health` سلامت DB و heartbeat اخیر worker را اعلام می‌کند؛ به معنی اتصال واقعی Instagram یا مشاهدهٔ پیام نیست.
- پایش pending قدیمی، unknown، reauthorize_required و failed لازم است. پیام unknown خودکار retry نمی‌شود؛ crash پس از درخواست ارسال هم به unknown می‌رود. تراکنش DB و API خارجی اتمیک نیستند و exactly-once انتهابه‌انتها ادعا نمی‌شود.
- قطع اتصال فوری از شروع ارسال جدید جلوگیری می‌کند؛ درخواست بیرونی که قبلاً شروع شده ممکن است کامل شود. رکوردهای ارسال و کلید dedupe باقی می‌مانند؛ این «حذف کامل داده» نیست.

## پشتیبان‌گیری محلی

پیش از migration production backup و بازیابی آزمایشی لازم است. نمونهٔ محلی زیر فقط پس از آماده‌بودن DB و بدون چاپ رمز:

```powershell
New-Item -ItemType Directory -Force -Path .\backups | Out-Null
docker exec aidirect-proof-postgres pg_dump -U aidirect -d aidirect -Fc -f /tmp/aidirect-proof.dump
docker cp aidirect-proof-postgres:/tmp/aidirect-proof.dump .\backups\aidirect-proof.dump
```

backups در Gitignore هستند؛ پیش از انتقال بیرونی رمزنگاری شوند. کلید رمزنگاری و اطلاعات اتصال باید جداگانه پشتیبان امن داشته باشند. retention و تأیید restore روی دیتابیس جدید، پیش از انتشار انجام می‌شوند. فرمان حذف volume یا restore روی DB جاری در این راهنما ارائه نشده است.

## حریم خصوصی و حذف داده — پیش‌نیاز انتشار، هنوز کار باز

مطابق [Meta Platform Terms، به‌روزرسانی 2026-02-03](https://developers.facebook.com/terms/dfc_platform_terms/) بخش 3.d و 4 و [Developer Policies، 2026-02-03](https://developers.facebook.com/devpolicy/):

1. Privacy Policy با URL فعال، عمومی، قابل خواندن crawler و بدون geoblock؛ ثبت همین URL در App Dashboard. مالک واقعی، روش تماس/پشتیبانی، داده‌های پردازش‌شده، هدف، محل/مدت نگهداری، سرویس‌دهندگان و روش حذف باید روشن باشند. بدون نام/راه تماس واقعی، سیاست نهایی آمادهٔ انتشار نیست.
2. داده فقط برای خدمت مجاز همان مشتری استفاده شود. consent مشتری برای اقدام روی حساب و opt-in کافی مخاطب لازم است. متن فراخوان پست باید روشن بگوید با کامنت کلمه، پاسخ خصوصی خودکار دریافت می‌شود؛ opt-out مخاطب فوراً رعایت شود.
3. مسیر واضح درخواست حذف/اصلاح داده برای همهٔ کاربران، و حذف در اولین زمان معقول هنگام درخواست مشتری/کاربر، قطع رابطهٔ مشتری یا پایان ضرورت نگهداری. رکوردهای dedupe نیز Platform Data هستند؛ نگهداری نامحدود آن‌ها جای سیاست retention نیست.
4. Deauthorization callback و Data deletion callback مطابق قرارداد جاری متا پیاده و با signed_request معتبر و نامعتبر بررسی شوند؛ اعتبارسنجی، نگاشت شناسهٔ app-scoped، توقف صف، پاک‌کردن توکن و داده، confirmation/status و حذف از backups لازم‌اند. این endpointها هنوز در کد وجود ندارند. قبل از نوشتن قرارداد آن‌ها، مستندات اختصاصی روز متا خوانده می‌شوند؛ مسیر یا payload حدس زده نشده است.
5. پیشنهاد فنی برای مرحلهٔ بعد، پس از بازبینی: متن کامنت در DB نگهداری نشود (اکنون هم نمی‌شود)، log عملیاتی کمینه و محدود، کلید dedupe فقط برای پنجرهٔ زمانی ضروری و خطر replay نگه داشته شود، payload متا در APM خام ذخیره نشود. مدت نگهداری نهایی باید با هدف واقعی و الزامات دادهٔ مالک سازگار و در سیاست اعلام شود.
6. opt-out، اعلان تجربهٔ خودکار در موارد لازم، مسیر ارتباط با اپراتور انسانی و شرایط استفادهٔ مشتری قبل از عمومی‌شدن آماده شوند. هیچ ادعای Meta-approved یا تضمین تحویل پیام در محصول نوشته نشود.

در proof توکن و متن صف رمزنگاری هستند، raw payload و متن کامنت ذخیره نمی‌شوند، اما شناسهٔ حساب/رسانه/کامنت و نتیجه برای آزمون نگهداری می‌شوند. حذف کامل، retention خودکار و opt-out هنوز ساخته نشده‌اند؛ به همین دلیل این نسخه آمادهٔ فروش عمومی نیست.

## مرحلهٔ چندمشتری بعد از proof

User، Workspace، Membership، InstagramConnection، Automation، CommentEvent و Delivery با workspaceId و مجوزدهی سمت سرور اضافه می‌شوند. auth مشتری، کنترل role، مالکیت رسانه و اتصال، جداسازی queryها، encryption context و گزارش‌ها باید آزمون مستقل داشته باشند. User/Workspace/Membership در proof فعلی وجود ندارند؛ آزمون جداسازی مشتریان هنوز قابل ادعا نیست. client-supplied workspaceId بدون احراز membership پذیرفته نمی‌شود. unique delivery باید همچنان جلوی ارسال دوبارهٔ همان account/comment حتی پس از قطع/اتصال و جابه‌جایی automation را بگیرد.

قبل از deployment عمومی، نتیجهٔ واقعی، بررسی امنیت/جداسازی، callbackهای حذف/لغو، سیاست داده، env، migrations، HTTPS، backup/restore، سلامت worker و قیمت رسمی میزبان در یک نتیجهٔ قابل بررسی آماده می‌شوند. خرید سرویس پولی و انتشار عمومی بدون درخواست/اجازهٔ مالک انجام نمی‌شود.
