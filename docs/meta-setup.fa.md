# راهنمای تنظیمات و اثبات واقعی

این راهنما برای ابزار مرحلهٔ ۲ است. هنوز اپ متا، دامنه یا حسابی به‌جای شما ساخته نشده و هیچ پیام واقعی ارسال نشده است.

به‌روزرسانی 2026-10-05: شما گزارش کردید اپ متا را ساخته‌اید. قدم بعدی، بررسی تنظیمات Instagram Login و وضعیت حساب آزمایشی است؛ اتصال واقعی هنوز انجام نشده است.

## ۰. وضعیت فعلی حساب شما

در 2026-10-04 گزارش کردید حساب تازهٔ Instagram پس از ثبت‌نام وارد appeal شده و پیام `Your profile is not visible ... and you can't use it` دارد. این **بررسی حساب تعلیق‌شده** است، نه Business Verification، App Review یا تأیید توسعه‌دهنده. تا نتیجهٔ رسمی و قابل استفاده شدن حساب، این حساب برای آزمایش مناسب نیست. «حدود یک ساعت» تخمین خود Instagram است؛ تضمین زمان نیست. نتیجه را از همان صفحه/برنامهٔ رسمی بررسی کنید و فقط همان‌جا مراحل احراز را انجام دهید. مدرک، کد، رمز یا توکن در چت نفرستید.

اگر حساب سالم دیگری دارید که مالک یا مدیر مجاز آن هستید، می‌تواند حساب آزمایش باشد؛ از هویت غیرواقعی یا ایجاد حساب برای دورزدن محدودیت استفاده نکنید. حساب جدید سالم هم باید قابلیت تبدیل به Professional و عمومی‌بودن را داشته باشد.

## ۱. آماده‌سازی حساب Instagram

پس از رفع محدودیت، در اپ Instagram به Profile > منوی سه‌خط > Settings and activity بروید. در بخش ابزارهای نوع حساب، گزینهٔ Switch to professional account را انتخاب و Business یا Creator را مشخص کنید. عنوان منو ممکن است بنا به نسخه/زبان Instagram فرق کند؛ معیار موفقیت، نمایش ابزارهای Professional و حرفه‌ای‌بودن حساب است. حساب را public کنید، یک پست یا ریلز معمولی منتشر کنید و یک حساب دوم سالم برای گذاشتن کامنت و مشاهدهٔ Inbox/Requests داشته باشید. برای آزمایش، حساب مالک رسانه و حساب کامنت‌گذار یکی نباشند.

این مراحل مستقل از Facebook هستند؛ برای Instagram Login لازم نیست Facebook Page بسازید یا به Instagram متصل کنید. [منبع حساب حرفه‌ای و مسیر](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login)

## ۲. ورود به Meta for Developers و ساخت اپ

### چون فعلاً حساب Facebook ندارید

