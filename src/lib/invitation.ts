import { cookies } from 'next/headers';
import { db } from './db';
import { hash } from './crypto';
import { requireOperator } from './auth';
export const INVITE_COOKIE = 'aidirect_connect_invite';
export async function connectionActor(): Promise<{ inviteHash: string | null }> {
  try {
    await requireOperator();
    return { inviteHash: null };
  } catch {}
  const token = (await cookies()).get(INVITE_COOKIE)?.value;
  if (!token || !/^[-\w]{43}$/.test(token)) throw new Error('unauthorized');
  const invite = await db.connectionInvite.findUnique({ where: { tokenHash: hash(token) } });
  if (!invite || !invite.claimedAt || invite.usedAt || invite.expiresAt <= new Date())
    throw new Error('unauthorized');
  return { inviteHash: invite.tokenHash };
}
