# پشتیبان‌گیری و تمرین بازیابی

وضعیت: ابزارها آماده‌اند؛ `pg_dump`/`pg_restore` روی این محیط در PATH نیستند. backup کامل، زمان‌بندی خودکار، نگهداری بیرون از دستگاه و تمرین بازیابی واقعی هنوز تأیید نشده‌اند. CSV کاتالوگ، backup کامل دیتابیس نیست.

## آماده‌سازی خصوصی

ابزار PostgreSQL از [منبع رسمی](https://www.postgresql.org/download/) با نسخهٔ هم‌نسخه یا جدیدتر از سرور نصب شود. راهنمای [Neon برای pg_dump](https://neon.com/docs/manage/backup-pg-dump) و [اتصال مستقیم](https://neon.com/docs/connect/connection-pooling) ملاک است. پلن رایگان Neon فقط [تاریخچهٔ محدود](https://neon.com/docs/postgres/backup-restore/history-window) دارد.

در `.env` خصوصی:

- `DATABASE_URL_UNPOOLED`: اتصال مستقیم برنامه، با TLS معتبر؛ hostname نباید `-pooler` داشته باشد.
- `PG_DUMP_PATH` و `PG_RESTORE_PATH`: مسیر ابزارها یا خالی در صورت حضور در PATH.
- `BACKUP_ENCRYPTION_KEY`: کلید مستقل ۳۲بایتی base64؛ با ابزار تولید رمز امن در فایل خصوصی تولید شود، نه در چت. کنار نسخهٔ backup ذخیره نشود.
- `RESTORE_TEST_DATABASE_URL`: دیتابیس **جدا و خالی** با نام دقیق `aidirect_restore_test`؛ هیچ اپ یا worker به آن وصل نباشد.

## فرمان‌ها

```powershell
npm run backup
npm run backup:restore-test -- backups/نام-فایل.dump.aes --confirm-isolated-restore
```

اسکریپت dump را به‌صورت custom format مستقیم از pipe با AES-256-GCM رمز می‌کند؛ فایل خام روی دیسک نیست. فایل رمز‌شده در پوشهٔ gitignored `backups/` است. در خطا فایل ناقص ساخته‌شده حذف و فقط پیام عمومی چاپ می‌شود. رمز اتصال از env به فرایند داده می‌شود، نه آرگومان command line.

فرمت فایل `AIDB1 | IV(12 bytes) | ciphertext | GCM tag(16 bytes)` است؛ AAD برابر `aidirect-pg-backup-v1`. ابزار restore اصالت فایل را پیش از ارسال اولین بایت به PostgreSQL کنترل می‌کند. برای جلوگیری از overwrite برنامه فقط نام `aidirect_restore_test` و hostname محلی یا Neon مجاز است؛ حجم فایل این ابزار آزمایشی حداکثر ۱۰۰MB است. `--clean` فقط در همین DB مجزای تمرین اجرا می‌شود. پس از restore نشست‌ها و دعوت‌ها باطل، قانون proof خاموش و توقف worker فعال می‌شود. برنامهٔ production به این دیتابیس اشاره نکند.

خروجی `isolated_restore_completed` یعنی pg_restore و کنترل اولیهٔ جدول محصولات موفق شده‌اند؛ به‌تنهایی برابری همهٔ داده‌ها یا سلامت محصول را ثابت نمی‌کند. شمار محصولات/پست‌ها، نمونهٔ روابط و مجوزها باید با نسخهٔ مبدأ مقایسه و نتیجه/زمان ثبت شود. recovery تولیدی، حذف انتخابی داده‌های منقضی/حذف‌شده پس از restore و جابه‌جایی اتصال فرایند جداگانه‌اند.

قبل از فروش: پشتیبان روزانهٔ رمز‌شده خارج از میزبان، retention مثلاً ۷ روز با حذف قابل بررسی، تمرین ماهانهٔ restore، هدف RPO/RTO توافق‌شده و هشدار شکست backup لازم است. این اعداد برنامهٔ پیشنهادی‌اند؛ هیچ زمان‌بندی یا storage خارجی فعلاً فعال نشده است. کلید رمزنگاری توکن‌های برنامه نیز جداگانه باید قابل بازیابی باشد.
