import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { connectionActor, INVITE_COOKIE } from '@/lib/invitation';
import { exchangeCode, profile } from '@/lib/meta';
import { db } from '@/lib/db';
import { equal, hash, encrypt } from '@/lib/crypto';
import { baseUrl } from '@/lib/config';
import { CUSTOMER_META_COOKIE, finishInstagramOAuth } from '@/lib/instagram-connection';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  if ((await cookies()).has(CUSTOMER_META_COOKIE)) return finishInstagramOAuth(request);
  let result = 'oauth_failed';
  let destination = '/proof';
  try {
    const actor = await connectionActor();
    if (actor.inviteHash) destination = '/connect';
    const p = new URL(request.url).searchParams;
    const state = p.get('state') ?? '';
    const cookie = (await cookies()).get('aidirect_oauth')?.value ?? '';
    if (!state || !cookie || !equal(state, cookie)) throw new Error('invalid_state');
    const consumed = await db.oAuthAttempt.deleteMany({
      where: {
        stateHash: hash(state),
        inviteHash: actor.inviteHash,
        expiresAt: { gt: new Date() },
      },
    });
    (await cookies()).delete('aidirect_oauth');
    if (!consumed.count || p.has('error') || !p.get('code')) throw new Error('denied');
    const token = await exchangeCode(p.get('code')!);
    const user = await profile(token.accessToken);
    const data = {
      accountId: user.accountId,
      appScopedId: user.appScopedId ?? token.appScopedId,
      username: user.username,
      tokenCipher: encrypt(token.accessToken, `token:${user.accountId}`),
      expiresAt: new Date(Date.now() + token.expiresIn * 1000),
      issuedAt: new Date(),
      acceptCommentsSince: new Date(),
      status: 'connected',
      subscribed: false,
    };
    await db.$transaction(async (tx) => {
      if (actor.inviteHash) {
        const taken = await tx.connectionInvite.updateMany({
          where: { tokenHash: actor.inviteHash, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (!taken.count) throw new Error('invite_used');
        const existing = await tx.proofConnection.findUnique({ where: { id: 'proof' } });
        if (
          existing?.status === 'connected' &&
          existing.accountId !== user.accountId &&
          existing.accountId !== '90001'
        )
          throw new Error('connection_exists');
      }
      await tx.proofConnection.upsert({
        where: { id: 'proof' },
        create: { id: 'proof', ...data },
        update: data,
      });
      await tx.proofRule.updateMany({ data: { enabled: false } });
    });
    if (actor.inviteHash) (await cookies()).delete(INVITE_COOKIE);
    result = 'connected';
  } catch {
    /* No code, tokens, raw errors or callback URLs are logged. */
  }
  return NextResponse.redirect(`${baseUrl()}${destination}?result=${result}`);
}
