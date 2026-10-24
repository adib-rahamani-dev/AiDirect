import { headers } from 'next/headers';
import { instagramActor } from '@/lib/instagram-connection';
import DashboardShell from '../dashboard-shell';
import AuthScreen from '../../auth-screen';
import styles from '../service.module.css';
export const metadata = {
  title: 'توسعه وب‌سایت — به‌زودی',
  robots: { index: false, follow: false },
};
export default async function WebsiteDevelopmentPage() {
  try {
    const actor = await instagramActor(await headers());
    return (
      <DashboardShell
        owner={actor.userId === 'operator'}
        active="توسعه وب‌سایت"
        title="توسعه وب‌سایت"
        subtitle="قدم بعدی برای حضور مستقل کسب‌وکارت."
      >
        <section className={styles.coming}>
          <span className={styles.badge} data-state="soon">
            به‌زودی
          </span>
          <h1>پیجت، خانهٔ خودش را دارد.</h1>
          <p>
            خدمت توسعه وب‌سایت برای کسب‌وکارها در برنامهٔ AiDirect است؛ فضایی برای معرفی برند و
            محصولات، کنار فروشگاه اینستاگرامت.
          </p>
          <p>
            این خدمت هنوز فعال نیست. ثبت سفارش، قیمت‌گذاری، اتصال دامنه و دریافت هزینه در این صفحه
            انجام نمی‌شود. زمان ارائه پس از آماده‌شدن اعلام خواهد شد.
          </p>
          <div className={styles.actions}>
            <a className={`${styles.link} ${styles.primary}`} href="/dashboard/catalog">
              فعلاً کاتالوگت را کامل کن ←
            </a>
            <a className={styles.link} href="/dashboard/features">
              دیدن مسیر توسعه
            </a>
          </div>
        </section>
      </DashboardShell>
    );
  } catch {
    return <AuthScreen />;
  }
}