1. به [facebook.com](https://www.facebook.com/) بروید و **Create new account** را بزنید.
2. نام واقعی، ایمیل یا شمارهٔ در دسترس خودتان، رمز جدید، تاریخ تولد و اطلاعات خواسته‌شده را در خود سایت وارد کنید. حساب شخصی واقعی برای مدیریت اپ بسازید؛ نام شرکت را جای هویت شخصی نگذارید. اطلاعات ورود/احراز را در چت نفرستید.
3. Sign up را پس از خواندن شرایط خودتان انجام دهید و ایمیل/شماره را با کدی که Facebook می‌فرستد همان‌جا تأیید کنید. معیار موفقیت: بتوانید وارد حساب شوید و حساب در حالت suspended/review نباشد. [راهنمای رسمی ساخت حساب](https://www.facebook.com/help/188157731232424)
4. در حالی که به Facebook وارد هستید، [ثبت‌نام Meta Developer](https://developers.facebook.com/async/registration) را باز کنید. شرایط Platform را خودتان بخوانید/بپذیرید؛ ایمیل/شمارهٔ مورد درخواست را تأیید و occupation متناسب با وضعیت واقعی خودتان انتخاب کنید. کد تأیید فقط در سایت متا وارد شود.
5. سپس [App Dashboard](https://developers.facebook.com/apps/) را باز کنید. نمایش **Create App** یعنی دسترسی اولیهٔ توسعه‌دهنده آماده است؛ این هنوز Business Verification یا App Review نیست. اگر حساب جدید با بررسی/محدودیت مواجه شد، از همان مسیر رسمی وضعیت را پیگیری کنید و موفقیت یا زمان بازشدن حساب را فرض نکنید. [راهنمای رسمی ثبت‌نام توسعه‌دهنده](https://developers.facebook.com/documentation/development/register)

در 2026-10-04 کاربر تأیید کرد حساب Facebook ندارد و می‌تواند خودش ایجاد کند. حساب توسط عامل ساخته نشده است و هیچ شرایط حقوقی/احراز هویتی به‌جای کاربر پذیرفته یا ارسال نشده است.

### پس از نمایش Create App

1. به [Meta for Developers](https://developers.facebook.com/) و سپس [Apps](https://developers.facebook.com/apps/) بروید. با **حساب واقعی و سالم Facebook/Meta** خود وارد شوید و اگر درخواست شد، Developer registration را در همان سایت تکمیل کنید. حساب Instagram appealشده این دسترسی را به‌خودی‌خود فراهم نمی‌کند.
2. Create App را بزنید. در رابط جدید، فیلتر **All** و سپس use case **Manage messaging and content on Instagram** (ممکن است `&` به‌جای `and` نمایش داده شود) را انتخاب کنید. این گزینه در [راهنمای رسمی ساخت اپ متا](https://developers.facebook.com/documentation/development/create-an-app) ثبت شده است. مسیر قدیمی [راهنمای محصول Instagram](https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app) از **Other > Business** استفاده می‌کند؛ اگر گزینهٔ مستقیم Instagram موجود است از همان استفاده کنید.
3. نام اپ را `AiDirect Test` و contact email را ایمیلی که واقعاً بررسی می‌کنید وارد کنید. کسب‌وکار واقعی مالک اپ را در صورت آماده‌بودن انتخاب کنید؛ احراز/اسناد غیرواقعی وارد نکنید. برای انتشار، کسب‌وکار تأییدشده لازم می‌شود.
4. در رابط جدید به **Use cases** بروید و کنار **Manage messaging and content on Instagram** گزینهٔ **Customize** را باز کنید. مسیر **API setup with Instagram login** را پیدا کنید. در رابط قدیمی، در Products محصول **Instagram** را پیدا و Set up را بزنید و سپس **Instagram > API setup with Instagram login** را باز کنید. اگر گزینه‌ها متفاوت‌اند، تصویر بدون App Secret یا token از صفحه بفرستید تا مسیر براساس همان رابط بررسی شود.
5. در قسمت افزودن حساب/Generate access tokens، حساب حرفه‌ای public خود را اضافه کنید. اگر دعوت Tester ایجاد شد، در تنظیمات Apps and websites/Tester invites حساب Instagram آن را قبول کنید. موفقیت: حساب در همان بخش اپ نمایش داده شود و کاربر مجاز بتواند API را آزمایش کند.
6. در **Set up Instagram business login > Business login settings**، **Instagram App ID** و **Instagram App Secret** را پیدا کنید. این ID/Secret با Meta App ID/Secret بالای داشبورد یکسان فرض نمی‌شود. مقادیر را فقط در `.env` محلی در `INSTAGRAM_APP_ID` و `INSTAGRAM_APP_SECRET` قرار دهید؛ به چت نفرستید.

## ۳. HTTPS آزمایشی

**مانع شبکهٔ فعلی:** آزمون اتصال بدون توکن از Node این سیستم به `api.instagram.com` و `graph.instagram.com` ناموفق بود. قبل از آزمایش OAuth باید اتصال backend روی شبکه/میزبان مورد استفاده برقرار شود. مرورگر و تونل ورودی ngrok به‌تنهایی دسترسی خروجی Node به API متا را فراهم نمی‌کنند. پیکربندی شبکه/Proxy سیستم بدون بررسی و درخواست مالک تغییر داده نشده است؛ راه بعدی، بررسی اتصال واقعی شبکه یا اجرای backend آزمایشی در میزبان دارای دسترسی معتبر به متا است.

وب و worker را طبق README اجرا کنید. روی همین سیستم ngrok در مسیر زیر موجود است؛ ابتدا نسخه را بررسی کنید:

```powershell
& 'C:\laragon\bin\ngrok\ngrok.exe' version
```

در صورت استفاده از ngrok، حساب/پیکربندی آن را فقط طبق [راهنمای رسمی ngrok](https://ngrok.com/docs/getting-started/) آماده کنید و authtoken را محلی نگه دارید. سپس در ترمینال سوم:

```powershell
& 'C:\laragon\bin\ngrok\ngrok.exe' http 3000
```

این فرمان هنوز برای شما اجرا نشده است. URL عمومی **https** نمایش‌داده‌شده را در `APP_BASE_URL` بگذارید؛ بدون `/` انتهایی. مثلاً با جایگزینی دامنهٔ واقعی تونل:

```dotenv
APP_BASE_URL=https://YOUR-TUNNEL-DOMAIN
META_ADAPTER=meta
REAL_SEND_ENABLED=false
AUTOMATION_ENABLED=false
```

وب و worker را دوباره راه‌اندازی کنید و از **همان URL عمومی** وارد ابزار شوید. مقدار PROOF_ADMIN_SECRET همچنان فقط از فایل محلی گرفته شود. هیچ پورت DB در اینترنت باز نکنید؛ compose آن را روی loopback نگه می‌دارد. تونل آزمایشی جای میزبانی پایدار یا انتشار عمومی محصول نیست. اگر URL تونل تغییر کند، تمام URLهای زیر هم باید به‌روز شوند. برای آزمون مسیر متا قبل از مجوز ارسال، `REAL_SEND_ENABLED=false` بماند.

## ۴. مقدار دقیق callbackها و webhook

در این بخش `BASE` یعنی همان `https://YOUR-TUNNEL-DOMAIN` واقعی شما.

| تنظیم متا                                                         | مقدار                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Instagram > Set up Instagram business login > OAuth redirect URIs | `BASE/api/meta/callback`                                                                                            |
| Instagram > Configure webhooks > Callback URL                     | `BASE/api/meta/webhook`                                                                                             |
| Webhook Verify token                                              | مقدار `META_WEBHOOK_VERIFY_TOKEN` از `.env` محلی                                                                    |
| Webhook object                                                    | `instagram`                                                                                                         |
| Webhook field                                                     | فقط `comments`، Include Values روشن                                                                                 |
| Privacy Policy URL برای انتشار                                    | پس از آماده‌کردن سیاست واقعی و مشخصات مالک؛ راهنمای operations را ببینید                                            |
| Deauthorize callback / Data deletion URL                          | **هنوز پیاده نشده‌اند؛ URL ساختگی وارد نکنید.** قبل از review/public release مطابق راهنمای operations تکمیل می‌شوند |

`Verify token` با access token فرق دارد؛ اپ محلی آن را برای handshake ساخته است. `INSTAGRAM_APP_SECRET` برای OAuth است. برای امضای webhook، مقدار secret اپِ امضاکننده را در `META_WEBHOOK_APP_SECRET` بگذارید؛ اگر خالی باشد از Instagram App Secret استفاده می‌شود. با نمونهٔ امضاشدهٔ **واقعیِ همین اپ** تطبیق را بررسی می‌کنیم، نه با حذف اعتبارسنجی یا پذیرفتن هر دو secret بدون بررسی.

معیار موفقیت handshake: دکمهٔ Verify and save در داشبورد متا خطا ندهد. برنامه تنها با `hub.mode=subscribe` و Verify token منطبق، متن دقیق `hub.challenge` را برمی‌گرداند. POST با `X-Hub-Signature-256` نامعتبر 403 می‌گیرد؛ raw body با HMAC-SHA256 و secret اپ بررسی می‌شود. پاسخ موفق webhook پس از commit داده‌ها 200 است؛ تماس ارسال بیرونی در webhook انجام نمی‌شود.

[مستند رسمی راه‌اندازی webhook](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup)، [ماتریس permission](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields)، [نمونهٔ payload](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples).

## ۵. آزمایش اتصال رسمی و انتخاب رسانه

1. در ابزار از URL عمومی وارد شوید و **اتصال رسمی با Instagram** را بزنید.
2. در صفحهٔ رسمی متا مجوزهای `instagram_business_basic` و `instagram_business_manage_comments` را بدهید. هیچ رمز Instagram داخل فرم ابزار وارد نمی‌شود.
3. پس از برگشت، نام حساب و `connected` باید نمایش داده شود. این مرحله هنوز اثبات webhook یا پاسخ خصوصی نیست.
4. «دریافت پست‌ها و ریلزهای حساب» را بزنید و همان پست آزمایش را انتخاب کنید؛ کلمهٔ محرک مثلاً `لینک`، متن پاسخ کوتاه، و لینک HTTPS واقعیِ تحت کنترل خودتان را وارد کنید. قانون را فعال و ذخیره کنید.
5. «اشتراک رسمی comments» را بزنید؛ API باید `success:true` بدهد. موفقیت subscription به‌تنهایی به معنی ارسال notification واقعی نیست.
6. از Test داشبورد متا نمونهٔ امضاشده بفرستید. پاسخ موفق فقط امنیت/مسیر webhook را ثابت می‌کند؛ نمونهٔ داشبورد را با کامنت واقعی اشتباه نگیرید.

اگر مجوز، حساب، OAuth redirect یا امضای واقعی خطا داد، فقط **نام مرحله، نوع خطا، code/subcode و trace ID** را ثبت کنید. URL شامل code، access token و error.message خام را نفرستید. callback code در لاگ درخواست Next غیرفعال شده است؛ در reverse proxy/tunnel نیز ضبط و ثبت URL حساس باید خاموش باشد.

## ۶. ابتدا ارسال واقعی دستی

1. مطمئن شوید قانون فعال است، رسانه متعلق به حساب آزمایشی است و حساب دوم به‌تازگی زیر آن `لینک` نوشته است.
2. در `.env` فقط `REAL_SEND_ENABLED=true` را فعال کنید؛ `AUTOMATION_ENABLED=false` بماند. وب و worker را restart کنید. توجه: ابزار برای هر اقدام دستی همان پاسخ ذخیره‌شده را به حساب کامنت‌گذار می‌فرستد.
3. در ابزار «دریافت کامنت‌های اخیر» و سپس **ثبت درخواست پاسخ خصوصی واقعی** کنار کامنت همان حساب دوم را بزنید. worker باید مرحلهٔ خواندن/بررسی timestamp و رسانه را طی کند.
4. نتیجه باید provider=`meta`، source=`manual` و status=`accepted` با message_id واقعی داشته باشد. اگر `unknown` شد، ارسال مجدد نکنید؛ درخواست ممکن است قبلاً پذیرفته شده باشد.
5. در حساب دوم Inbox و Requests را بررسی کنید. وقتی **پیام واقعاً مشاهده شد**، «پیام را در حساب گیرنده دیدم» را بزنید و برگهٔ real-proof را کامل کنید.

این آزمون با Standard Access برای حساب مجاز قابل تلاش است؛ موفقیت را فقط از پاسخ واقعی API و مشاهدهٔ پیام گزارش می‌کنیم. وجود endpoint و پاس‌شدن تست محلی جای آن را نمی‌گیرد.

## ۷. سپس ارسال واقعی خودکار

برای دریافت کامنت واقعی، راهنمای جدید متا **Advanced Access برای comments** و اپ **Live** را لازم می‌داند. اگر در Development کامنت نمی‌رسد، ابتدا مسیر رسمی App Review، Business Verification و دسترسی webhook را تکمیل کنید؛ اعتبارسنجی webhook را خاموش نکنید و آن را با pollingِ پنهان جایگزین نکنید. اگر فرم review بخش‌های حریم خصوصی را الزامی کرد، قبل از submission آن بخش‌ها را کامل می‌کنیم.

پس از آماده‌بودن این دسترسی‌ها:

1. `AUTOMATION_ENABLED=true`، `REAL_SEND_ENABLED=true` و `META_ADAPTER=meta`؛ وب و worker restart شوند.
2. با حساب دوم **کامنت جدیدی** با همان کلمه روی رسانهٔ انتخاب‌شده بگذارید. کامنت آزمایش دستی قبلی برای ارسال دوباره قابل استفاده نیست.
3. گزارش باید event واقعی، source=`webhook`، provider=`meta` و accepted را نشان دهد.
4. پیام را در حساب گیرنده ببینید و مشاهده را ثبت کنید. مرحلهٔ ۲ فقط پس از این آزمون و آزمون دستی موفق کامل است.
5. کامنت نامنطبق، webhook تکراری همان کامنت و قانون خاموش را هم آزمایش کنید؛ هیچ‌کدام نباید پاسخ دوم ایجاد کند.

## ۸. آماده‌سازی مجوز مشتری واقعی

در App Dashboard > App settings > Basic، اپ را به Business Portfolio واقعی وصل کنید؛ ادمین Portfolio در Business Settings/Security Center گزینهٔ Business Verification را کامل می‌کند. نام قانونی، نشانی و مدارک لازم باید با واقعیت و مدارک مورد قبول همان فرم مطابقت داشته باشند. کشور و نوع مدرک را از فرم فعلی بررسی کنید؛ انتخاب کشور غیرواقعی یا خرید Meta Verified راه‌حل نیست.

در Instagram > API setup with Instagram login > Complete app review، مجوزهای موردنیاز را بررسی و Continue to app review بزنید. UI قابل دسترسی خارجی، ویدیوی اتصال رسمی → انتخاب رسانه → خواندن کامنت → پاسخ خصوصی → گزارش و دستور آزمایش روشن آماده می‌کنیم. رابط فارسی می‌تواند در ویدیو زیرنویس/راهنمای انگلیسی داشته باشد؛ پیش از ارائه به reviewer بررسی می‌شود. از permissionهای انتشار محتوا، insights و Human Agent که این محصول استفاده نمی‌کند درخواست نکنید.

در **Basics > Verifications > Access verification** فرآیند **Tech Provider** را نیز کامل کنید. رضایت Review و Business Verification به‌تنهایی جای این فرآیند را نمی‌گیرد. هیچ فرم حقوقی/ارسال درخواست بیرونی هنوز به‌جای شما ثبت نشده است.

## رفع خطا بدون حدس

| نشانه                              | بررسی بعدی                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------- |
| حساب Instagram قابل استفاده نیست   | نتیجهٔ appeal/Account Status؛ OAuth را هنوز آزمایش نکنید                    |
| OAuth client یا redirect رد می‌شود | Instagram App ID صحیح، URL دقیق و `/` انتهایی ثبت‌شده                       |
| connected شد ولی کامنت نمی‌رسد     | Live/Advanced Access comments، public بودن مالک، انتخاب field و اشتراک حساب |
| webhook 403                        | Verify token برای GET؛ برای POST بایت خام و secret امضاکنندهٔ همین اپ       |
| خطای 190                           | اتصال مجدد؛ توکن معتبر ذخیره‌شده را چاپ نکنید                               |
| خطای 10 یا 200                     | scopeهای واقعی token، endpoint و سطح دسترسی؛ افزودن مجوز فقط پس از بررسی    |
| accepted ولی پیام دیده نمی‌شود     | Inbox/Requests گیرنده؛ accepted را delivered/seen اعلام نکنید               |
| unknown                            | قرنطینه؛ retry دستی/خودکار ندارد. آزمون بعدی با کامنت جدید                  |
| health 503 و worker missing        | ترمینال دوم worker، اتصال DB و provider یکسان وب/worker                     |
