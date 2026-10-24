import AccountEntry from '../account-entry';
import ControlCenter from './control-center';
import { headers } from 'next/headers';
import { platformActor } from '@/lib/platform-access';
export const metadata = { title: 'مرکز مدیریت سرویس', robots: { index: false, follow: false } };
export default async function AdminPage() {
  try {
    await platformActor(await headers());
    return <ControlCenter />;
  } catch (error) {
    if (error instanceof Error && error.message === 'forbidden')
      return (
        <main style={{ padding: 40 }}>
          <h1>این بخش برای مدیریت سرویس است.</h1>
          <a href="/dashboard">پنل فروشگاه من</a>
        </main>
      );
    return (
      <AccountEntry destination="/admin">
        <ControlCenter />
      </AccountEntry>
    );
  }
}
