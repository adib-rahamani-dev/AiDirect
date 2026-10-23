import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { encrypt, decrypt } from './crypto';
import { directHash } from './instagram-ids';
import { instagramToken, InstagramError } from './instagram-connection';
import {
  listInstagramConversations,
  getInstagramConversation,
  listInstagramConversationMessages,
  getInstagramHistoryMessage,
} from './meta';
import { consumeAuthLimit } from './customer-auth';
import type { Prisma } from '../generated/prisma/client';

const transport = {
  conversations: listInstagramConversations,
  conversation: getInstagramConversation,
  messages: listInstagramConversationMessages,
};
const epoch = new Date(0);
const validDate = (value: string) => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()) || d.getTime() <= 0 || d.getTime() > Date.now() + 60000)
    throw new InstagramError(502, 'invalid_history');
  return d;
};
const contact = (value?: string) => (value && /^[A-Za-z0-9._]{1,100}$/.test(value) ? value : null);
type HistoryMessage = Awaited<ReturnType<typeof getInstagramHistoryMessage>>;
function checkedHistory(accountId: string, peer: string, m: HistoryMessage) {
  const incoming = m.from.id === peer && m.to.data.some((p) => p.id === accountId);
  const outgoing = m.from.id === accountId && m.to.data.some((p) => p.id === peer);
  if (!incoming && !outgoing) throw new InstagramError(502, 'invalid_history');
  return { m, at: validDate(m.created_time), direction: incoming ? 'inbound' : 'outbound' };
}
async function storeHistorical(
  tx: Prisma.TransactionClient,
  c: { id: string; workspaceId: string; accountId: string },
  threadId: string,
  record: ReturnType<typeof checkedHistory>,
) {
  const { m, at, direction } = record,
    { workspaceId } = c;
  const legacy =
    direction === 'outbound'
      ? await tx.instagramJob.findFirst({
          where: { workspaceId, connectionId: c.id, messageId: m.id, status: 'accepted' },
          select: { id: true },
        })
      : null;
  const legacyId = legacy ? directHash('outbound:' + legacy.id) : null;
  if (legacyId && (await tx.instagramMessage.findUnique({ where: { id: legacyId } }))) return;
  const id = directHash('message:' + c.accountId + ':' + m.id);
  const text =
    m.message?.trim().slice(0, 10000) ||
    'پیام رسانه‌ای یا رویداد؛ متن آن از این API دریافت نشده است.';
  const old = await tx.instagramMessage.findUnique({
    where: { id },
    select: { expiresAt: true, workspaceId: true, threadId: true },
  });
  if (old && (old.workspaceId !== workspaceId || old.threadId !== threadId))
    throw new InstagramError(502, 'invalid_history');
  if (!old)
    await tx.instagramMessage.create({
      data: {
        id,
        workspaceId,
        threadId,
        direction,
        source: 'history',
        textCipher: encrypt(text, 'instagram-message:' + id),
        receivedAt: at,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
  else if (old.expiresAt <= new Date())
    await tx.instagramMessage.update({
      where: { id },
      data: {
        textCipher: encrypt(text, 'instagram-message:' + id),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
  if (direction === 'inbound')
    await tx.instagramThread.updateMany({
      where: { id: threadId, workspaceId, lastInboundAt: { lt: at } },
      data: { lastInboundAt: at },
    });
  await tx.instagramThread.updateMany({
    where: { id: threadId, workspaceId, lastMessageAt: { lt: at } },
    data: { lastMessageAt: at },
  });
}

/** Explicit, bounded read from Meta. It never enters the incoming-message automation pipeline. */
export async function syncInstagramInbox(workspaceId: string, restart = false, api = transport) {
  if (!(await consumeAuthLimit('instagram-history-page:' + workspaceId, 60, 4)).allowed)
    throw new InstagramError(429, 'wait');
  const { connection: c, token } = await instagramToken(workspaceId),
    lease = randomUUID();
  const claimed = await db.instagramConnection.updateMany({
    where: {
      id: c.id,
      status: 'connected',
      acceptSince: c.acceptSince,
      historyCursorCipher: c.historyCursorCipher,
      historySyncedAt: c.historySyncedAt,
      OR: [{ historyLeaseUntil: null }, { historyLeaseUntil: { lt: new Date() } }],
    },
    data: { historyLeaseToken: lease, historyLeaseUntil: new Date(Date.now() + 60000) },
  });
  if (!claimed.count) throw new InstagramError(409, 'history_busy');
  try {
    const cursor =
      !restart && c.historyCursorCipher
        ? decrypt(c.historyCursorCipher, 'instagram-history-cursor:' + c.id)
        : undefined;
    if (!restart && !c.historyHasMore && c.historySyncedAt) return { indexed: 0, hasMore: false };
    const page = await api.conversations(c.accountId, token, cursor);
    const records = page.data.slice(0, 10).map((item) => {
      const info = item;
      if (
        info.id !== item.id ||
        info.participants.data.length !== 2 ||
        !info.participants.data.some((p) => p.id === c.accountId)
      )
        throw new InstagramError(502, 'invalid_history');
      const peer = info.participants.data.find((p) => p.id !== c.accountId)!;
      return {
        id: directHash('thread:' + c.accountId + ':' + peer.id),
        peer,
        remote: item.id,
        at: validDate(info.updated_time),
        preview: info.messages?.data[0]
          ? checkedHistory(c.accountId, peer.id, info.messages.data[0])
          : null,
      };
    });
    const next = page.paging?.next ? page.paging?.cursors?.after : undefined;
    if (page.paging?.next && !next) throw new InstagramError(502, 'invalid_history');
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "InstagramConnection" WHERE id=${c.id} FOR UPDATE`;
        const active = await tx.instagramConnection.findFirst({
          where: {
            id: c.id,
            workspaceId,
            status: 'connected',
            historyLeaseToken: lease,
            acceptSince: c.acceptSince,
            historyLeaseUntil: { gt: new Date() },
          },
        });
        if (!active) throw new InstagramError(409, 'connection_changed');
        for (const r of records) {
          const old = await tx.instagramThread.findUnique({
            where: { id: r.id },
            select: { lastMessageAt: true },
          });
          await tx.instagramThread.upsert({
            where: { id: r.id },
            create: {
              id: r.id,
              workspaceId,
              connectionId: c.id,
              senderCipher: encrypt(r.peer.id, 'instagram-sender:' + r.id),
              contactUsername: contact(r.peer.username),
              remoteIdCipher: encrypt(r.remote, 'instagram-conversation:' + r.id),
              lastInboundAt: epoch,
              lastMessageAt: r.at,
              lastReadAt: new Date(),
            },
            update: {
              contactUsername: contact(r.peer.username),
              remoteIdCipher: encrypt(r.remote, 'instagram-conversation:' + r.id),
              ...(old && old.lastMessageAt < r.at ? { lastMessageAt: r.at } : {}),
            },
          });
          if (r.preview) await storeHistorical(tx, c, r.id, r.preview);
        }
        await tx.instagramConnection.update({
          where: { id: c.id },
          data: {
            historyCursorCipher: next ? encrypt(next, 'instagram-history-cursor:' + c.id) : null,
            historyHasMore: Boolean(next),
            historySyncedAt: new Date(),
          },
        });
      },
      { timeout: process.env.NODE_ENV === 'test' ? 60000 : 15000 },
    );
    return { indexed: records.length, hasMore: Boolean(next) };
  } finally {
    await db.instagramConnection.updateMany({
      where: { id: c.id, historyLeaseToken: lease },
      data: { historyLeaseToken: null, historyLeaseUntil: null },
    });
  }
}

export async function syncInstagramThread(workspaceId: string, threadId: string, api = transport) {
  if (!(await consumeAuthLimit('instagram-history-thread:' + workspaceId, 60, 3)).allowed)
    throw new InstagramError(429, 'wait');
  const { connection: c, token } = await instagramToken(workspaceId);
  const thread = await db.instagramThread.findFirst({
    where: { id: threadId, workspaceId, connectionId: c.id },
  });
  if (!thread) throw new InstagramError(404, 'not_found');
  if (!thread.remoteIdCipher) throw new InstagramError(409, 'history_index_required');
  const remote = decrypt(thread.remoteIdCipher, 'instagram-conversation:' + thread.id);
  const list = await api.messages(remote, token);
  if (list.id !== remote) throw new InstagramError(502, 'invalid_history');
  // Meta permits details for only the latest 20 IDs. Never fetch paging.next with a token in it.
  const ids = [...list.messages.data]
    .sort((a, b) => Date.parse(b.created_time) - Date.parse(a.created_time))
    .slice(0, 20);
  let peer: string;
  if (thread.senderCipher) peer = decrypt(thread.senderCipher, 'instagram-sender:' + thread.id);
  else {
    const info = await api.conversation(remote, token);
    if (
      info.id !== remote ||
      info.participants.data.length !== 2 ||
      !info.participants.data.some((p) => p.id === c.accountId)
    )
      throw new InstagramError(502, 'invalid_history');
    peer = info.participants.data.find((p) => p.id !== c.accountId)!.id;
    if (directHash('thread:' + c.accountId + ':' + peer) !== threadId)
      throw new InstagramError(502, 'invalid_history');
  }
  const details = ids.map((m) => checkedHistory(c.accountId, peer, m));
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InstagramConnection" WHERE id=${c.id} FOR UPDATE`;
      const active = await tx.instagramConnection.findFirst({
        where: { id: c.id, workspaceId, status: 'connected', acceptSince: c.acceptSince },
      });
      if (!active) throw new InstagramError(409, 'connection_changed');
      for (const record of details) await storeHistorical(tx, c, threadId, record);
      await tx.instagramThread.updateMany({
        where: { id: threadId, workspaceId },
        data: {
          historySyncedAt: new Date(),
          senderCipher: encrypt(peer, 'instagram-sender:' + thread.id),
        },
      });
    },
    { timeout: process.env.NODE_ENV === 'test' ? 60000 : 15000 },
  );
  return { imported: details.length, providerDetailLimit: 20 };
}

export const inboxQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
  filter: z.enum(['all', 'unread', 'starred', 'human', 'archived', 'closed']).default('all'),
  cursor: z.string().max(100).optional(),
});
export async function instagramInbox(workspaceId: string, input: z.input<typeof inboxQuerySchema>) {
  if (!(await consumeAuthLimit('instagram-inbox-read:' + workspaceId, 60, 120)).allowed)
    throw new InstagramError(429, 'wait');
  const query = inboxQuerySchema.parse(input);
  const unread: Prisma.InstagramThreadWhereInput = {
    OR: [
      { lastReadAt: null, lastInboundAt: { gt: epoch } },
      { lastInboundAt: { gt: db.instagramThread.fields.lastReadAt } },
    ],
  };
  const where: Prisma.InstagramThreadWhereInput = {
    workspaceId,
    archived: query.filter === 'archived',
    ...(query.q
      ? { contactUsername: { contains: query.q.replace(/^@/, ''), mode: 'insensitive' } }
      : {}),
    ...(query.filter === 'starred' ? { starred: true } : {}),
    ...(query.filter === 'human' ? { handedOff: true } : {}),
    ...(query.filter === 'closed'
      ? { lastInboundAt: { lt: new Date(Date.now() - 23 * 3600000) } }
      : {}),
    ...(query.filter === 'unread' ? unread : {}),
  };
  if (
    query.cursor &&
    !(await db.instagramThread.findFirst({
      where: { id: query.cursor, workspaceId },
      select: { id: true },
    }))
  )
    throw new InstagramError(404, 'not_found');
  const [rows, total, unreadCount, connection] = await Promise.all([
    db.instagramThread.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: 31,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        contactUsername: true,
        starred: true,
        archived: true,
        handedOff: true,
        lastReadAt: true,
        lastInboundAt: true,
        lastMessageAt: true,
        historySyncedAt: true,
        remoteIdCipher: true,
        messages: {
          orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { id: true, textCipher: true, expiresAt: true, intent: true },
        },
      },
    }),
    db.instagramThread.count({ where: { workspaceId, archived: false } }),
    db.instagramThread.count({ where: { workspaceId, archived: false, ...unread } }),
    db.instagramConnection.findUnique({
      where: { workspaceId },
      select: { status: true, username: true, historyHasMore: true, historySyncedAt: true },
    }),
  ]);
  return {
    threads: rows.slice(0, 30).map(({ messages, remoteIdCipher, ...t }) => ({
      ...t,
      hasHistory: Boolean(remoteIdCipher),
      unread: t.lastInboundAt > epoch && (!t.lastReadAt || t.lastInboundAt > t.lastReadAt),
      canReply: t.lastInboundAt.getTime() + 23 * 3600000 > Date.now(),
      intent: messages[0]?.intent ?? 'unclassified',
      preview:
        messages[0]?.textCipher && messages[0].expiresAt > new Date()
          ? decrypt(messages[0].textCipher, 'instagram-message:' + messages[0].id).slice(0, 140)
          : t.historySyncedAt
            ? 'متن ذخیره‌شده در دسترس نیست.'
            : 'برای دیدن پیام‌ها، تاریخچه را بارگیری کن.',
    })),
    nextCursor: rows.length > 30 ? rows[29].id : null,
    total,
    unreadCount,
    connection,
    limits: { historyDetails: 20, retentionDays: 7 },
    source: 'meta_and_saved_webhooks',
  };
}
