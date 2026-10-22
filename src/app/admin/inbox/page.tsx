import { redirect } from 'next/navigation';
export const metadata = { title: 'آزمایش پاسخ دایرکت', robots: { index: false, follow: false } };
export default function Page() {
  redirect('/dashboard/instagram?tab=inbox');
}
