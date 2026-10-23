import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import { saveInstagramGrant, disconnectInstagram } from '../src/lib/instagram-connection';
import {
  syncInstagramInbox,
  syncInstagramThread,
  instagramInbox,
} from '../src/lib/instagram-inbox';
import { instagramThreadMessages, instagramSnapshot } from '../src/lib/instagram-view';
import { directHash, ingestInstagram } from '../src/lib/instagram-jobs';
import { encrypt, decrypt } from '../src/lib/crypto';
import {
  listInstagramConversations,
  listInstagramConversationMessages,
  MetaError,
} from '../src/lib/meta';
if (new URL(process.env.DATABASE_URL!).pathname !== '/aidirect_test')
  throw Error('Isolated test DB required');
after(() => db.$disconnect());
let seq = 0;
async function fixture(
  run: (c: Awaited<ReturnType<typeof saveInstagramGrant>>, other: string) => Promise<void>,
) {
  const root = 'inbox-fixture-' + process.pid + '-' + ++seq,
    other = root + '-other';
  await db.workspace.createMany({
    data: [
      { id: root, name: 'A' },
      { id: other, name: 'B' },
    ],
  });
  try {
    const c = await saveInstagramGrant(
      root,
      { accountId: '960' + process.pid + seq, username: 'inbox_fixture' },
      { accessToken: 'synthetic-inbox-token', expiresIn: 60 * 86400 },
    );
    await db.instagramConnection.update({
      where: { id: c.id },
      data: { autoDm: true, subscribed: true, acceptSince: new Date(Date.now() - 24 * 3600000) },
    });
    await run(c, other);
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: [root, other] } } });
  }
}
function mock(c: Awaited<ReturnType<typeof saveInstagramGrant>>) {
  const peer = '88001',
    at = new Date(Date.now() - 3600000).toISOString(),
    remote = 'opaque:conversation==';
  const m = (i: number) => ({
    id: 'opaque-message-' + i,
    created_time: new Date(Date.parse(at) - i * 1000).toISOString(),
    from: { id: i % 2 === 0 ? peer : c.accountId },
    to: { data: [{ id: i % 2 === 0 ? c.accountId : peer }] },
    message: 'پیام ساختگی ' + i,
  });
  const conv = {
    id: remote,
    updated_time: at,
    participants: {
      data: [
        { id: c.accountId, username: c.username },
        { id: peer, username: 'test_contact' },
      ],
    },
    messages: { data: [m(0)] },
  };
  return {
    peer,
    at,
    remote,
    m,
    conv,
    api: {
      conversations: async () => ({ data: [conv], paging: undefined }),
      conversation: async () => conv,
      messages: async () => ({
        id: remote,
        messages: { data: Array.from({ length: 25 }, (_, i) => m(i)) },
      }),
    },
  };
}
test('History indexing and latest-20 import are encrypted, tenant bound, idempotent and never enqueue replies', async () =>
  fixture(async (c, other) => {
    const x = mock(c);
    const indexed = await syncInstagramInbox(c.workspaceId, false, x.api);
    assert.equal(indexed.indexed, 1);
    const tid = directHash('thread:' + c.accountId + ':' + x.peer);
    const thread = await db.instagramThread.findUniqueOrThrow({ where: { id: tid } });
    assert.equal(thread.contactUsername, 'test_contact');
    assert.equal(decrypt(thread.remoteIdCipher!, 'instagram-conversation:' + tid), x.remote);
    assert.ok(!thread.remoteIdCipher!.includes(x.remote));
    const result = await syncInstagramThread(c.workspaceId, tid, x.api);
    assert.equal(result.imported, 20);
    assert.equal(await db.instagramMessage.count({ where: { threadId: tid } }), 20);
    await syncInstagramThread(c.workspaceId, tid, x.api);
    assert.equal(await db.instagramMessage.count({ where: { threadId: tid } }), 20);
    assert.equal(await db.instagramJob.count({ where: { workspaceId: c.workspaceId } }), 0);
    assert.equal((await instagramSnapshot(c.workspaceId)).stats.received, 0);
    const messages = await instagramThreadMessages(c.workspaceId, tid);
    assert.equal(messages.messages.length, 20);
    assert.equal(messages.thread.canReply, true);
    assert.ok(!JSON.stringify(messages).includes(x.remote));
    assert.ok(!JSON.stringify(messages).includes('synthetic-inbox-token'));
    await assert.rejects(() => instagramThreadMessages(other, tid), { code: 'not_found' });
    await disconnectInstagram(c.workspaceId);
    const cleared = await db.instagramThread.findUniqueOrThrow({ where: { id: tid } });
    assert.equal(cleared.remoteIdCipher, null);
    assert.equal(cleared.contactUsername, null);
    assert.equal(
      await db.instagramMessage.count({ where: { threadId: tid, textCipher: { not: null } } }),
      0,
    );
  }));
