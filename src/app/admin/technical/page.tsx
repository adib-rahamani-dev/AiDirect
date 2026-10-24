import AccountEntry from '../../account-entry';
import AdminPanel from '../admin-panel';
export const metadata = { title: 'ابزارهای فنی مدیر کل', robots: { index: false, follow: false } };
export default function TechnicalPage() {
  return (
    <AccountEntry destination="/admin/technical">
      <AdminPanel />
    </AccountEntry>
  );
}
