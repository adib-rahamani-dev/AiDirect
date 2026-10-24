import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { customerSending } from './instagram-view';
import type { Prisma } from '../generated/prisma/client';
import { encrypt, decrypt } from './crypto';
import { parseComments } from './webhook';
import { matches } from './matching';
import { dialogueState, planDmReply } from './dm-dialogue';
import { extractDmNeed } from './dm-ai';
import { assistantConfig, directAiAvailable } from './instagram-assistant';
import { instagramToken, InstagramError } from './instagram-connection';
import { metaAdapter, sendInstagramMessage, MetaError } from './meta';
import { directHash } from './instagram-ids';
import { withinBusinessHours } from './business-hours';
export { directHash } from './instagram-ids';
const inbound = z.object({
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
const envelope = z
  .object({
    object: z.literal('instagram'),
    entry: z
      .array(
        z
          .object({
            id: z.string().regex(/^\d{1,40}$/),
            messaging: z.array(z.unknown()).max(100).optional(),
          })
          .passthrough(),
      )
      .max(1000),
  })
  .passthrough();
const payloadSchema = z
  .object({
    text: z.string().max(1000).optional(),
    recipient: z
      .string()
      .regex(/^\d{1,40}$/)
      .optional(),
    commentId: z.string().regex(/^\d+$/).optional(),
    mediaId: z.string().regex(/^\d+$/).optional(),
    inboundAt: z.string().optional(),
  })
  .strict();
async function queue(
  tx: Prisma.TransactionClient,
  data: {
    workspaceId: string;
    connectionId: string;
    dedupeKey: string;
    threadId?: string;
    kind: string;
    automationId?: string;
    revision?: string;
    expiresAt: Date;
    payload: z.infer<typeof payloadSchema>;
  },
) {
  const id = randomUUID(),
    { payload, ...rest } = data;
  return tx.instagramJob.createMany({
    data: { id, ...rest, payloadCipher: encrypt(JSON.stringify(payload), 'instagram-job:' + id) },
    skipDuplicates: true,
  });
}
export async function ingestInstagram(payload: unknown) {
  const parsed = envelope.safeParse(payload);
  if (!parsed.success) return 0;
  const comments = parseComments(payload);
  let accepted = 0;
  for (const entry of parsed.data.entry) {
    const c = await db.instagramConnection.findUnique({
      where: { accountId: entry.id },
      include: { workspace: { include: { owner: true } } },
    });
    if (
      !c ||
      c.status !== 'connected' ||
      c.expiresAt <= new Date() ||
      c.workspace.paused ||
      c.workspace.owner?.suspended
    )
      continue;
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261022, 3)`;
        await tx.$queryRaw`SELECT id FROM "InstagramConnection" WHERE id=${c.id} FOR UPDATE`;
        const current = await tx.instagramConnection.findUnique({
          where: { id: c.id },
          include: { workspace: { include: { owner: true } } },
        });
        if (
          !current ||
          current.status !== 'connected' ||
          current.expiresAt <= new Date() ||
          current.workspace.paused ||
          current.workspace.owner?.suspended
        )
          return;
        Object.assign(c, current);
        const count = await tx.instagramMessage.count({
          where: {
            workspaceId: c.workspaceId,
            direction: 'inbound',
            source: 'webhook',
            receivedAt: { gte: new Date(Date.now() - 86400000) },
          },
        });
        let budget = Math.max(0, 100 - count);
        for (const raw of entry.messaging ?? []) {
          if (budget <= 0) break;
          const parsed = inbound.safeParse(raw);
          if (!parsed.success) continue;
          const item = parsed.data;
          if (
            item.message.is_echo ||
            item.message.is_deleted ||
            item.message.is_unsupported ||
            item.sender.id === c.accountId ||
            item.recipient.id !== c.accountId ||
            item.timestamp < c.acceptSince.getTime() ||
            item.timestamp > Date.now() + 60000 ||
            Date.now() - item.timestamp > 23 * 3600000
          )
            continue;
          const mid = directHash('message:' + c.accountId + ':' + item.message.mid);
          const existingMessage = await tx.instagramMessage.findUnique({
            where: { id: mid },
            select: { source: true },
          });
          if (existingMessage && existingMessage.source !== 'history') continue;
          const tid = directHash('thread:' + c.accountId + ':' + item.sender.id),
            at = new Date(item.timestamp),
            old = await tx.instagramThread.findUnique({ where: { id: tid } });
          await tx.instagramThread.upsert({
            where: { id: tid },
            create: {
              id: tid,
              workspaceId: c.workspaceId,
              connectionId: c.id,
              senderCipher: encrypt(item.sender.id, 'instagram-sender:' + tid),
              lastInboundAt: at,
              lastMessageAt: at,
            },
            update: {
              ...(old && old.lastInboundAt > at ? {} : { lastInboundAt: at, lastMessageAt: at }),
              senderCipher: encrypt(item.sender.id, 'instagram-sender:' + tid),
            },
          });
          await tx.instagramMessage.upsert({
            where: { id: mid },
            create: {
              id: mid,
              workspaceId: c.workspaceId,
              threadId: tid,
              direction: 'inbound',
              textCipher: encrypt(item.message.text, 'instagram-message:' + mid),
              expiresAt: new Date(Date.now() + 7 * 86400000),
            },
            update: {
              source: 'webhook',
              textCipher: encrypt(item.message.text, 'instagram-message:' + mid),
              receivedAt: at,
            },
          });
          const minuteCount = await tx.instagramMessage.count({
            where: {
              threadId: tid,
              source: { not: 'history' },
              receivedAt: { gte: new Date(Date.now() - 60000) },
            },
          });
          const dailyJobs = await tx.instagramJob.count({
            where: {
              workspaceId: c.workspaceId,
              createdAt: { gte: new Date(Date.now() - 86400000) },
            },
          });
          if (
            c.autoDm &&
            !old?.handedOff &&
            minuteCount <= 5 &&
            dailyJobs < 100 &&
            withinBusinessHours(assistantConfig(c.assistantConfig).businessHours)
          ) {
            await queue(tx, {
              workspaceId: c.workspaceId,
              connectionId: c.id,
              threadId: tid,
              kind: 'dm_auto',
              revision: c.settingsRevision,
              dedupeKey: directHash('reply:' + mid),
              expiresAt: new Date(item.timestamp + 23 * 3600000),
              payload: { text: item.message.text, inboundAt: at.toISOString() },
            });
          }
          budget--;
          accepted++;
        }
        const rules = await tx.instagramAutomation.findMany({
          where: { connectionId: c.id, workspaceId: c.workspaceId, enabled: true },
          take: 100,
        });
        for (const comment of comments
          .filter(
            (x) =>
              x.accountId === c.accountId &&
              !x.parentId &&
              x.authorId !== c.accountId &&
              x.authorUsername !== c.username,
          )
          .slice(0, 100)) {
          const rule = rules.find(
            (r) => r.mediaId === comment.mediaId && matches(comment.text, r.keyword),
          );
          if (!rule) continue;
          if (
            (await tx.instagramJob.count({
              where: {
                workspaceId: c.workspaceId,
                createdAt: { gte: new Date(Date.now() - 86400000) },
              },
            })) >= 100
          )
            break;
          const made = await queue(tx, {
            workspaceId: c.workspaceId,
            connectionId: c.id,
            kind: 'private_reply',
            automationId: rule.id,
            revision: rule.revision,
            dedupeKey: directHash('private:' + c.accountId + ':' + comment.commentId),
            expiresAt: new Date(Date.now() + 6 * 86400000),
            payload: {
              commentId: comment.commentId,
              mediaId: comment.mediaId,
              text: rule.replyText + (rule.link ? '\n' + rule.link : ''),
            },
          });
          accepted += made.count;
        }
      },
      { timeout: 15000 },
    );
  }
  return accepted;
}
export async function enqueueManualReply(
  workspaceId: string,
  threadId: string,
  text: string,
  requestId: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InstagramConnection" WHERE "workspaceId"=${workspaceId} FOR UPDATE`;
    const thread = await tx.instagramThread.findFirst({
      where: { id: threadId, workspaceId },
      include: { connection: true },
    });
    if (
      !thread ||
      thread.connection.status !== 'connected' ||
      thread.lastInboundAt.getTime() + 23 * 3600000 <= Date.now()
    )
      throw new InstagramError(409, 'reply_window_closed');
    if (!customerSending()) throw new InstagramError(409, 'sending_paused');
    if (
      await tx.instagramJob.findFirst({
        where: {
          workspaceId,
          threadId,
          status: 'unknown',
          createdAt: { gte: thread.lastInboundAt },
        },
      })
    )
      throw new InstagramError(409, 'result_unknown');
    if (
      (await tx.instagramJob.count({
        where: { workspaceId, createdAt: { gte: new Date(Date.now() - 86400000) } },
      })) >= 100
    )
      throw new InstagramError(429, 'daily_limit');
    await tx.instagramThread.update({ where: { id: thread.id }, data: { handedOff: true } });
    return queue(tx, {
      workspaceId,
      connectionId: thread.connectionId,
      threadId,
      kind: 'dm_manual',
      dedupeKey: directHash('manual:' + workspaceId + ':' + requestId),
      expiresAt: new Date(thread.lastInboundAt.getTime() + 23 * 3600000),
      payload: { text },
    });
  });
}
export async function expireInstagramContent() {
  const now = new Date();
  await db.instagramMessage.updateMany({
    where: { expiresAt: { lte: now }, textCipher: { not: null } },
    data: { textCipher: null },
  });
  await db.instagramThread.updateMany({
    where: { lastInboundAt: { lt: new Date(Date.now() - 23 * 3600000) } },
    data: { senderCipher: '', contextCipher: null },
  });
  await db.instagramJob.updateMany({
    where: { status: 'pending', expiresAt: { lte: now } },
    data: { status: 'expired', payloadCipher: null },
  });
}
export async function tickInstagram(
  onlyWorkspace?: string,
  transport = { dm: sendInstagramMessage, privateReply: metaAdapter.send },
) {
  await expireInstagramContent();
  await db.instagramJob.updateMany({
    where: { status: 'sending', leaseUntil: { lt: new Date() } },
    data: {
      status: 'unknown',
      payloadCipher: null,
      leaseToken: null,
      leaseUntil: null,
      errorKind: 'interrupted',
    },
  });
  if (
    !customerSending() ||
    (await db.operationControl.findUnique({ where: { id: 'proof' } }))?.paused
  )
    return 0;
  const candidates = await db.instagramJob.findMany({
    where: {
      ...(onlyWorkspace ? { workspaceId: onlyWorkspace } : {}),
      status: 'pending',
      nextAttemptAt: { lte: new Date() },
      expiresAt: { gt: new Date() },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 10,
  });
  let processed = 0;
  for (const job of candidates) {
    if (processed >= 2) break;
    const lease = randomUUID();
    const claimed = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261022, 4)`;
      const throttle = await tx.instagramConnection.findUnique({
        where: { id: job.connectionId },
        select: { nextSendAt: true },
      });
      if (!throttle || throttle.nextSendAt > new Date()) return false;
      if (job.threadId) {
        const thread = await tx.instagramThread.findFirst({
          where: { id: job.threadId, workspaceId: job.workspaceId },
        });
        if (!thread || (thread.leaseUntil && thread.leaseUntil > new Date())) return false;
        const oldest = await tx.instagramJob.findFirst({
          where: { threadId: job.threadId, status: { in: ['pending', 'sending'] } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (oldest?.id !== job.id) return false;
        await tx.instagramThread.update({
          where: { id: thread.id },
          data: { leaseToken: lease, leaseUntil: new Date(Date.now() + 90000) },
        });
      }
      const won = Boolean(
        (
          await tx.instagramJob.updateMany({
            where: { id: job.id, status: 'pending' },
            data: {
              status: 'sending',
              leaseToken: lease,
              leaseUntil: new Date(Date.now() + 90000),
              attempts: { increment: 1 },
            },
          })
        ).count,
      );
      if (won)
        await tx.instagramConnection.update({
          where: { id: job.connectionId },
          data: { nextSendAt: new Date(Date.now() + 2000) },
        });
      return won;
    });
    if (!claimed) continue;
    let dispatched = false;
    const finish = (status: string, errorKind: string | null) =>
      db.instagramJob.updateMany({
        where: { id: job.id, status: 'sending', leaseToken: lease },
        data: {
          status,
          errorKind,
          leaseToken: null,
          leaseUntil: null,
          ...(status === 'pending'
            ? { nextAttemptAt: new Date(Date.now() + 120000) }
            : { payloadCipher: null }),
        },
      });
    try {
      const { connection: c, token } = await instagramToken(job.workspaceId);
      if (c.id !== job.connectionId) throw new InstagramError(409, 'connection_changed');
      const payload = payloadSchema.parse(
        JSON.parse(decrypt(job.payloadCipher!, 'instagram-job:' + job.id)),
      );
      let text = payload.text ?? '',
        state: string | null = null,
        intent = 'manual',
        resultKind = 'manual',
        handedOff = false;
      const thread = job.threadId
        ? await db.instagramThread.findFirst({
            where: { id: job.threadId, workspaceId: job.workspaceId, connectionId: c.id },
          })
        : null;
      if (job.kind === 'private_reply') {
        const rule = await db.instagramAutomation.findFirst({
          where: {
            id: job.automationId!,
            workspaceId: job.workspaceId,
            connectionId: c.id,
            enabled: true,
            revision: job.revision!,
          },
        });
        if (!rule) throw new InstagramError(409, 'settings_changed');
        const comment = await metaAdapter.comment(payload.commentId!, token);
        if (
          comment.id !== payload.commentId ||
          comment.media?.id !== rule.mediaId ||
          comment.parent_id ||
          comment.hidden ||
          comment.from?.id === c.accountId ||
          comment.username === c.username ||
          !matches(comment.text, rule.keyword) ||
          !Number.isFinite(Date.parse(comment.timestamp)) ||
          Date.now() - Date.parse(comment.timestamp) > 6 * 86400000 ||
          Date.parse(comment.timestamp) < c.acceptSince.getTime()
        )
          throw new InstagramError(409, 'comment_ineligible');
        intent = 'comment';
        resultKind = 'private_reply';
      } else {
        if (
          !thread ||
          !thread.senderCipher ||
          thread.lastInboundAt.getTime() + 23 * 3600000 <= Date.now()
        )
          throw new InstagramError(409, 'reply_window_closed');
        if (job.kind === 'dm_auto') {
          if (
            thread.lastProcessedInboundAt &&
            payload.inboundAt &&
            thread.lastProcessedInboundAt > new Date(payload.inboundAt)
          )
            throw new InstagramError(409, 'out_of_order');
          if (!c.autoDm || thread.handedOff) throw new InstagramError(409, 'human_handoff');
          if (!withinBusinessHours(assistantConfig(c.assistantConfig).businessHours))
            throw new InstagramError(409, 'outside_business_hours');
          const page = await db.catalogPage.findUnique({
            where: {
              workspaceId_handle: { workspaceId: c.workspaceId, handle: c.username.toLowerCase() },
            },
          });
          if (!page) throw new InstagramError(409, 'catalog_required');
          const prior =
            thread.contextCipher &&
            thread.contextAt &&
            Date.now() - thread.contextAt.getTime() < 23 * 3600000
              ? dialogueState.parse(
                  JSON.parse(decrypt(thread.contextCipher, 'instagram-context:' + thread.id)),
                )
              : undefined;
          const plan = await planDmReply({
            workspaceId: c.workspaceId,
            pageId: page.id,
            text,
            settings: {
              tone: c.tone,
              shippingPolicy: c.shippingPolicy,
              shorthandMillions: c.shorthandMillions,
              aiEnabled: assistantConfig(c.assistantConfig).aiEnabled && directAiAvailable(),
              assistant: assistantConfig(c.assistantConfig),
            },
            state: prior,
            firstTurn: !prior,
            seed: parseInt(job.dedupeKey.slice(0, 8), 16) || 0,
            extractor: (text, categories) => extractDmNeed(text, categories, c.workspaceId),
          });
          await db.instagramJob.updateMany({
            where: { id: job.id, leaseToken: lease },
            data: {
              interpretation: plan.interpretation,
              aiAttempted: plan.aiAttempted,
              aiSucceeded: plan.aiSucceeded,
              budgetBucket: plan.budgetBucket,
            },
          });
          text = plan.reply;
          intent = plan.intent;
          resultKind = plan.resultKind;
          handedOff = plan.handedOff;
          state = encrypt(JSON.stringify(plan.state), 'instagram-context:' + thread.id);
        }
      }
      await db.instagramJob.updateMany({
        where: { id: job.id, leaseToken: lease },
        data: { intent, resultKind },
      });
      const latest = await db.instagramConnection.findUnique({
        where: { id: c.id },
        include: { workspace: { include: { owner: true } } },
      });
      if (
        !latest ||
        latest.status !== 'connected' ||
        latest.acceptSince.getTime() !== c.acceptSince.getTime() ||
        latest.workspace.paused ||
        latest.workspace.owner?.suspended ||
        (job.kind === 'dm_auto' && (!latest.autoDm || latest.settingsRevision !== job.revision)) ||
        job.expiresAt <= new Date() ||
        !customerSending() ||
        (await db.operationControl.findUnique({ where: { id: 'proof' } }))?.paused
      )
        throw new InstagramError(409, 'paused');
      if (
        job.kind === 'dm_auto' &&
        thread &&
        (
          await db.instagramThread.findUnique({
            where: { id: thread.id },
            select: { handedOff: true },
          })
        )?.handedOff
      )
        throw new InstagramError(409, 'human_handoff');
      if (
        job.kind === 'private_reply' &&
        !(await db.instagramAutomation.findFirst({
          where: {
            id: job.automationId!,
            workspaceId: job.workspaceId,
            revision: job.revision!,
            enabled: true,
          },
        }))
      )
        throw new InstagramError(409, 'settings_changed');
      if (handedOff && thread)
        await db.instagramThread.updateMany({
          where: { id: thread.id, leaseToken: lease },
          data: { handedOff: true },
        });
      const recipient = thread ? decrypt(thread.senderCipher, 'instagram-sender:' + thread.id) : '';
      dispatched = true;
      const outcome =
        job.kind === 'private_reply'
          ? await transport.privateReply(c.accountId, payload.commentId!, text, token)
          : await transport.dm(c.accountId, recipient, text, token);
      if (thread) {
        const id = directHash('message:' + c.accountId + ':' + outcome.messageId);
        await db.instagramMessage.upsert({
          where: { id },
          create: {
            id,
            workspaceId: c.workspaceId,
            threadId: thread.id,
            direction: 'outbound',
            source: 'api',
            textCipher: encrypt(text, 'instagram-message:' + id),
            intent,
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
          update: { source: 'api', intent },
        });
        await db.instagramThread.updateMany({
          where: { id: thread.id, leaseToken: lease },
          data: {
            lastMessageAt: new Date(),
            ...(state
              ? {
                  contextCipher: state,
                  contextAt: new Date(),
                  handedOff,
                  lastProcessedInboundAt: payload.inboundAt ? new Date(payload.inboundAt) : null,
                }
              : {}),
          },
        });
      }
      await db.instagramJob.updateMany({
        where: { id: job.id, leaseToken: lease },
        data: {
          messageId: outcome.messageId,
          responseMs: Math.min(2147483647, Math.max(0, Date.now() - job.createdAt.getTime())),
        },
      });
      await finish('accepted', null);
      processed++;
    } catch (e) {
      if (e instanceof MetaError && e.kind === 'token')
        await db.instagramConnection.updateMany({
          where: { id: job.connectionId },
          data: { status: 'expired', tokenCipher: '', autoDm: false, errorKind: 'token' },
        });
      if (e instanceof MetaError && e.kind === 'rate_limit' && job.attempts < 2)
        await finish('pending', 'rate_limit');
      else
        await finish(
          e instanceof InstagramError
            ? 'skipped'
            : dispatched && (!(e instanceof MetaError) || e.kind === 'unknown')
              ? 'unknown'
              : 'failed',
          e instanceof MetaError
            ? e.kind
            : e instanceof InstagramError
              ? e.code
              : dispatched
                ? 'result_unknown'
                : 'processing_failed',
        );
    } finally {
      if (job.threadId)
        await db.instagramThread.updateMany({
          where: { id: job.threadId, leaseToken: lease },
          data: { leaseToken: null, leaseUntil: null },
        });
    }
  }
  return processed;
}
