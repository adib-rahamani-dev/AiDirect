import AccountEntry from '../../account-entry';
import CatalogPanel from './catalog-panel';
export const metadata = { title: 'محصولات و دستیار فروش' };
export default function CatalogPage() {
  return (
    <AccountEntry destination="/admin/catalog">
      <CatalogPanel />
    </AccountEntry>
  );
}
