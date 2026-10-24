import { headers } from 'next/headers';
import { instagramActor } from '@/lib/instagram-connection';
import { serviceFeatures, featureStates } from '@/lib/service-plans';
import DashboardShell from '../dashboard-shell';
import AuthScreen from '../../auth-screen';
import styles from '../service.module.css';
export const metadata = { title: 'امکانات و مسیر توسعه', robots: { index: false, follow: false } };
export default async function FeaturesPage() {
  try {
    const actor = await instagramActor(await headers());
    return (
      <DashboardShell
        owner={actor.userId === 'operator'}
        active="امکانات"
        title="امکانات AiDirect"
        subtitle="وضعیت واقعی امکانات؛ قابل استفاده، محدود و در حال توسعه."
      >
        <div className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>PRODUCT / CAPABILITIES</span>
            <h1>یک میز کار، برای پیج تو.</h1>
            <p>
              فهرست زیر وضعیت پیاده‌سازی را نشان می‌دهد؛ مجوزها و محدودیت‌های متا همچنان اعمال
              می‌شوند.
            </p>
          </div>
          <a className={styles.link} href="/dashboard/subscription">
            اشتراک رایگان ←
          </a>
        </div>
        {['ready', 'pilot', 'soon'].map((state) => (
          <section key={state}>
            <div className={styles.sectionHead}>
              <h2>{featureStates[state as keyof typeof featureStates]}</h2>
              <p>
                {serviceFeatures.filter((f) => f.state === state).length.toLocaleString('fa-IR')}{' '}
                قابلیت
              </p>
            </div>
            <div className={styles.featureGrid}>
              {serviceFeatures
                .filter((f) => f.state === state)
                .map((f) => (
                  <article key={f.title} className={styles.feature}>
                    <span className={styles.badge} data-state={f.state}>
                      {f.group} · {featureStates[f.state]}
                    </span>
                    <h3>{f.title}</h3>
                    <p>{f.detail}</p>
                    {f.href && (
                      <a href={f.href}>
                        {f.state === 'soon' ? 'دربارهٔ این خدمت' : 'رفتن به این بخش'} ←
                      </a>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))}
      </DashboardShell>
    );
  } catch {
    return <AuthScreen />;
  }
}
