import AccountEntry from '../account-entry';
import AdminPanel from './admin-panel';
export default function AdminPage() {
  return (
    <AccountEntry destination="/admin">
      <AdminPanel />
    </AccountEntry>
  );
}
