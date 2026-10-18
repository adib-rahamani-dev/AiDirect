import { randomBytes } from 'node:crypto';
import { db } from './db';
import { equal, hash } from './crypto';

export const SENDBOX_INVITE_COOKIE = 'aidirect_sendbox_invite';
const lifetime = 2 * 3600_000;
export class SendboxInviteError extends Error {
  constructor(public kind: 'invalid_invite' | 'disconnect_first') {
    super(kind);
  }
}

export async function createSendboxInvite() {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + lifetime);
  const invite = await db.$transaction(async (tx) => {
    // Serialize creation with completion so a concurrent replacement cannot reuse a grant.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261018, 2)`;
    if (await tx.sendboxConnection.findUnique({ where: { id: 'proof' } }))
      throw new SendboxInviteError('disconnect_first');
    await tx.sendboxInvite.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } },
    });
    await tx.sendboxInvite.updateMany({
      where: { usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.sendboxInvite.create({ data: { tokenHash: hash(token), expiresAt } });
  });
  return { token, expiresAt, id: invite.id };
}

export async function redeemSendboxInvite(token: unknown) {
  if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token))
    throw new SendboxInviteError('invalid_invite');
  const claim = randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const accepted = await db.sendboxInvite.updateMany({
    where: {
      tokenHash,
      claimedAt: null,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { claimedAt: new Date(), claimHash: hash(claim) },
  });
  if (accepted.count !== 1) throw new SendboxInviteError('invalid_invite');
  const invite = await db.sendboxInvite.findUniqueOrThrow({
    where: { tokenHash },
    select: { expiresAt: true },
  });
  return { cookie: `${tokenHash}.${claim}`, expiresAt: invite.expiresAt };
}

export async function inspectSendboxGrant(value: string | undefined) {
  if (!value || !/^[a-f0-9]{64}\.[\w-]{43}$/.test(value))
    throw new SendboxInviteError('invalid_invite');
  const [tokenHash, claim] = value.split('.');
  const invite = await db.sendboxInvite.findUnique({ where: { tokenHash } });
  if (
    !invite ||
    !invite.claimedAt ||
    !invite.claimHash ||
    !equal(hash(claim), invite.claimHash) ||
    invite.revokedAt ||
    invite.expiresAt <= new Date()
  )
    throw new SendboxInviteError('invalid_invite');
  return invite;
}

export async function revokeSendboxInvite(id: string) {
  return db.sendboxInvite.updateMany({
    where: { id, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
