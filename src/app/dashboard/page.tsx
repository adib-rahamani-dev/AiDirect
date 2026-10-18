import { headers } from 'next/headers';
import { customerIdentity, ensureCustomerWorkspace } from '@/lib/customer-auth';
import AuthScreen from '../auth-screen';
import CustomerPanel from './customer-panel';
export const metadata = { title: 'پنل فروشگاه', robots: { index: false, follow: false } };
export default async function DashboardPage() {
  try {
    const user = await customerIdentity(await headers());
    await ensureCustomerWorkspace(user.id, user.name);
    return <CustomerPanel />;
  } catch {
    return <AuthScreen />;
  }
}
