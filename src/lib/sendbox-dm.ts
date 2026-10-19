import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { decrypt, encrypt } from './crypto';
import { required } from './config';
import { latinDigits, parseBudget } from './recommendations';
import { normalize } from './matching';

const message = z.object({
  sender: z.object({ id: z.string().regex(/^\d{1,40}$/) }),
  recipient: z.object({ id: z.string().regex(/^\d{1,40}$/) }),
  timestamp: z.number().int().positive(),
  message: z.object({
    mid: z.string().min(1).max(500),
    text: z.string().trim().min(1).max(1000),
    is_echo: z.boolean().optional(),
    is_deleted: z.boolean().optional(),
    is_unsupported: z.boolean().optional(),
  }),
});
export function incomingDm(data: unknown, selfId: string, since: Date, now = new Date()) {
  const batch = z.object({ messaging: z.array(z.unknown()).max(100) }).safeParse(data);
  return (batch.success ? batch.data.messaging : [data]).flatMap((value) => {
    const parsed = message.safeParse(value);
    if (!parsed.success) return [];
    const item = parsed.data;
    if (
      item.message.is_echo ||
      item.message.is_deleted ||
      item.message.is_unsupported ||
      item.sender.id === selfId ||
      item.recipient.id !== selfId ||
      item.timestamp < since.getTime() ||
      item.timestamp > now.getTime() + 60000 ||
      now.getTime() - item.timestamp > 23 * 3600_000
    )
      return [];
    return [item];
  });
}
function privateHash(value: string) {
  return createHmac('sha256', required('TOKEN_ENCRYPTION_KEY'))
    .update(`sendbox-dm:${value}`)
    .digest('hex');
}
export function dmBudget(text: string, millions: boolean) {
  const value = latinDigits(normalize(text));
  const matches = [...value.matchAll(/\d+(?:[.٫]\d+)?/g)];
  if (
    millions &&
    matches.length === 1 &&
    !/ریال|دلار|یورو|تتر|usd|eur|هزار|میلیون|از\s*\d|بین\s*\d|[-−]\s*\d|تومان\s*تا/.test(value)
  ) {
    const match = value.match(/(\d+(?:[.٫]\d+)?)\s*(?:تومن|تومان)/);
    const amount = match ? Number(match[1].replace('٫', '.')) : 0;
    if (amount > 0 && amount < 1000) return parseBudget(`${amount} میلیون تومان`);
  }
  return parseBudget(text);
}

export async function enqueueDm(accountId: string, data: unknown) {
  return db.$transaction(async (tx) => {
    // Serialize enrollment against settings changes and concurrent duplicate webhook deliveries.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261020, 1)`;
    const config = await tx.sendboxDmSettings.findUnique({
      where: { accountId },
      include: { connection: true, page: { include: { workspace: true } } },
    });
    const now = new Date();
    if (
      !config?.enabled ||
      config.connection.expiresAt <= now ||
      config.page.workspace.paused ||
      config.workspaceId !== 'operator-catalog' ||
      config.page.handle.toLowerCase() !== config.connection.username.toLowerCase() ||
      (await tx.operationControl.findUnique({ where: { id: 'proof' } }))?.paused
    )
      return 0;
    const items = incomingDm(data, config.connection.instagramId, config.enabledSince, now);
    let created = 0;
    for (const item of items) {
      const messageHash = privateHash(`message:${accountId}:${item.message.mid}`);
      const senderHash = privateHash(`sender:${accountId}:${item.sender.id}`);
      if (
        await tx.sendboxDmDelivery.findUnique({
          where: { accountId_messageHash: { accountId, messageHash } },
        })
      )
        continue;
      const minute = new Date(now.getTime() - 60000);
      const day = new Date(now.getTime() - 86400_000);
      // Count suppressed attempts too; bounded database queue and test quota.
      if (
        (await tx.sendboxDmDelivery.count({ where: { accountId, receivedAt: { gte: day } } })) >=
        100
      )
        continue;
      const limited =
        (await tx.sendboxDmDelivery.count({ where: { accountId, receivedAt: { gte: minute } } })) >=
          20 ||
        (await tx.sendboxDmDelivery.count({
          where: { accountId, senderHash, receivedAt: { gte: minute } },
        })) >= 5;
      const id = randomUUID();
      await tx.sendboxDmDelivery.create({
        data: {
          id,
          accountId,
          messageHash,
          senderHash,
          revision: config.revision,
          status: limited ? 'suppressed' : 'pending',
          errorKind: limited ? 'test_rate_limit' : null,
          payloadCipher: limited
            ? null
            : encrypt(
                JSON.stringify({ sender: item.sender.id, text: item.message.text }),
                `sendbox-dm:${id}`,
              ),
          inboundAt: new Date(item.timestamp),
          expiresAt: new Date(item.timestamp + 23 * 3600_000),
        },
      });
      created++;
    }
    return created;
  });
}

