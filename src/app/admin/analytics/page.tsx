import AccountEntry from '../../account-entry';
import AnalyticsPanel from '../../dashboard/analytics/analytics-panel';
export const metadata = {
  title: 'آمار و تحلیل کاتالوگ مدیر',
  robots: { index: false, follow: false },
};
export default function AnalyticsPage() {
  return (
    <AccountEntry destination="/admin/analytics">
      <AnalyticsPanel />
    </AccountEntry>
  );
}
