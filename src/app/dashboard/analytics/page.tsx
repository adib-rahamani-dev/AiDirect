import { headers } from 'next/headers';
import { customerIdentity } from '@/lib/customer-auth';
import AuthScreen from '../../auth-screen';
import AnalyticsPanel from './analytics-panel';
export const metadata = { title: 'آمار و تحلیل فروشگاه', robots: { index: false, follow: false } };
export default async function AnalyticsPage() {
  try {
    await customerIdentity(await headers());
    return <AnalyticsPanel customer />;
  } catch {
    return <AuthScreen />;
  }
}
