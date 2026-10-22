import { headers } from 'next/headers';
import { instagramActor } from '@/lib/instagram-connection';
import AuthScreen from '../../auth-screen';
import InstagramPanel from './instagram-panel';
export const metadata = { title: 'اینستاگرام فروشگاه', robots: { index: false, follow: false } };
export default async function InstagramPage() {
  try {
    const actor = await instagramActor(await headers());
    return <InstagramPanel owner={actor.userId === 'operator'} />;
  } catch {
    return <AuthScreen />;
  }
}
