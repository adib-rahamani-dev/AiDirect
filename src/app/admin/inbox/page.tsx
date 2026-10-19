import AccountEntry from '../../account-entry';
import InboxPanel from './inbox-panel';
export const metadata = { title: 'آزمایش پاسخ دایرکت', robots: { index: false, follow: false } };
export default function Page() {
  return (
    <AccountEntry destination="/admin/inbox">
      <InboxPanel />
    </AccountEntry>
  );
}
