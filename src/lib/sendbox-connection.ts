import { db } from './db';
import type { SendboxAccount } from './sendbox';
import { hash } from './crypto';

export async function consumeSendboxAttempt(state: string, inviteHash: string | null) {
  const used = await db.oAuthAttempt.deleteMany({
    where: { stateHash: hash(`sendbox:${state}`), inviteHash, expiresAt: { gt: new Date() } },
  });
  return used.count === 1;
}

export async function finishSendboxConnection(account: SendboxAccount, inviteHash: string | null) {
  if (!account.is_active || Date.parse(account.expires_at) <= Date.now())
    throw new Error('inactive_account');
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261018, 2)`;
    if (inviteHash) {
      const claimed = await tx.sendboxInvite.updateMany({
        where: {
          tokenHash: inviteHash,
          claimedAt: { not: null },
          revokedAt: null,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error('invite_unavailable');
    }
    const data = {
      accountId: account.id,
      instagramId: account.instagram_user_id,
      username: account.username,
      expiresAt: new Date(account.expires_at),
    };
    await tx.sendboxConnection.createMany({ data: [data], skipDuplicates: true });
    const updated = await tx.sendboxConnection.updateMany({
      where: { id: 'proof', accountId: account.id },
      data,
    });
    if (updated.count !== 1) throw new Error('disconnect_first');
  });
}
