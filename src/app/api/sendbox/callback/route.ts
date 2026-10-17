import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/auth';
import { baseUrl } from '@/lib/config';
import { equal, hash } from '@/lib/crypto';
import { db } from '@/lib/db';
import { sendboxAccounts } from '@/lib/sendbox';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  let result = 'connection_failed';
  try {
    await requireOperator();
    const params = new URL(request.url).searchParams;
    const state = params.get('id') ?? '';
    const cookie = (await cookies()).get('aidirect_sendbox')?.value ?? '';
    if (!state || !cookie || state.length > 100 || !equal(state, cookie)) throw new Error();
    const consumed = await db.oAuthAttempt.deleteMany({
      where: { stateHash: hash(`sendbox:${state}`), expiresAt: { gt: new Date() } },
    });
    (await cookies()).delete('aidirect_sendbox');
    if (!consumed.count || params.get('status') !== 'success') throw new Error();
    // Never trust callback account_id/username alone; check ownership with the authenticated API.
    const owned = (await sendboxAccounts()).find(
      (a) =>
        a.id === params.get('account_id') && a.is_active && Date.parse(a.expires_at) > Date.now(),
    );
    if (!owned) throw new Error();
    await db.$transaction(async (tx) => {
      const data = {
        accountId: owned.id,
        instagramId: owned.instagram_user_id,
        username: owned.username,
        expiresAt: new Date(owned.expires_at),
      };
      await tx.sendboxConnection.createMany({ data: [data], skipDuplicates: true });
      const updated = await tx.sendboxConnection.updateMany({
        where: { id: 'proof', accountId: owned.id },
        data,
      });
      if (updated.count !== 1) throw new Error('disconnect_first');
    });
    result = 'connected';
  } catch {
    /* Callback query strings and provider responses may contain secrets: never log them. */
  }
  return NextResponse.redirect(`${baseUrl()}/sendbox?result=${result}`);
}
