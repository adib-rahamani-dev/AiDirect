import { headers } from 'next/headers';
import { instagramActor } from '@/lib/instagram-connection';
import AuthScreen from '../../auth-screen';
import SubscriptionPanel from './subscription-panel';
export const metadata = { title: 'اشتراک و مصرف', robots: { index: false, follow: false } };
export default async function SubscriptionPage() {
  try {
    const actor = await instagramActor(await headers());
    return <SubscriptionPanel owner={actor.userId === 'operator'} />;
  } catch {
    return <AuthScreen />;
  }
}
