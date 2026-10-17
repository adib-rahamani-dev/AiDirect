import { db } from './db';
import { decrypt, encrypt } from './crypto';
import { automaticSending, provider, realSending } from './config';
import { matches } from './matching';
import { MetaError, metaAdapter, refreshToken, type InstagramAdapter } from './meta';
import { simulatedAdapter } from './simulated';
import { randomUUID } from 'node:crypto';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function tick(
  adapter: InstagramAdapter = provider() === 'meta' ? metaAdapter : simulatedAdapter,
) {
  const now = new Date();
  // A crashed worker may already have sent a message. These jobs are quarantined.
  await db.delivery.updateMany({
    where: { status: 'sending', leaseUntil: { lt: now } },
    data: { status: 'unknown', errorKind: 'worker_interrupted', leaseUntil: null },
  });
  await db.delivery.updateMany({
    where: { status: 'preparing', leaseUntil: { lt: now } },
    data: { status: 'pending', leaseUntil: null },
  });
  const claimId = randomUUID();
  const job = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT d.id FROM "Delivery" d JOIN "ProofConnection" c ON c."accountId"=d."accountId" WHERE d.status='pending' AND d.provider=${adapter.kind} AND d."nextAttemptAt"<=${now} AND c.status='connected' AND c."nextSendAt"<=${now} ORDER BY d."createdAt" FOR UPDATE OF d SKIP LOCKED LIMIT 1`;
    if (!rows[0]) return null;
    // Reserve per-account pacing under a row lock, shared by all worker processes.
    const connections = await tx.$queryRaw<
      { accountId: string }[]
    >`SELECT "accountId" FROM "ProofConnection" WHERE id='proof' AND "nextSendAt"<=${now} FOR UPDATE SKIP LOCKED`;
    if (!connections[0]) return null;
    await tx.proofConnection.update({
      where: { id: 'proof' },
      data: { nextSendAt: new Date(Date.now() + 6000) },
    });
    return tx.delivery.update({
      where: { id: rows[0].id },
      data: {
        status: 'preparing',
        leaseUntil: new Date(Date.now() + 120000),
        leaseToken: claimId,
        attempts: { increment: 1 },
      },
    });
  });
  if (!job) return false;
  let sending = false;
  const finish = async (status: string, error?: MetaError, messageId?: string) => {
    // Conditional lease protects against a stale worker changing a recovered job.
    await db.delivery.updateMany({
      where: { id: job.id, leaseToken: claimId, status: { in: ['preparing', 'sending'] } },
      data: {
        status,
        messageId,
        errorKind: error?.kind,
        errorCode: error?.code,
        errorSubcode: error?.subcode,
        traceId: error?.traceId,
        leaseUntil: null,
        leaseToken: null,
      },
    });
  };
  try {
    const conn = await db.proofConnection.findUnique({ where: { id: 'proof' } });
    const rule = await db.proofRule.findUnique({ where: { id: 'proof' } });
    if (
      !conn ||
      conn.accountId !== job.accountId ||
      conn.status !== 'connected' ||
      !rule ||
      !rule.enabled ||
      rule.accountId !== job.accountId ||
      rule.mediaId !== job.mediaId
    ) {
      await finish('skipped');
      return true;
    }
    if (
      (adapter.kind === 'meta' && !realSending()) ||
      (job.source !== 'manual' && !automaticSending())
    ) {
      await finish('skipped');
      return true;
    }
    if (conn.expiresAt <= now) {
      await db.proofConnection.update({
        where: { id: 'proof' },
        data: { status: 'reauthorize_required' },
      });
      await finish('failed', new MetaError('token'));
      return true;
    }
    const token = decrypt(conn.tokenCipher, `token:${conn.accountId}`);
    // entry.time is delivery time, not comment creation time. Read authoritative timestamp.
    const comment = await adapter.comment(job.commentId, token);
    const timestamp = Date.parse(comment.timestamp);
    if (
      !Number.isFinite(timestamp) ||
      timestamp > Date.now() + 60000 ||
      Date.now() - timestamp >= 7 * 86400_000
    ) {
      await finish('expired');
      return true;
    }
    // Reconnected accounts only process fresh comments, including after data deletion.
    if (timestamp < conn.acceptCommentsSince.getTime()) {
      await finish('skipped');
      return true;
    }
    if (
      comment.media?.id !== job.mediaId ||
      comment.parent_id ||
      comment.hidden ||
      comment.from?.id === conn.accountId ||
      comment.from?.username === conn.username ||
      comment.username === conn.username ||
      !matches(comment.text, rule.keyword)
    ) {
      await finish('skipped');
      return true;
    }
    // Check switches a second time immediately before the irreversible API call.
    const latestRule = await db.proofRule.findUnique({ where: { id: 'proof' } });
    const latestConn = await db.proofConnection.findUnique({ where: { id: 'proof' } });
    if (
      !latestRule?.enabled ||
      latestRule.mediaId !== job.mediaId ||
      latestConn?.status !== 'connected' ||
      latestConn.accountId !== job.accountId
    ) {
      await finish('skipped');
      return true;
    }
    const changed = await db.delivery.updateMany({
      where: {
        id: job.id,
        status: 'preparing',
        leaseToken: claimId,
        leaseUntil: { gt: new Date() },
      },
      data: { status: 'sending', leaseUntil: new Date(Date.now() + 120000) },
    });
    if (!changed.count) return true;
    sending = true;
    const result = await adapter.send(
      job.accountId,
      job.commentId,
      decrypt(job.replyCipher, `reply:${job.provider}:${job.accountId}:${job.commentId}`),
      token,
    );
    await finish(
      adapter.kind === 'simulated' ? 'simulated' : 'accepted',
      undefined,
      result.messageId,
    );
  } catch (error) {
    const e = error instanceof MetaError ? error : new MetaError(sending ? 'unknown' : 'permanent');
    if (e.kind === 'token')
      await db.proofConnection.updateMany({
        where: { accountId: job.accountId },
        data: { status: 'reauthorize_required' },
      });
    const retry = (e.kind === 'rate_limit' || e.kind === 'temporary') && job.attempts < 5;
    if (retry) {
      const delay =
        Math.max(e.retryAfter, Math.min(3600, 30 * 2 ** job.attempts)) +
        Math.floor(Math.random() * 15);
      await db.delivery.updateMany({
        where: { id: job.id, leaseToken: claimId, status: { in: ['preparing', 'sending'] } },
        data: {
          status: 'pending',
          nextAttemptAt: new Date(Date.now() + delay * 1000),
          leaseUntil: null,
          leaseToken: null,
          errorKind: e.kind,
          errorCode: e.code,
          errorSubcode: e.subcode,
          traceId: e.traceId,
        },
      });
      if (e.kind === 'rate_limit')
        await db.proofConnection.updateMany({
          where: { accountId: job.accountId },
          data: { nextSendAt: new Date(Date.now() + delay * 1000) },
        });
    } else await finish(e.kind === 'unknown' ? 'unknown' : 'failed', e);
  }
  return true;
}
export async function refreshIfNeeded() {
  if (provider() !== 'meta') return;
  const conn = await db.proofConnection.findUnique({ where: { id: 'proof' } });
  if (
    !conn ||
    conn.status !== 'connected' ||
    conn.expiresAt.getTime() - Date.now() > 7 * 86400_000 ||
    Date.now() - conn.issuedAt.getTime() < 86400_000
  )
    return;
  if (conn.expiresAt.getTime() <= Date.now()) {
    await db.proofConnection.update({
      where: { id: 'proof' },
      data: { status: 'reauthorize_required' },
    });
    return;
  }
  try {
    const result = await refreshToken(decrypt(conn.tokenCipher, `token:${conn.accountId}`));
    await db.proofConnection.updateMany({
      where: { accountId: conn.accountId, status: 'connected', tokenCipher: conn.tokenCipher },
      data: {
        tokenCipher: encrypt(result.accessToken, `token:${conn.accountId}`),
        expiresAt: new Date(Date.now() + result.expiresIn * 1000),
        issuedAt: new Date(),
      },
    });
  } catch (e) {
    if (e instanceof MetaError && e.kind === 'token')
      await db.proofConnection.updateMany({
        where: { accountId: conn.accountId },
        data: { status: 'reauthorize_required' },
      });
  }
}
export async function worker() {
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  console.log(
    JSON.stringify({
      event: 'worker_started',
      provider: provider(),
      realSendEnabled: realSending(),
    }),
  );
  let nextRefresh = 0;
  let nextHeartbeat = 0;
  while (!stopping) {
    try {
      if (Date.now() >= nextHeartbeat) {
        const data = { lastSeenAt: new Date(), provider: provider() };
        await db.workerState.upsert({
          where: { id: 'proof' },
          create: { id: 'proof', ...data },
          update: data,
        });
        nextHeartbeat = Date.now() + 15000;
      }
      if (Date.now() >= nextRefresh) {
        await refreshIfNeeded();
        nextRefresh = Date.now() + 3600_000;
      }
      await tick();
    } catch {
      console.error(JSON.stringify({ event: 'worker_iteration_failed' }));
    }
    await pause(1000);
  }
  await db.$disconnect();
}
