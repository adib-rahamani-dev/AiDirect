import { db } from './db';
import { hash, encrypt, decrypt } from './crypto';
import { z } from 'zod';
import { ingestInstagram, tickInstagram } from './instagram-jobs';
const schema = z
  .object({
    object: z.literal('instagram'),
    entry: z.array(z.object({ id: z.string().regex(/^\d{1,40}$/) }).passthrough()).max(1000),
  })
  .passthrough();
export async function storeInstagramWebhook(payload: unknown) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return 0;
  const connections = await db.instagramConnection.findMany({
    where: { accountId: { in: parsed.data.entry.map((e) => e.id) }, status: 'connected' },
  });
  const rows = parsed.data.entry.flatMap((entry) => {
    const c = connections.find((c) => c.accountId === entry.id);
    if (!c) return [];
    const body = JSON.stringify({ object: 'instagram', entry: [entry] }),
      id = hash(c.workspaceId + ':' + body);
    return [
      {
        id,
        workspaceId: c.workspaceId,
        connectionId: c.id,
        payloadCipher: encrypt(body, 'instagram-envelope:' + id),
        expiresAt: new Date(Date.now() + 86400000),
      },
    ];
  });
  if (!rows.length) return 0;
  return db.$transaction(
    async (tx) => {
      let count = 0;
      for (const row of rows) {
        await tx.$queryRaw`SELECT id FROM "InstagramConnection" WHERE id=${row.connectionId} FOR UPDATE`;
        const active = await tx.instagramConnection.findFirst({
          where: { id: row.connectionId, status: 'connected' },
          select: { id: true },
        });
        if (active)
          count += (
            await tx.instagramWebhookEnvelope.createMany({ data: row, skipDuplicates: true })
          ).count;
      }
      return count;
    },
    { timeout: 15000 },
  );
}
export async function drainInstagramWebhook(workspaceId?: string) {
  await db.instagramWebhookEnvelope.updateMany({
    where: { status: 'pending', attempts: { gte: 3 } },
    data: { status: 'failed', payloadCipher: null },
  });
  await db.instagramWebhookEnvelope.updateMany({
    where: { status: 'processing', startedAt: { lt: new Date(Date.now() - 120000) } },
    data: { status: 'pending' },
  });
  await db.instagramWebhookEnvelope.updateMany({
    where: { expiresAt: { lt: new Date() }, payloadCipher: { not: null } },
    data: { status: 'expired', payloadCipher: null },
  });
  const rows = await db.instagramWebhookEnvelope.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      status: 'pending',
      attempts: { lt: 3 },
      expiresAt: { gt: new Date() },
    },
    orderBy: { receivedAt: 'asc' },
    take: 2,
  });
  for (const row of rows) {
    const claimed = await db.instagramWebhookEnvelope.updateMany({
      where: { id: row.id, status: 'pending' },
      data: { status: 'processing', startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      await ingestInstagram(
        JSON.parse(decrypt(row.payloadCipher!, 'instagram-envelope:' + row.id)),
      );
      await db.instagramWebhookEnvelope.updateMany({
        where: { id: row.id, status: 'processing' },
        data: { status: 'processed', payloadCipher: null },
      });
    } catch {
      await db.instagramWebhookEnvelope.updateMany({
        where: { id: row.id, status: 'processing' },
        data: row.attempts >= 2 ? { status: 'failed', payloadCipher: null } : { status: 'pending' },
      });
    }
  }
  return tickInstagram(workspaceId);
}