test('A real webhook arriving after history import is promoted once and keeps automatic reply deduplication', async () =>
  fixture(async (c) => {
    const oldAdapter = process.env.META_ADAPTER,
      oldSend = process.env.META_CUSTOMER_SEND_ENABLED;
    process.env.META_ADAPTER = 'meta';
    process.env.META_CUSTOMER_SEND_ENABLED = 'true';
    try {
      const x = mock(c);
      await syncInstagramInbox(c.workspaceId, false, x.api);
      const payload = {
        object: 'instagram',
        entry: [
          {
            id: c.accountId,
            messaging: [
              {
                sender: { id: x.peer },
                recipient: { id: c.accountId },
                timestamp: Date.parse(x.at),
                message: { mid: x.m(0).id, text: 'سلام' },
              },
            ],
          },
        ],
      };
      await ingestInstagram(payload);
      await ingestInstagram(payload);
      assert.equal(await db.instagramJob.count({ where: { workspaceId: c.workspaceId } }), 1);
      assert.equal(
        await db.instagramMessage.count({
          where: { workspaceId: c.workspaceId, source: 'webhook', direction: 'inbound' },
        }),
        1,
      );
    } finally {
      if (oldAdapter === undefined) delete process.env.META_ADAPTER;
      else process.env.META_ADAPTER = oldAdapter;
      if (oldSend === undefined) delete process.env.META_CUSTOMER_SEND_ENABLED;
      else process.env.META_CUSTOMER_SEND_ENABLED = oldSend;
    }
  }));
test('Unrelated participants and foreign message directions abort history writes; old timestamps never open a fresh response window', async () =>
  fixture(async (c, other) => {
    const x = mock(c);
    await assert.rejects(
      () =>
        syncInstagramInbox(c.workspaceId, false, {
          ...x.api,
          conversations: async () => ({
            data: [{ ...x.conv, participants: { data: [{ id: '77001' }, { id: '77002' }] } }],
            paging: undefined,
          }),
        }),
      { code: 'invalid_history' },
    );
    assert.equal(await db.instagramThread.count({ where: { workspaceId: c.workspaceId } }), 0);
    await syncInstagramInbox(c.workspaceId, false, x.api);
    const tid = directHash('thread:' + c.accountId + ':' + x.peer);
    await assert.rejects(
      () =>
        syncInstagramThread(c.workspaceId, tid, {
          ...x.api,
          messages: async () => ({
            id: x.remote,
            messages: { data: [{ ...x.m(0), from: { id: '77001' } }] },
          }),
        }),
      { code: 'invalid_history' },
    );
    await assert.rejects(() => syncInstagramThread(other, tid, x.api), {
      code: 'connection_required',
    });
    const old = new Date(Date.now() - 10 * 86400000).toISOString();
    await db.instagramThread.update({
      where: { id: tid },
      data: { lastInboundAt: new Date(0), senderCipher: '' },
    });
    await syncInstagramThread(c.workspaceId, tid, {
      ...x.api,
      messages: async () => ({
        id: x.remote,
        messages: { data: [{ ...x.m(0), id: 'old-only-message', created_time: old }] },
      }),
    });
    assert.equal((await instagramThreadMessages(c.workspaceId, tid)).thread.canReply, false);
  }));
