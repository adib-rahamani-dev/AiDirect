import { headers } from 'next/headers';
import { customerIdentity, ensureCustomerWorkspace } from '@/lib/customer-auth';
import CatalogPanel from '../../admin/catalog/catalog-panel';
import AuthScreen from '../../auth-screen';
export const metadata = { title: 'محصولات فروشگاه من', robots: { index: false, follow: false } };
export default async function CustomerCatalogPage() {
  try {
    const user = await customerIdentity(await headers());
    await ensureCustomerWorkspace(user.id, user.name);
    return <CatalogPanel customer />;
  } catch {
    return <AuthScreen />;
  }
}
