import '@fontsource-variable/estedad';
import { ArrowLeftIcon, ArrowUpRightIcon } from '@phosphor-icons/react/ssr';
import ConversationDemo from './conversation-demo';
import styles from './landing.module.css';

export default function Page() {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#main">
        رفتن به محتوای اصلی
      </a>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="AiDirect، صفحهٔ اصلی">
          <span className={styles.brandMark}>
            <ArrowUpRightIcon size={25} weight="bold" aria-hidden="true" />
          </span>
          <span dir="ltr">
            aidirect<span className={styles.dot}>.</span>
          </span>
        </a>
        <nav className={styles.navigation} aria-label="ناوبری اصلی">
          <a className={styles.howLink} href="#how-it-works">
            روش کار
          </a>
          <a className={styles.loginLink} href="/sendbox">
            ورود به حساب <ArrowUpRightIcon size={19} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className={styles.hero} aria-labelledby="landing-title">
          <h1 id="landing-title" className={styles.headline}>
            <span className={styles.headlineFirst}>از «لینک»</span>
            <span className={styles.headlineSecond}>
              تا یک <em>گفتگوی</em> تازه<span className={styles.dot}>.</span>
            </span>
          </h1>
          <p className={styles.intro}>کلمه را تو انتخاب کن. پاسخ هم، با لحن خودت.</p>
          <a className={styles.primary} href="/sendbox">
            ورود و اتصال پیج <ArrowLeftIcon size={25} aria-hidden="true" />
          </a>
          <p className={styles.beta}>نسخهٔ آزمایشی؛ ارسال خودکار هنوز فعال نیست.</p>
          <p className={styles.marginNote}>از کامنت تا پاسخ خصوصی</p>
        </section>
        <ConversationDemo />
        <section className={styles.steps} id="how-it-works" aria-label="مسیر راه‌اندازی">
          <ol>
            <li>
              <span className={styles.stepNumber}>۱</span>
              <div>
                <h2>اتصال پیج</h2>
                <p>پیج حرفه‌ای اینستاگرامت را متصل کن.</p>
              </div>
            </li>
            <li>
              <span className={styles.stepNumber}>۲</span>
              <div>
                <h2>انتخاب کلمه</h2>
                <p>برای پست یا ریلز، کلمهٔ محرک را مشخص کن.</p>
              </div>
            </li>
            <li>
              <span className={styles.stepNumber}>۳</span>
              <div>
                <h2>نوشتن پاسخ</h2>
                <p>متن و لینک را با لحن خودت آماده کن.</p>
              </div>
            </li>
          </ol>
          <p className={styles.roadmap}>
            فعلاً اتصال پیج برای آزمایش آماده است؛ تنظیم قانون و ارسال واقعی در دست تکمیل است.
          </p>
        </section>
      </main>
      <footer className={styles.footer}>
        <nav aria-label="اطلاعات حقوقی">
          <a href="/privacy">حریم خصوصی</a>
          <a href="/data-deletion">درخواست حذف داده‌ها</a>
        </nav>
        <span dir="ltr">
          aidirect. <span className={styles.footerEdition}>نسخهٔ آزمایشی</span>
        </span>
      </footer>
    </div>
  );
}
