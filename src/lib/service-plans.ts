// Free access is intentional. A future paid plan must require an explicit purchase.
export const servicePlan = {
  id: 'free-monthly',
  name: 'ماهانهٔ رایگان',
  priceToman: 0,
  interval: 'month',
  automaticCharging: false,
  paymentEnabled: false,
  dailyReplyJobs: 100,
  connectedPages: 1,
} as const;

/** Gregorian UTC monthly anniversaries, clamped to the last day of short months. */
export function monthlyPeriod(anchor: Date, now = new Date()) {
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(now.getTime()))
    throw new Error('invalid_date');
  if (anchor > now) throw new Error('future_anchor');
  function anniversary(offset: number) {
    const month = anchor.getUTCMonth() + offset;
    const first = new Date(Date.UTC(anchor.getUTCFullYear(), month, 1));
    const last = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return new Date(
      Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth(),
        Math.min(anchor.getUTCDate(), last),
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds(),
      ),
    );
  }
  let month =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    anchor.getUTCMonth();
  if (anniversary(month) > now) month--;
  return { start: anniversary(month), end: anniversary(month + 1) };
}

export type FeatureState = 'ready' | 'pilot' | 'soon';
export const featureStates: Record<FeatureState, string> = {
  ready: 'در دسترس',
  pilot: 'آزمایشی / محدود',
  soon: 'به‌زودی',
};
// This is a release ledger, not a list of marketing promises.
export const serviceFeatures: {
  title: string;
  group: string;
  state: FeatureState;
  detail: string;
  href?: string;
}[] = [
  {
    title: 'ثبت‌نام و ورود',
    group: 'حساب',
    state: 'ready',
    detail: 'حساب مستقل و فضای کاری هر فروشگاه.',
    href: '/dashboard/settings',
  },
  {
    title: 'اتصال رسمی اینستاگرام',
    group: 'اینستاگرام',
    state: 'pilot',
    detail: 'پیج حرفه‌ای؛ مشتری عمومی وابسته به تأیید دسترسی متا است.',
    href: '/dashboard/instagram',
  },
  {
    title: 'قطع اتصال',
    group: 'اینستاگرام',
    state: 'ready',
    detail: 'قطع اتصال و پاک‌کردن تنظیمات خصوصی محلی.',
    href: '/dashboard/instagram',
  },
  {
    title: 'صندوق دایرکت',
    group: 'گفتگو',
    state: 'ready',
    detail: 'پیام‌های دریافت‌شده و تاریخچهٔ مجاز.',
    href: '/dashboard/instagram?tab=inbox',
  },
  {
    title: 'تاریخچهٔ گفتگو',
    group: 'گفتگو',
    state: 'pilot',
    detail: 'جزئیات حداکثر ۲۰ پیام آخر از Meta؛ آرشیو نامحدود نیست.',
  },
  {
    title: 'جستجوی مخاطب',
    group: 'گفتگو',
    state: 'ready',
    detail: 'جستجوی نام کاربری؛ جستجوی متن پیام فعال نیست.',
  },
  {
    title: 'فیلتر نخوانده',
    group: 'گفتگو',
    state: 'ready',
    detail: 'وضعیت محلی پنل؛ معادل Seen در Instagram نیست.',
  },
  {
    title: 'ستاره و بایگانی',
    group: 'گفتگو',
    state: 'ready',
    detail: 'مرتب‌سازی گفتگوهای مهم و تمام‌شده.',
  },
  {
    title: 'یادداشت خصوصی',
    group: 'گفتگو',
    state: 'ready',
    detail: 'یادداشت رمزنگاری‌شده برای همان فروشگاه.',
  },
  {
    title: 'پاسخ دستی',
    group: 'گفتگو',
    state: 'pilot',
    detail: 'در بازهٔ مجاز پاسخ؛ پذیرش API معادل تحویل نیست.',
  },
  {
    title: 'پاسخ آماده',
    group: 'گفتگو',
    state: 'ready',
    detail: 'درج پاسخ‌های فروشگاه در پیش‌نویس قابل‌ویرایش.',
  },
  {
    title: 'پیش‌نویس موقت',
    group: 'گفتگو',
    state: 'ready',
    detail: 'حفظ پیش‌نویس هنگام جابه‌جایی گفتگو؛ با بارگیری مجدد پاک می‌شود.',
  },
  {
    title: 'ارجاع به انسان',
    group: 'اتوماسیون',
    state: 'ready',
    detail: 'توقف دستیار همان گفتگو و ادامه با انتخاب صریح.',
  },
  {
    title: 'پاسخ خودکار دایرکت',
    group: 'اتوماسیون',
    state: 'pilot',
    detail: 'دریافت و پاسخ مستقیم روی پیج آزمایشی اثبات شده است.',
  },
  {
    title: 'کامنت به دایرکت',
    group: 'اتوماسیون',
    state: 'pilot',
    detail: 'قانون و صف پیاده شده؛ آزمون واقعی مستقیم کامنت هنوز تأیید نشده.',
    href: '/dashboard/instagram?tab=automations',
  },
  {
    title: 'تطبیق کلمهٔ فارسی',
    group: 'اتوماسیون',
    state: 'ready',
    detail: 'یکسان‌سازی ی/ي، ک/ك و فاصله‌ها.',
  },
  {
    title: 'جلوگیری از پاسخ تکراری',
    group: 'زیرساخت',
    state: 'ready',
    detail: 'کلید یکتا و مدیریت جداگانهٔ نتیجهٔ نامعلوم.',
  },
  {
    title: 'کاتالوگ محصول',
    group: 'فروش',
    state: 'ready',
    detail: 'قیمت، موجودی و لینک معتبر هر فروشگاه.',
    href: '/dashboard/catalog',
  },
  {
    title: 'پیشنهاد با بودجه',
    group: 'فروش',
    state: 'pilot',
    detail: 'فیلتر کاتالوگ و سؤال برای مبلغ مبهم.',
  },
  {
    title: 'لحن فروشگاه',
    group: 'فروش',
    state: 'ready',
    detail: 'لحن، خوشامد و پاسخ‌های قابل‌تنظیم.',
  },
  {
    title: 'تشخیص محلی نیت',
    group: 'هوش مصنوعی',
    state: 'ready',
    detail: 'ابتدا قواعد و زمینهٔ محدود؛ همهٔ پیام‌ها به مدل نمی‌روند.',
  },
  {
    title: 'استخراج با AI',
    group: 'هوش مصنوعی',
    state: 'pilot',
    detail: 'اختیاری و نیازمند رضایت؛ آزمون زندهٔ اخیر موفق نبود.',
  },
  {
    title: 'آمار واقعی گفتگو',
    group: 'گزارش',
    state: 'ready',
    detail: 'نیت، بودجه و نتیجهٔ پردازش؛ فروش نامعلوم جعل نمی‌شود.',
    href: '/dashboard/analytics',
  },
  {
    title: 'گزارش خطای ارسال',
    group: 'گزارش',
    state: 'ready',
    detail: 'تفکیک پذیرش، خطا و نتیجهٔ نامعلوم.',
    href: '/dashboard/reports',
  },
  {
    title: 'اشتراک ماهانهٔ رایگان',
    group: 'حساب',
    state: 'ready',
    detail: 'دورهٔ ماهانه و مصرف واقعی؛ برداشت وجه غیرفعال.',
    href: '/dashboard/subscription',
  },
  {
    title: 'عکس، ویس و ویدئو',
    group: 'گفتگو',
    state: 'soon',
    detail: 'نمایش و ارسال رسانه هنوز فعال نیست.',
  },
  {
    title: 'ریپلای استوری',
    group: 'اتوماسیون',
    state: 'soon',
    detail: 'آزمون واقعی این مسیر و طراحی قواعد مستقل لازم است.',
  },
  {
    title: 'ساعات کاری',
    group: 'اتوماسیون',
    state: 'ready',
    detail: 'روز و بازهٔ ساعت تهران برای پاسخ خودکار دایرکت؛ بیرون ساعت‌ها فقط ثبت در صندوق.',
  },
  {
    title: 'انتشار پست و ریلز',
    group: 'انتشار',
    state: 'soon',
    detail: 'مجوز انتشار و آزمون واقعی لازم است.',
  },
  {
    title: 'زمان‌بندی استوری',
    group: 'انتشار',
    state: 'soon',
    detail: 'وابسته به مجوز و اجرای پایدار زمان‌بند.',
  },
  {
    title: 'اعضای تیم فروشگاه',
    group: 'حساب',
    state: 'soon',
    detail: 'دعوت عضو و تخصیص گفتگو هنوز فعال نیست.',
  },
  {
    title: 'اتصال سفارش',
    group: 'فروش',
    state: 'soon',
    detail: 'برای اثبات خرید و محاسبهٔ تبدیل واقعی.',
  },
  {
    title: 'توسعه وب‌سایت',
    group: 'خدمات',
    state: 'soon',
    detail: 'ساخت وب‌سایت برای کسب‌وکار؛ سفارش و پرداخت هنوز فعال نیست.',
    href: '/dashboard/website-development',
  },
];