export async function dmReply(
  workspaceId: string,
  pageId: string,
  text: string,
  millions: boolean,
) {
  const budget = dmBudget(text, millions);
  if (budget.status === 'clarify') return `سلام! ${budget.message}`;
  const normalized = normalize(text);
  const known = await db.catalogProduct.findMany({
    where: { workspaceId, pageId, active: true },
    distinct: ['category'],
    select: { category: true },
    take: 500,
  });
  const categories = known
    .map((p) => p.category)
    .filter((v) => normalize(v).length > 1 && normalized.includes(normalize(v)));
  const products = await db.catalogProduct.findMany({
    where: {
      workspaceId,
      pageId,
      active: true,
      stock: { gt: 0 },
      priceToman: { lte: BigInt(budget.toman) },
      ...(categories.length ? { category: { in: categories } } : {}),
    },
    orderBy: [{ priceToman: 'asc' }, { id: 'asc' }],
    take: 100,
  });
  const selected = products.slice(0, 3);
  if (!selected.length)
    return 'سلام! در کاتالوگ این پیج محصول موجودی در این بودجه پیدا نکردم. بودجهٔ دیگری مدنظرت هست؟';
  let result = `سلام! تا ${budget.toman.toLocaleString('fa-IR')} تومان این گزینه‌ها موجودند:\n`;
  for (const p of selected) {
    const block = `\n${p.name.slice(0, 80)} — ${p.priceToman.toLocaleString('fa-IR')} تومان\n${p.description.slice(0, 80)}${p.url.length <= 250 ? '\n' + p.url : ''}\n`;
    if (result.length + block.length > 900) break;
    result += block;
  }
  return result + '\nقیمت و موجودی از کاتالوگ فروشگاه است؛ برای خرید با فروشنده هماهنگ کن.';
}

