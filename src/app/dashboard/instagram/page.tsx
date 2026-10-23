import { headers } from 'next/headers';
import { instagramActor } from '@/lib/instagram-connection';
import AuthScreen from '../../auth-screen';
import InstagramPanel from './instagram-panel';
export const metadata = { title: 'اینستاگرام فروشگاه', robots: { index: false, follow: false } };
export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  try {
    const actor = await instagramActor(await headers());
    const query = await searchParams;
    return (
      <InstagramPanel
        owner={actor.userId === 'operator'}
        initialTab={typeof query.tab === 'string' ? query.tab : undefined}
      />
    );
  } catch {
    return <AuthScreen />;
  }
}
