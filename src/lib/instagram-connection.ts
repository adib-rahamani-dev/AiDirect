import { randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from './db';
import { hash, equal, encrypt, decrypt } from './crypto';
import { baseUrl, provider } from './config';
import { customerIdentity, ensureCustomerWorkspace, consumeAuthLimit } from './customer-auth';
import { hasOwnerSession } from './platform-access';
import { operatorCatalogIdentity } from './catalog';
import { authorizeUrl, exchangeCode, profile, refreshToken, MetaError } from './meta';
export const CUSTOMER_META_COOKIE = 'aidirect_customer_oauth';
export class InstagramError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export async function instagramActor(headers: Headers) {
  if (await hasOwnerSession()) {
    await operatorCatalogIdentity();
    return {
      userId: 'operator',
      workspace: await db.workspace.findUniqueOrThrow({ where: { id: 'operator-catalog' } }),
    };
  }
  const user = await customerIdentity(headers);
  return { userId: user.id, workspace: await ensureCustomerWorkspace(user.id, user.name) };
}
export async function startInstagramOAuth(headers: Headers) {
  const actor = await instagramActor(headers);
  if (provider() !== 'meta' || !process.env.INSTAGRAM_APP_ID || !process.env.INSTAGRAM_APP_SECRET)
    throw new InstagramError(409, 'meta_not_ready');
  if (!(await consumeAuthLimit('instagram-connect:' + actor.userId, 600, 10)).allowed)
    throw new InstagramError(429, 'wait');
  const state = randomBytes(32).toString('base64url');
  await db.instagramOAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.instagramOAuthAttempt.create({
    data: {
      stateHash: hash(state),
      workspaceId: actor.workspace.id,
      userId: actor.userId,
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  (await cookies()).set(CUSTOMER_META_COOKIE, state, {
    httpOnly: true,
    secure: baseUrl().startsWith('https:'),
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return NextResponse.redirect(authorizeUrl(state));
}
export async function saveInstagramGrant(
  workspaceId: string,
  account: { accountId: string; appScopedId?: string; username: string },
  token: { accessToken: string; expiresIn: number },
  guard?: { stateHash: string; userId: string },
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
    if (guard) {
      const claimed = await tx.instagramOAuthAttempt.deleteMany({
        where: { ...guard, workspaceId, expiresAt: { gt: new Date() } },
      });
      if (!claimed.count) throw new InstagramError(409, 'oauth_cancelled');
    }
    const occupied = await tx.instagramConnection.findUnique({
      where: { accountId: account.accountId },
    });
    if (occupied && occupied.workspaceId !== workspaceId)
      throw new InstagramError(409, 'page_already_connected');
    const prior = await tx.instagramConnection.findUnique({ where: { workspaceId } });
    if (prior && prior.accountId !== account.accountId) {
      if (prior.status !== 'disconnected')
        throw new InstagramError(409, 'disconnect_before_replacement');
      await tx.instagramConnection.delete({ where: { id: prior.id } });
    }
    const now = new Date();
    const values = {
      accountId: account.accountId,
      appScopedId: account.appScopedId ?? account.accountId,
      username: account.username,
      tokenCipher: encrypt(
        token.accessToken,
        `instagram-token:${workspaceId}:${account.accountId}`,
      ),
      status: 'connected',
      subscribed: false,
      errorKind: null,
      issuedAt: now,
      expiresAt: new Date(Date.now() + token.expiresIn * 1000),
      acceptSince: now,
      autoDm: false,
      settingsRevision: randomUUID(),
    };
    const connection = await tx.instagramConnection.upsert({
      where: { workspaceId },
      create: { workspaceId, ...values },
      update: values,
    });
    await tx.instagramAutomation.updateMany({ where: { workspaceId }, data: { enabled: false } });
    await tx.instagramThread.updateMany({
      where: { workspaceId },
      data: { contextCipher: null, handedOff: true },
    });
    await tx.instagramJob.updateMany({
      where: { workspaceId, status: 'pending' },
      data: { status: 'skipped', payloadCipher: null, errorKind: 'reconnected' },
    });
    await tx.catalogPage.upsert({
      where: { workspaceId_handle: { workspaceId, handle: account.username.toLowerCase() } },
      create: { workspaceId, handle: account.username.toLowerCase(), name: account.username },
      update: {},
    });
    return connection;
  });
}
export async function finishInstagramOAuth(request: Request) {
  let result = 'oauth_failed';
  try {
    const actor = await instagramActor(request.headers),
      jar = await cookies(),
      params = new URL(request.url).searchParams;
    const state = params.get('state') ?? '',
      cookie = jar.get(CUSTOMER_META_COOKIE)?.value ?? '';
    if (!state || !cookie || !equal(state, cookie)) throw new Error('invalid_state');
    const guard = { stateHash: hash('instagram-finishing:' + state), userId: actor.userId };
    const consumed = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${actor.workspace.id} FOR UPDATE`;
      const result = await tx.instagramOAuthAttempt.deleteMany({
        where: {
          stateHash: hash(state),
          workspaceId: actor.workspace.id,
          userId: actor.userId,
          expiresAt: { gt: new Date() },
        },
      });
      if (result.count)
        await tx.instagramOAuthAttempt.create({
          data: {
            ...guard,
            workspaceId: actor.workspace.id,
            expiresAt: new Date(Date.now() + 600000),
          },
        });
      return result;
    });
    jar.delete(CUSTOMER_META_COOKIE);
    if (!consumed.count || params.has('error') || !params.get('code')) throw new Error('denied');
    const token = await exchangeCode(params.get('code')!);
    const account = await profile(token.accessToken);
    await saveInstagramGrant(actor.workspace.id, account, token, guard);
    result = 'connected';
  } catch (e) {
    if (
      e instanceof InstagramError &&
      ['page_already_connected', 'disconnect_before_replacement'].includes(e.code)
    )
      result = e.code;
  }
  return NextResponse.redirect(`${baseUrl()}/dashboard/instagram?result=${result}`);
}
export async function instagramToken(workspaceId: string) {
  const c = await db.instagramConnection.findUnique({
    where: { workspaceId },
    include: { workspace: { include: { owner: true } } },
  });
  if (!c || c.status !== 'connected' || !c.tokenCipher || c.expiresAt <= new Date())
    throw new InstagramError(409, 'connection_required');
  if (c.workspace.paused || c.workspace.owner?.suspended)
    throw new InstagramError(409, 'workspace_paused');
  let token = decrypt(c.tokenCipher, `instagram-token:${workspaceId}:${c.accountId}`);
  if (c.expiresAt.getTime() - Date.now() < 7 * 86400000) {
    try {
      const fresh = await refreshToken(token);
      const updated = await db.instagramConnection.updateMany({
        where: { id: c.id, tokenCipher: c.tokenCipher, status: 'connected' },
        data: {
          tokenCipher: encrypt(fresh.accessToken, `instagram-token:${workspaceId}:${c.accountId}`),
          expiresAt: new Date(Date.now() + fresh.expiresIn * 1000),
          issuedAt: new Date(),
        },
      });
      if (!updated.count) throw new InstagramError(409, 'connection_changed');
      token = fresh.accessToken;
    } catch (e) {
      if (e instanceof MetaError && e.kind === 'token')
        await db.instagramConnection.updateMany({
          where: { id: c.id, tokenCipher: c.tokenCipher, status: 'connected' },
          data: { status: 'expired', autoDm: false, errorKind: 'token', tokenCipher: '' },
        });
      throw e;
    }
  }
  return { connection: c, token };
}
export async function disconnectInstagram(workspaceId: string) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
    await tx.instagramConnection.updateMany({
      where: { workspaceId },
      data: { status: 'disconnected', tokenCipher: '', subscribed: false, autoDm: false },
    });
    await tx.instagramAutomation.updateMany({ where: { workspaceId }, data: { enabled: false } });
    await tx.instagramThread.updateMany({
      where: { workspaceId },
      data: { senderCipher: '', contextCipher: null, handedOff: true },
    });
    await tx.instagramMessage.updateMany({ where: { workspaceId }, data: { textCipher: null } });
    await tx.instagramWebhookEnvelope.updateMany({
      where: { workspaceId },
      data: { status: 'discarded', payloadCipher: null },
    });
    await tx.instagramJob.updateMany({
      where: { workspaceId, status: 'pending' },
      data: { status: 'skipped', payloadCipher: null, errorKind: 'disconnected' },
    });
    await tx.instagramOAuthAttempt.deleteMany({ where: { workspaceId } });
  });
}
