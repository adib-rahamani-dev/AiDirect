import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { decrypt, encrypt } from './crypto';
import { required } from './config';
import {
  dialogueState,
  dmBudget,
  planDmReply,
  type DialogueState,
  type DialogueSettings,
  type DialoguePlan,
} from './dm-dialogue';
import { extractDmNeed } from './dm-ai';
export { dmBudget } from './dm-dialogue';

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
  return (
    await planDmReply({
      workspaceId,
      pageId,
      text,
      settings: {
        tone: 'friendly',
        shippingPolicy: '',
        shorthandMillions: millions,
        aiEnabled: false,
      },
      firstTurn: true,
    })
  ).reply;
}

export async function configureDm(
  pageId: string,
  enabled: boolean,
  shorthandMillions: boolean,
  preferences?: Partial<Pick<DialogueSettings, 'tone' | 'shippingPolicy' | 'aiEnabled'>>,
) {
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
    const current = await tx.sendboxDmSettings.findUnique({
      where: { accountId: connection.accountId },
    });
    const values = {
      pageId,
      workspaceId: page.workspaceId,
      enabled,
      shorthandMillions,
      tone: preferences?.tone ?? current?.tone ?? 'friendly',
      shippingPolicy: preferences?.shippingPolicy ?? current?.shippingPolicy ?? '',
      aiEnabled: preferences?.aiEnabled ?? current?.aiEnabled ?? false,
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
    await tx.sendboxDmContext.updateMany({
      where: { accountId: connection.accountId },
      data: { stateCipher: null, handedOff: false, expiresAt: new Date() },
    });
    await tx.adminAudit.create({
      data: {
        actorId: 'operator',
        action: enabled ? 'dm_pilot_enabled' : 'dm_pilot_disabled',
        targetId: pageId,
        detail: `hybrid_catalog_dialogue;ai=${values.aiEnabled};tone=${values.tone}`,
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
  if (process.env.SENDBOX_TEST_ENABLED !== 'true') return 'rejected';
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
  if (process.env.SENDBOX_TEST_ENABLED !== 'true') return 0;
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
    orderBy: [{ inboundAt: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
    take: 10,
  });
  let processed = 0;
  for (const job of pending) {
    if (processed >= 2) break;
    const token = randomUUID(),
      lane = { accountId: job.accountId, senderHash: job.senderHash };
    const context = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261021, 1)`;
      const first = await tx.sendboxDmDelivery.findFirst({
        where: { ...lane, status: { in: ['pending', 'sending'] }, expiresAt: { gt: new Date() } },
        orderBy: [{ inboundAt: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
      });
      if (!first || first.id !== job.id || first.status !== 'pending') return null;
      const config = await tx.sendboxDmSettings.findUnique({ where: { accountId: job.accountId } });
      if (!config || config.revision !== job.revision || !config.enabled) {
        await tx.sendboxDmDelivery.updateMany({
          where: { id: job.id, status: 'pending' },
          data: { status: 'suppressed', errorKind: 'settings_changed', payloadCipher: null },
        });
        return null;
      }
      let prior = await tx.sendboxDmContext.findUnique({ where: { accountId_senderHash: lane } });
      if (prior?.leaseToken && prior.leaseUntil && prior.leaseUntil > new Date()) return null;
      if (
        prior &&
        (prior.revision !== job.revision ||
          prior.expiresAt <= new Date() ||
          prior.workspaceId !== config.workspaceId ||
          prior.pageId !== config.pageId)
      ) {
        prior = await tx.sendboxDmContext.update({
          where: { accountId_senderHash: lane },
          data: {
            stateCipher: null,
            handedOff: false,
            lastInboundAt: null,
            revision: job.revision,
            workspaceId: config.workspaceId,
            pageId: config.pageId,
          },
        });
      }
      const claimed = await tx.sendboxDmDelivery.updateMany({
        where: { id: job.id, status: 'pending' },
        data: {
          status: 'sending',
          leaseToken: token,
          leaseUntil: new Date(Date.now() + 90000),
          attempts: { increment: 1 },
        },
      });
      if (!claimed.count) return null;
      return tx.sendboxDmContext.upsert({
        where: { accountId_senderHash: lane },
        create: {
          ...lane,
          workspaceId: config.workspaceId,
          pageId: config.pageId,
          revision: job.revision,
          leaseToken: token,
          leaseUntil: new Date(Date.now() + 90000),
          expiresAt: job.expiresAt,
        },
        update: { leaseToken: token, leaseUntil: new Date(Date.now() + 90000) },
      });
    });
    if (!context) continue;
    const finish = (status: string, errorKind: string | null, retry = false) =>
      db.sendboxDmDelivery.updateMany({
        where: { id: job.id, status: 'sending', leaseToken: token },
        data: {
          status,
          errorKind,
          leaseToken: null,
          leaseUntil: null,
          ...(retry ? { nextAttemptAt: new Date(Date.now() + 120000) } : { payloadCipher: null }),
          ...(status === 'accepted'
            ? {
                responseMs: Math.max(0, Math.min(2147483647, Date.now() - job.inboundAt.getTime())),
              }
            : {}),
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
      if (context.lastInboundAt && context.lastInboundAt > job.inboundAt) {
        await finish('suppressed', 'out_of_order');
        continue;
      }
      if (context.handedOff) {
        await finish('suppressed', 'human_handoff');
        continue;
      }
      const payload = z
        .object({ sender: z.string().regex(/^\d{1,40}$/), text: z.string().max(1000) })
        .parse(JSON.parse(decrypt(job.payloadCipher, 'sendbox-dm:' + job.id)));
      const contextKey = 'dm-context:' + job.accountId + ':' + job.senderHash + ':' + job.revision;
      const state: DialogueState = context.stateCipher
        ? dialogueState.parse(JSON.parse(decrypt(context.stateCipher, contextKey)))
        : { products: [] };
      const plan = await planDmReply({
        workspaceId: config.workspaceId,
        pageId: config.pageId,
        text: payload.text,
        settings: config,
        state,
        firstTurn: !context.lastInboundAt,
        seed: parseInt(job.messageHash.slice(0, 6), 16),
        extractor: config.aiEnabled
          ? async (text, categories) => {
              const consent = await db.sendboxDmSettings.findUnique({
                where: { accountId: job.accountId },
              });
              if (
                !consent?.enabled ||
                !consent.aiEnabled ||
                consent.revision !== job.revision ||
                (await db.operationControl.findUnique({ where: { id: 'proof' } }))?.paused
              )
                throw Object.assign(new Error('ai_disabled'), { externalAttempted: false });
              return extractDmNeed(text, categories, job.accountId);
            }
          : undefined,
      });
      await db.sendboxDmDelivery.updateMany({
        where: { id: job.id, status: 'sending', leaseToken: token },
        data: {
          intent: plan.intent,
          resultKind: plan.resultKind,
          interpretation: plan.interpretation,
          aiAttempted: plan.aiAttempted,
          aiSucceeded: plan.aiSucceeded,
          budgetBucket: plan.budgetBucket,
          selectedProductIds: plan.selectedProductIds,
          analyzedAt: new Date(),
        },
      });
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
      if (plan.handedOff)
        await db.sendboxDmContext.updateMany({
          where: { ...lane, leaseToken: token },
          data: { handedOff: true },
        });
      const outcome = await transport(job.accountId, payload.sender, plan.reply);
      if (outcome === 'authentication')
        await db.sendboxDmSettings.updateMany({
          where: { accountId: job.accountId, revision: job.revision },
          data: { enabled: false, revision: randomUUID() },
        });
      // Unknown or failed model/send results never become conversation memory.
      if (outcome === 'accepted')
        await db.sendboxDmContext.updateMany({
          where: { ...lane, leaseToken: token, revision: job.revision },
          data: {
            stateCipher: encrypt(JSON.stringify(plan.state), contextKey),
            handedOff: plan.handedOff,
            lastInboundAt: job.inboundAt,
            expiresAt: job.expiresAt,
          },
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
      await finish(
        dispatched ? 'unknown' : 'failed',
        dispatched ? 'result_unknown' : 'processing_failed',
      );
    } finally {
      await db.sendboxDmContext.updateMany({
        where: { ...lane, leaseToken: token },
        data: { leaseToken: null, leaseUntil: null },
      });
    }
  }
  return processed;
}
