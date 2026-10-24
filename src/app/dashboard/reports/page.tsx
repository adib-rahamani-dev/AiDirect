import { headers } from 'next/headers';
import { instagramActor } from '@/lib/instagram-connection';
import AuthScreen from '../../auth-screen';
import ReportsPanel from './reports-panel';
export const metadata = { title: 'گزارش ارسال‌ها', robots: { index: false, follow: false } };
export default async function ReportsPage() {
  try {
    const actor = await instagramActor(await headers());
    return <ReportsPanel owner={actor.userId === 'operator'} />;
  } catch {
    return <AuthScreen />;
  }
}
