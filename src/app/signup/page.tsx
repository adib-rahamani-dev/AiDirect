import AuthScreen from '../auth-screen';
export const metadata = { title: 'ثبت‌نام رایگان', robots: { index: false, follow: false } };
export default function SignupPage() {
  return <AuthScreen mode="signup" />;
}
