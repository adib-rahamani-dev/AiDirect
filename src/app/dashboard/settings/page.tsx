import { headers } from 'next/headers';
import { customerIdentity } from '@/lib/customer-auth';
import AuthScreen from '../../auth-screen';
import SettingsPanel from './settings-panel';
export const metadata = { title: 'تنظیمات حساب من', robots: { index: false, follow: false } };
export default async function SettingsPage() {
  try {
    await customerIdentity(await headers());
    return <SettingsPanel />;
  } catch {
    return <AuthScreen />;
  }
}
