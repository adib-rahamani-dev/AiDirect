import AccountEntry from '../../account-entry';
import OperationsPanel from './operations-panel';
export const metadata = { title: 'عملیات و گزارش ارسال' };
export default function OperationsPage() {
  return (
    <AccountEntry destination="/admin/operations">
      <OperationsPanel />
    </AccountEntry>
  );
}