test('Inbox cursors, username search, local unread/star/archive flags and message pagination stay inside the workspace', async () =>
  fixture(async (c, other) => {
    const now = Date.now();
    await db.instagramThread.createMany({
      data: Array.from({ length: 35 }, (_, i) => ({
        id: 'inbox-page-' + c.id + '-' + i,
        workspaceId: c.workspaceId,
        connectionId: c.id,
        senderCipher: encrypt('88001', 'instagram-sender:unused'),
        contactUsername: 'test_' + i,
        lastInboundAt: new Date(now - i * 1000),
        lastMessageAt: new Date(now - i * 1000),
        starred: i === 0,
        archived: false,
      })),
    });
    const first = await instagramInbox(c.workspaceId, {});
    assert.equal(first.threads.length, 30);
    assert.equal(first.total, 35);
    assert.equal(first.unreadCount, 35);
    const next = await instagramInbox(c.workspaceId, { cursor: first.nextCursor! });
    assert.equal(next.threads.length, 5);
    assert.equal(new Set([...first.threads, ...next.threads].map((t) => t.id)).size, 35);
    await assert.rejects(() => instagramInbox(other, { cursor: first.nextCursor! }), {
      code: 'not_found',
    });
    assert.equal(
      (await instagramInbox(c.workspaceId, { q: '@TEST_0', filter: 'starred' })).threads.length,
      1,
    );
    const tid = first.threads[0].id;
    await db.instagramThread.update({
      where: { id: tid },
      data: {
        lastReadAt: new Date(),
        archived: true,
        noteCipher: encrypt('یادداشت ساختگی', 'instagram-note:' + tid),
      },
    });
    assert.equal((await instagramInbox(c.workspaceId, { filter: 'archived' })).threads.length, 1);
    assert.equal((await instagramInbox(c.workspaceId, { filter: 'unread' })).unreadCount, 34);
    await db.instagramMessage.createMany({
      data: Array.from({ length: 70 }, (_, i) => ({
        id: 'inbox-msg-' + c.id + '-' + i,
        workspaceId: c.workspaceId,
        threadId: tid,
        direction: 'inbound',
        receivedAt: new Date(now - i * 1000),
        expiresAt: new Date(now + 86400000),
      })),
    });
    const a = await instagramThreadMessages(c.workspaceId, tid);
    assert.equal(a.messages.length, 60);
    assert.equal(a.thread.note, 'یادداشت ساختگی');
    const b = await instagramThreadMessages(c.workspaceId, tid, a.before!);
    assert.equal(b.messages.length, 10);
    assert.equal(new Set([...a.messages, ...b.messages].map((m) => m.id)).size, 70);
    await assert.rejects(() => instagramThreadMessages(c.workspaceId, tid, 'unknown-cursor'), {
      code: 'not_found',
    });
  }));
test('History transport pins host and bearer header, encodes opaque IDs, bounds details and never follows paging URLs', async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      const u = new URL(String(url));
      assert.equal(u.hostname, 'graph.instagram.com');
      assert.equal(u.searchParams.has('access_token'), false);
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        'Bearer fixture-history-token',
      );
      assert.equal(init?.redirect, 'error');
      if (calls === 1)
        return Response.json({
          data: [],
          paging: {
            cursors: { after: 'safe-cursor' },
            next: 'https://untrusted.example/?access_token=not-real',
          },
        });
      assert.ok(u.pathname.includes('opaque%2Fconversation%2B%3D'));
      return Response.json({
        id: 'opaque/conversation+=',
        messages: {
          data: Array.from({ length: 25 }, (_, i) => ({
            id: 'opaque-message-' + i,
            created_time: new Date(Date.now() - i * 1000).toISOString(),
            from: { id: '11' },
            to: { data: [{ id: '22' }] },
            message: 'ساختگی',
          })),
        },
      });
    };
    const page = await listInstagramConversations('11', 'fixture-history-token');
    assert.equal(page.paging?.cursors?.after, 'safe-cursor');
    const result = await listInstagramConversationMessages(
      'opaque/conversation+=',
      'fixture-history-token',
    );
    assert.equal(result.messages.data.length, 20);
    assert.equal(calls, 2);
    await assert.rejects(() => listInstagramConversationMessages('..', 'fixture-history-token'));
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('Disconnect during a history request prevents stale completion from restoring private contacts', async () =>
  fixture(async (c) => {
    const x = mock(c);
    await assert.rejects(
      () =>
        syncInstagramInbox(c.workspaceId, false, {
          ...x.api,
          conversations: async () => {
            await disconnectInstagram(c.workspaceId);
            return x.api.conversations();
          },
        }),
      { code: 'connection_changed' },
    );
    assert.equal(await db.instagramThread.count({ where: { workspaceId: c.workspaceId } }), 0);
    const connection = await db.instagramConnection.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(connection.tokenCipher, '');
    assert.equal(connection.historyCursorCipher, null);
    assert.equal(connection.historyLeaseToken, null);
  }));
