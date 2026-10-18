import { headers } from 'next/headers';
import { platformActor } from '@/lib/platform-access';
import AuthScreen from '../../auth-screen';
import UsersPanel from './users-panel';
export const metadata = { title: 'کاربران و دسترسی‌های سرویس' };
export default async function UsersPage() {
  try {
    await platformActor(await headers());
    return <UsersPanel />;
  } catch (error) {
    return error instanceof Error && error.message === 'forbidden' ? (
      <main style={{ padding: 40 }}>
        <h1>این بخش برای مدیریت سرویس است.</h1>
        <a href="/dashboard">بازگشت به پنل من</a>
      </main>
    ) : (
      <AuthScreen />
    );
  }
}