export async function configureDm(pageId: string, enabled: boolean, shorthandMillions: boolean) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261020, 1)`;
    const connection = await tx.sendboxConnection.findUnique({ where: { id: 'proof' } });
    const page = await tx.catalogPage.findFirst({
      where: { id: pageId, workspaceId: 'operator-catalog' },
      include: { workspace: true },
    });
    if (
      !connection ||
      connection.expiresAt <= new Date() ||
      !page ||
      page.handle.toLowerCase() !== connection.username.toLowerCase() ||
      (page.workspace.paused && enabled)
    )
      throw new Error('catalog_connection_mismatch');
    const values = {
      pageId,
      workspaceId: page.workspaceId,
      enabled,
      shorthandMillions,
      revision: randomUUID(),
      enabledSince: new Date(),
    };
    await tx.sendboxDmSettings.upsert({
      where: { accountId: connection.accountId },
      create: { accountId: connection.accountId, ...values },
      update: values,
    });
    await tx.sendboxDmDelivery.updateMany({
      where: { accountId: connection.accountId, status: 'pending' },
      data: { status: 'suppressed', errorKind: 'settings_changed', payloadCipher: null },
    });
    await tx.adminAudit.create({
      data: {
        actorId: 'operator',
        action: enabled ? 'dm_pilot_enabled' : 'dm_pilot_disabled',
        targetId: pageId,
        detail: 'rules_catalog_only',
      },
    });
  });
}

export type DmSendResult = 'accepted' | 'unknown' | 'authentication' | 'rejected' | 'rate_limit';
export async function sendDm(
  accountId: string,
  recipient: string,
  text: string,
): Promise<DmSendResult> {
  try {
    const response = await fetch('https://api.sendbox.chat/api/v1/service/actions/send_message', {
      method: 'POST',
      headers: {
        'X-Api-Key': required('SENDBOX_API_KEY'),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ account_id: accountId, recipient_id: recipient, message: text }),
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    if ([401, 403].includes(response.status)) return 'authentication';
    if (response.status === 429) return 'rate_limit';
    if (response.status >= 500 || (response.status >= 300 && response.status < 400))
      return 'unknown';
    if (!response.ok) return 'rejected';
    // Acceptance is not delivery. Async events remain separate evidence until correlated.
    const reader = response.body?.getReader();
    if (!reader) return 'unknown';
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 65536) {
        await reader.cancel();
        return 'unknown';
      }
      chunks.push(item.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body?.success === true ? 'accepted' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function tickDm(transport = sendDm) {
  const now = new Date();
  await db.sendboxDmDelivery.updateMany({
    where: { status: 'sending', leaseUntil: { lt: now } },
    data: {
      status: 'unknown',
      errorKind: 'interrupted',
      leaseToken: null,
      leaseUntil: null,
      payloadCipher: null,
    },
  });
  await db.sendboxDmDelivery.updateMany({
    where: { expiresAt: { lt: now }, payloadCipher: { not: null } },
    data: { payloadCipher: null, status: 'expired', errorKind: 'window_closed' },
  });
  if ((await db.operationControl.findUnique({ where: { id: 'proof' } }))?.paused) return 0;
  const pending = await db.sendboxDmDelivery.findMany({
    where: { status: 'pending', nextAttemptAt: { lte: now }, expiresAt: { gt: now } },
    orderBy: { receivedAt: 'asc' },
    take: 2,
  });
  let processed = 0;
  for (const job of pending) {
    const token = randomUUID();
    const claimed = await db.sendboxDmDelivery.updateMany({
      where: { id: job.id, status: 'pending' },
      data: {
        status: 'sending',
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 45000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) continue;
    const finish = (status: string, errorKind: string | null, retry = false) =>
      db.sendboxDmDelivery.updateMany({
        where: { id: job.id, status: 'sending', leaseToken: token },
        data: {
          status,
          errorKind,
          leaseToken: null,
          leaseUntil: null,
          ...(retry ? { nextAttemptAt: new Date(Date.now() + 120000) } : { payloadCipher: null }),
        },
      });
    let dispatched = false;
    try {
      const config = await db.sendboxDmSettings.findUnique({
        where: { accountId: job.accountId },
        include: { connection: true, page: { include: { workspace: true } } },
      });
      if (
        !config?.enabled ||
        config.revision !== job.revision ||
        config.workspaceId !== 'operator-catalog' ||
        config.page.workspace.paused ||
        config.connection.expiresAt <= new Date() ||
        config.page.handle.toLowerCase() !== config.connection.username.toLowerCase() ||
        !job.payloadCipher
      ) {
        await finish('suppressed', 'settings_changed');
        continue;
      }
      const payload = z
        .object({ sender: z.string().regex(/^\d{1,40}$/), text: z.string().max(1000) })
        .parse(JSON.parse(decrypt(job.payloadCipher, `sendbox-dm:${job.id}`)));
      const reply = await dmReply(
        config.workspaceId,
        config.pageId,
        payload.text,
        config.shorthandMillions,
      );
      // Check emergency stop and revision again immediately before crossing provider boundary.
      const latest = await db.sendboxDmSettings.findUnique({ where: { accountId: job.accountId } });
      if (
        !latest?.enabled ||
        latest.revision !== job.revision ||
        (await db.workspace.findUnique({ where: { id: config.workspaceId } }))?.paused ||
        (await db.operationControl.findUnique({ where: { id: 'proof' } }))?.paused ||
        job.expiresAt <= new Date()
      ) {
        await finish('suppressed', 'paused_or_expired');
        continue;
      }
      dispatched = true;
      const outcome = await transport(job.accountId, payload.sender, reply);
      if (outcome === 'authentication')
        await db.sendboxDmSettings.updateMany({
          where: { accountId: job.accountId, revision: job.revision },
          data: { enabled: false, revision: randomUUID() },
        });
      const retry = outcome === 'rate_limit' && job.attempts < 2;
      await finish(
        retry
          ? 'pending'
          : outcome === 'accepted'
            ? 'accepted'
            : outcome === 'unknown'
              ? 'unknown'
              : 'failed',
        outcome === 'accepted' ? null : outcome,
        retry,
      );
      processed++;
    } catch {
      // A post-send crash must never trigger an automatic second send.
      await finish(
        dispatched ? 'unknown' : 'failed',
        dispatched ? 'result_unknown' : 'processing_failed',
      );
    }
  }
  return processed;
}
