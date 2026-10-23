import { db } from './db';
import { decrypt } from './crypto';
import { instagramToken } from './instagram-connection';
import { metaAdapter } from './meta';
import { consumeAuthLimit } from './customer-auth';
import { InstagramError } from './instagram-connection';
import { provider } from './config';
import { assistantConfig, directAiAvailable } from './instagram-assistant';
import { instagramDmMetrics } from './instagram-metrics';
export const customerSending = () =>
  provider() === 'meta' && process.env.META_CUSTOMER_SEND_ENABLED === 'true';
export async function instagramMedia(workspaceId: string) {
  if (!(await consumeAuthLimit('instagram-media:' + workspaceId, 60, 10)).allowed)
    throw new InstagramError(429, 'wait');
  const { connection, token } = await instagramToken(workspaceId);
  return (await metaAdapter.media(connection.accountId, token))
    .filter((p) => /^\d+$/.test(p.id))
    .map((p) => ({
      id: p.id,
      caption: typeof p.caption === 'string' ? p.caption.slice(0, 2200) : '',
      media_type: p.media_type,
      media_product_type: p.media_product_type,
      permalink: p.permalink,
    }));
}
export async function instagramSnapshot(workspaceId: string) {
  const since = new Date(Date.now() - 7 * 86400000);
  const [connection, threads, jobs, automations, received, accepted, unknown, noMatch, dmMetrics] =
    await Promise.all([
      db.instagramConnection.findUnique({
        where: { workspaceId },
        select: {
          id: true,
          username: true,
          status: true,
          subscribed: true,
          expiresAt: true,
          issuedAt: true,
          errorKind: true,
          autoDm: true,
          tone: true,
          shippingPolicy: true,
          shorthandMillions: true,
          assistantConfig: true,
        },
      }),
      db.instagramThread.findMany({
        where: { workspaceId },
        orderBy: { lastMessageAt: 'desc' },
        take: 30,
        select: {
          id: true,
          lastInboundAt: true,
          lastMessageAt: true,
          handedOff: true,
          messages: {
            orderBy: { receivedAt: 'desc' },
            take: 1,
            select: { textCipher: true, id: true, expiresAt: true },
          },
        },
      }),
      db.instagramJob.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          kind: true,
          status: true,
          errorKind: true,
          intent: true,
          resultKind: true,
          interpretation: true,
          aiAttempted: true,
          aiSucceeded: true,
          budgetBucket: true,
          responseMs: true,
          attempts: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.instagramAutomation.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          mediaId: true,
          keyword: true,
          replyText: true,
          link: true,
          enabled: true,
        },
      }),
      db.instagramMessage.count({
        where: { workspaceId, direction: 'inbound', source: 'webhook', receivedAt: { gte: since } },
      }),
      db.instagramJob.count({
        where: { workspaceId, status: 'accepted', createdAt: { gte: since } },
      }),
      db.instagramJob.count({
        where: { workspaceId, status: 'unknown', createdAt: { gte: since } },
      }),
      db.instagramJob.count({
        where: { workspaceId, resultKind: 'no_match', createdAt: { gte: since } },
      }),
      instagramDmMetrics(workspaceId),
    ]);
  return {
    provider: 'meta',
    configured:
      Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET) &&
      provider() === 'meta',
    connection: connection
      ? {
          ...connection,
          assistantConfig: assistantConfig(connection.assistantConfig),
          status:
            connection.status === 'connected' && connection.expiresAt <= new Date()
              ? 'expired'
              : connection.status,
        }
      : null,
    threads: threads.map(({ messages, ...t }) => ({
      ...t,
      preview:
        messages[0]?.textCipher && messages[0].expiresAt > new Date()
          ? decrypt(messages[0].textCipher, 'instagram-message:' + messages[0].id).slice(0, 120)
          : 'متن پیام طبق سیاست نگهداری پاک شده است.',
      canReply: t.lastInboundAt.getTime() + 23 * 3600000 > Date.now(),
    })),
    jobs,
    automations,
    stats: { periodDays: 7, received, accepted, unknown, noMatch, orders: null, revenue: null },
    dmMetrics,
    sendingEnabled: customerSending(),
    accessMode: 'app_review_required_for_external_customers',
    history: 'official_recent_history_and_saved_webhooks',
    worker: 'webhook_after_with_durable_database_and_manual_recovery',
    ai: 'local_first_optional_groq_with_sender_consent',
    aiAvailable: directAiAvailable(),
  };
}
export async function instagramThreadMessages(workspaceId: string, id: string, before?: string) {
  const thread = await db.instagramThread.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      handedOff: true,
      lastInboundAt: true,
      contactUsername: true,
      starred: true,
      archived: true,
      historySyncedAt: true,
      remoteIdCipher: true,
      noteCipher: true,
    },
  });
  if (!thread) throw new InstagramError(404, 'not_found');
  if (
    before &&
    !(await db.instagramMessage.findFirst({
      where: { id: before, threadId: id, workspaceId },
      select: { id: true },
    }))
  )
    throw new InstagramError(404, 'not_found');
  const rows = await db.instagramMessage.findMany({
    where: { threadId: id, workspaceId },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: 61,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });
  return {
    thread: {
      id: thread.id,
      handedOff: thread.handedOff,
      lastInboundAt: thread.lastInboundAt,
      contactUsername: thread.contactUsername,
      starred: thread.starred,
      archived: thread.archived,
      historySyncedAt: thread.historySyncedAt,
      hasHistory: Boolean(thread.remoteIdCipher),
      canReply: thread.lastInboundAt.getTime() + 23 * 3600000 > Date.now(),
      note: thread.noteCipher ? decrypt(thread.noteCipher, 'instagram-note:' + thread.id) : '',
    },
    before: rows.length > 60 ? rows[59].id : null,
    messages: rows
      .slice(0, 60)
      .reverse()
      .map((m) => ({
        id: m.id,
        direction: m.direction,
        receivedAt: m.receivedAt,
        intent: m.intent,
        source: m.source,
        text:
          m.textCipher && m.expiresAt > new Date()
            ? decrypt(m.textCipher, 'instagram-message:' + m.id)
            : null,
      })),
  };
}
