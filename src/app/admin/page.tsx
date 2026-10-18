import AccountEntry from '../account-entry';
import AdminPanel from './admin-panel';
export const metadata = { title: 'ورود و پنل مدیریت' };
export default function AdminPage() {
  return (
    <AccountEntry destination="/admin">
      <AdminPanel />
    </AccountEntry>
  );
}
