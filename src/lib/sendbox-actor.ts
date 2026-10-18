import { cookies } from 'next/headers';
import { requireOperator } from './auth';
import { inspectSendboxGrant, SENDBOX_INVITE_COOKIE } from './sendbox-invites';

export async function sendboxConnectionActor(): Promise<{ inviteHash: string | null }> {
  try {
    await requireOperator();
    return { inviteHash: null };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'unauthorized') throw error;
  }
  const invite = await inspectSendboxGrant((await cookies()).get(SENDBOX_INVITE_COOKIE)?.value);
  if (invite.usedAt) throw new Error('unauthorized');
  return { inviteHash: invite.tokenHash };
}
