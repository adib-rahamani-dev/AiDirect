import { db } from './db';
import { automaticSending, provider, realSending } from './config';
import { encrypt } from './crypto';
import { matches } from './matching';
import type { IncomingComment } from './webhook';
import { randomUUID } from 'node:crypto';
export async function ingest(
  comments: IncomingComment[],
  source: 'webhook' | 'manual' | 'simulation',
) {
  const conn = await db.proofConnection.findUnique({ where: { id: 'proof' } });
  const rule = await db.proofRule.findUnique({ where: { id: 'proof' } });
  if (!conn || conn.status !== 'connected' || !rule || conn.accountId !== rule.accountId) return;
  const mode = provider();
  if ((source === 'simulation') !== (mode === 'simulated')) return;
  const events = comments
    .filter(
      (c) =>
        c.accountId === conn.accountId &&
        c.mediaId === rule.mediaId &&
        !c.parentId &&
        c.authorId !== conn.accountId &&
        c.authorUsername !== conn.username &&
        (!c.productType || ['FEED', 'REELS'].includes(c.productType)),
    )
    .map((c) => ({
      id: randomUUID(),
      accountId: c.accountId,
      commentId: c.commentId,
      mediaId: c.mediaId,
      source,
      matched: matches(c.text, rule.keyword),
    }));
  if (!events.length) return;
  // One bounded batch transaction keeps the webhook fast even for aggregated updates.
  await db.$transaction(async (tx) => {
    const created = await tx.commentEvent.createManyAndReturn({
      data: events,
      skipDuplicates: true,
    });
    if (
      !rule.enabled ||
      (source !== 'manual' && !automaticSending()) ||
      (mode === 'meta' && !realSending())
    )
      return;
    // RETURNING includes only new rows: replayed events cannot create new jobs.
    const inserted = created.filter((event) => event.matched);
    if (!inserted.length) return;
    await tx.delivery.createMany({
      data: inserted.map((e) => ({
        eventId: e.id,
        accountId: e.accountId,
        commentId: e.commentId,
        mediaId: e.mediaId,
        provider: mode,
        source,
        replyCipher: encrypt(
          `${rule.replyText}\n${rule.link}`,
          `reply:${mode}:${e.accountId}:${e.commentId}`,
        ),
      })),
      skipDuplicates: true,
    });
  });
}
