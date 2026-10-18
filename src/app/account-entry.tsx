import { cookies } from 'next/headers';
import { COOKIE, isActiveSession } from '@/lib/auth';
import LoginScreen from './login-screen';
import SendboxPanel from './sendbox/sendbox-panel';
import type { ReactNode } from 'react';
export default async function AccountEntry({
  destination = '/sendbox',
  children,
}: { destination?: string; children?: ReactNode } = {}) {
  const session = (await cookies()).get(COOKIE)?.value;
  if (!session) return <LoginScreen destination={destination} />;
  try {
    if (!(await isActiveSession(session))) return <LoginScreen destination={destination} />;
  } catch (error) {
    return (
      <LoginScreen
        destination={destination}
        initialMessage={
          error instanceof Error && error.message === 'unauthorized'
            ? ''
            : 'ارتباط کامل نشد. کمی بعد دوباره تلاش کن.'
        }
      />
    );
  }
  // Page rendering is only a convenience. Every account API checks the session again.
  return children ?? <SendboxPanel />;
}
