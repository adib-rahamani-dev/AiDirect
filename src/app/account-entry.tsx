import { cookies } from 'next/headers';
import { COOKIE, isActiveSession } from '@/lib/auth';
import LoginScreen from './login-screen';
import SendboxPanel from './sendbox/sendbox-panel';
export default async function AccountEntry() {
  const session = (await cookies()).get(COOKIE)?.value;
  if (!session) return <LoginScreen />;
  try {
    if (!(await isActiveSession(session))) return <LoginScreen />;
  } catch (error) {
    return (
      <LoginScreen
        initialMessage={
          error instanceof Error && error.message === 'unauthorized'
            ? ''
            : 'ارتباط کامل نشد. کمی بعد دوباره تلاش کن.'
        }
      />
    );
  }
  // Page rendering is only a convenience. Every account API checks the session again.
  return <SendboxPanel />;
}
