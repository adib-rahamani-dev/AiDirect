import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react/ssr';
import Image from 'next/image';
import ConversationDemo from './conversation-demo';
import styles from './landing.module.css';
import { publicPageMetadata, serializeJsonLd, websiteStructuredData } from '@/lib/seo';

export const metadata = publicPageMetadata('/');

export default function Page() {
  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteStructuredData) }}
      />
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
          <a className={styles.loginLink} href="/login">
            ورود به حساب <ArrowUpRightIcon size={19} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className={styles.hero} aria-labelledby="landing-title">
          <Image
            className={styles.heroPortrait}
            src="/images/creator-hero-v2.webp"
            width={1000}
            height={750}
            sizes="(max-width: 760px) 100vw, 52vw"
            preload
            alt=""
          />
          <div className={styles.heroContent}>
            <h1 id="landing-title" className={styles.headline}>
              <span className={styles.headlineFirst}>هر کامنت،</span>
              <span className={styles.headlineSecond}>یک شروع تازه.</span>
            </h1>
            <p className={styles.intro}>کامنت به دایرکت اینستاگرام، با کلمه و پاسخ خودت.</p>
            <a className={styles.primary} href="/signup">
              ساخت حساب رایگان <ArrowLeftIcon size={25} aria-hidden="true" />
            </a>
            <p className={styles.beta}>نسخهٔ آزمایشی؛ ارسال خودکار هنوز فعال نیست.</p>
          </div>
        </section>
        <section className={styles.story} aria-label="از کامنت تا گفتگو">
          <div className={styles.storyCopy}>
            <h2>
              لحن تو، <br />
              ادامهٔ <em>گفتگو.</em>
            </h2>
            <p>یک کلمه، یک پاسخ آماده؛ برای ادامهٔ ارتباط با آدم‌هایی که به کارت علاقه دارند.</p>
            <a href="/connect/instagram">
              مسیر اتصال پیج
              <ArrowLeftIcon size={20} aria-hidden="true" />
            </a>
          </div>
          <ConversationDemo />
        </section>
        <section className={styles.steps} id="how-it-works" aria-label="مسیر راه‌اندازی">
          <ol>
            <li>
              <span className={styles.stepIcon}>
                <LinkIcon size={25} aria-hidden="true" />
              </span>
              <span className={styles.stepNumber}>۱</span>
              <div>
                <h2>اتصال پیج</h2>
                <p>پیج حرفه‌ای اینستاگرامت را متصل کن.</p>
              </div>
            </li>
            <li>
              <span className={styles.stepIcon}>
                <MagnifyingGlassIcon size={25} aria-hidden="true" />
              </span>
              <span className={styles.stepNumber}>۲</span>
              <div>
                <h2>انتخاب کلمه</h2>
                <p>برای پست یا ریلز، کلمهٔ محرک را مشخص کن.</p>
              </div>
            </li>
            <li>
              <span className={styles.stepIcon}>
                <PencilSimpleIcon size={25} aria-hidden="true" />
              </span>
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
          <a href="/instagram-comment-to-dm">کامنت به دایرکت چیست؟</a>
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
