import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import { saveInstagramGrant, disconnectInstagram } from '../src/lib/instagram-connection';
import { ingestInstagram, tickInstagram, enqueueManualReply } from '../src/lib/instagram-jobs';
import { storeInstagramWebhook, drainInstagramWebhook } from '../src/lib/instagram-webhook';
import { instagramSnapshot, instagramThreadMessages } from '../src/lib/instagram-view';
import { decrypt } from '../src/lib/crypto';
import { MetaError, subscribeInstagramInbox, sendInstagramMessage } from '../src/lib/meta';
import { assistantConfigSchema, assistantConfig } from '../src/lib/instagram-assistant';
import { instagramDmMetrics } from '../src/lib/instagram-metrics';
if (new URL(process.env.DATABASE_URL!).pathname !== '/aidirect_test')
  throw Error('Isolated DB required');
after(() => db.$disconnect());
let serial = 0;
let sentSequence = 0;
async function fixture(
  run: (a: Awaited<ReturnType<typeof saveInstagramGrant>>, b: string) => Promise<void>,
) {
  const root = 'instagram-fixture-' + process.pid + '-' + ++serial,
    a = root + '-a',
    b = root + '-b';
  const previous = {
    adapter: process.env.META_ADAPTER,
    sending: process.env.META_CUSTOMER_SEND_ENABLED,
  };
  process.env.META_ADAPTER = 'meta';
  process.env.META_CUSTOMER_SEND_ENABLED = 'true';
  await db.workspace.createMany({
    data: [
      { id: a, name: 'A' },
      { id: b, name: 'B' },
    ],
  });
  try {
    const c = await saveInstagramGrant(
      a,
      {
        accountId: '830' + process.pid + serial,
        appScopedId: '840' + process.pid + serial,
        username: 'fixture_' + serial,
      },
      { accessToken: 'synthetic-private-token', expiresIn: 60 * 86400 },
    );
    await db.instagramConnection.update({
      where: { id: c.id },
      data: { acceptSince: new Date(Date.now() - 3000), subscribed: true, autoDm: true },
    });
    await run(c, b);
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: [a, b] } } });
    process.env.META_ADAPTER = previous.adapter;
    process.env.META_CUSTOMER_SEND_ENABLED = previous.sending;
  }
}
const dm = (account: string, mid: string, text: string, sender = '79991') => ({
  object: 'instagram',
  entry: [
    {
      id: account,
      messaging: [
        {
          sender: { id: sender },
          recipient: { id: account },
          timestamp: Date.now(),
          message: { mid, text },
        },
      ],
    },
  ],
});

test('Assistant settings require explicit privacy acknowledgement and distinct normalized FAQ triggers', () => {
  assert.equal(assistantConfig(null).aiEnabled, false);
  assert.equal(assistantConfigSchema.safeParse({ aiEnabled: true }).success, false);
  assert.equal(
    assistantConfigSchema.safeParse({
      faqs: [
        { keyword: 'کفش', answer: 'الف' },
        { keyword: 'كفش', answer: 'ب' },
      ],
    }).success,
    false,
  );
  assert.equal(
    assistantConfigSchema.safeParse({ faqs: [{ keyword: 'آدرس', answer: '' }] }).success,
    false,
  );
  assert.equal(
    assistantConfigSchema.safeParse({ aiEnabled: true, privacyAcknowledged: true }).success,
    true,
  );
});

test('Direct assistant answers approved FAQ locally and hands off before any FAQ or model answer', async () =>
  fixture(async (c) => {
    await db.instagramConnection.update({
      where: { id: c.id },
      data: {
        assistantConfig: assistantConfigSchema.parse({
          brandName: 'آبان',
          welcomeText: 'خوش آمدی به آبان',
          faqs: [{ keyword: 'آدرس', answer: 'آدرس ثبت‌شدهٔ فروشگاه' }],
        }),
      },
    });
    let replies: string[] = [];
    for (const [mid, text] of [
      ['hello', 'سلام'],
      ['faq', 'آدرس فروشگاه کجاست؟'],
      ['human', 'آدرس را از اپراتور بپرسم'],
    ]) {
      await ingestInstagram(dm(c.accountId, mid, text));
      await unthrottle(c.id);
      await tickInstagram(
        c.workspaceId,
        transport((text) => {
          replies.push(text);
        }),
      );
    }
    assert.match(replies[0], /دستیار خودکار آبان/);
    assert.match(replies[0], /خوش آمدی به آبان/);
    assert.equal(replies[1], 'آدرس ثبت‌شدهٔ فروشگاه');
    assert.match(replies[2], /متوقف/);
    const metrics = await instagramDmMetrics(c.workspaceId);
    assert.equal(metrics.analyzed, 3);
    assert.equal(metrics.withoutAiPercent, 100);
    assert.equal(metrics.handoffs, 1);
    assert.equal((await instagramDmMetrics('foreign-workspace')).analyzed, 0);
  }));

test('Direct Meta model extraction needs store opt-in and sender consent and reports bounded, minimized use', async () =>
  fixture(async (c) => {
    const oldFetch = globalThis.fetch,
      oldKey = process.env.GROQ_API_KEY,
      oldDisabled = process.env.META_DM_AI_DISABLED;
    process.env.GROQ_API_KEY = 'fixture-direct-ai-key';
    delete process.env.META_DM_AI_DISABLED;
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://api.groq.com/openai/v1/chat/completions');
      const body = String(init?.body);
      for (const privateValue of ['test@example.com', '79991', c.accountId, c.workspaceId])
        assert.ok(!body.includes(privateValue));
      return Response.json({
        id: 'fixture',
        object: 'chat.completion',
        created: 1,
        model: 'openai/gpt-oss-20b',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                intent: 'recommendation',
                categoryIndex: null,
                confidence: 'high',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    };
    try {
      let reply = '';
      await db.instagramConnection.update({
        where: { id: c.id },
        data: {
          assistantConfig: assistantConfigSchema.parse({
            aiEnabled: true,
            privacyAcknowledged: true,
          }),
        },
      });
      await ingestInstagram(
        dm(c.accountId, 'before-consent', 'برای عکاسی در نور کم test@example.com'),
      );
      await tickInstagram(
        c.workspaceId,
        transport((t) => {
          reply = t;
        }),
      );
      assert.equal(calls, 0);
      assert.match(reply, /Groq/);
      await ingestInstagram(dm(c.accountId, 'consent', 'موافقم'));
      await unthrottle(c.id);
      await tickInstagram(
        c.workspaceId,
        transport((t) => {
          reply = t;
        }),
      );
      assert.equal(calls, 1);
      assert.match(reply, /بودجه/);
      const metrics = await instagramDmMetrics(c.workspaceId);
      assert.equal(metrics.aiAttempted, 1);
      assert.equal(metrics.aiSucceeded, 1);
      assert.equal(metrics.withoutAiPercent, 50);
      assert.equal(metrics.orders, null);
      assert.equal(metrics.revenue, null);
      assert.equal(metrics.conversionRate, null);
    } finally {
      globalThis.fetch = oldFetch;
      if (oldKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = oldKey;
      if (oldDisabled === undefined) delete process.env.META_DM_AI_DISABLED;
      else process.env.META_DM_AI_DISABLED = oldDisabled;
    }
  }));
test('Cancelled OAuth exchange cannot reconnect; disconnected pages reject fresh ingress', async () =>
  fixture(async (c) => {
    await disconnectInstagram(c.workspaceId);
    await assert.rejects(
      () =>
        saveInstagramGrant(
          c.workspaceId,
          { accountId: c.accountId, username: c.username },
          { accessToken: 'synthetic-private-token', expiresIn: 86400 },
          { stateHash: 'cancelled-guard', userId: 'fixture' },
        ),
      { code: 'oauth_cancelled' },
    );
    assert.equal(await ingestInstagram(dm(c.accountId, 'after-disconnect', 'سلام')), 0);
    assert.equal(await storeInstagramWebhook(dm(c.accountId, 'after-disconnect', 'سلام')), 0);
    assert.equal(
      (await db.instagramConnection.findUniqueOrThrow({ where: { id: c.id } })).status,
      'disconnected',
    );
  }));
test('Automatic DM shares the daily workspace job cap with manual and comment responses', async () =>
  fixture(async (c) => {
    await db.instagramJob.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        workspaceId: c.workspaceId,
        connectionId: c.id,
        dedupeKey: c.id + ':limit:' + i,
        kind: 'private_reply',
        status: 'failed',
        expiresAt: new Date(Date.now() + 86400000),
      })),
    });
    await ingestInstagram(dm(c.accountId, 'over-limit', 'سلام'));
    assert.equal(
      await db.instagramMessage.count({
        where: { workspaceId: c.workspaceId, direction: 'inbound' },
      }),
      1,
    );
    assert.equal(await db.instagramJob.count({ where: { workspaceId: c.workspaceId } }), 100);
  }));
const transport = (reply: (text: string) => Promise<void> | void) => ({
  dm: async (account: string, sender: string, text: string) => {
    assert.match(account, /^\d+$/);
    assert.match(sender, /^\d+$/);
    await reply(text);
    return { messageId: 'accepted-fixture-' + ++sentSequence };
  },
  privateReply: async () => ({ messageId: 'accepted-private-fixture' }),
});
async function unthrottle(connectionId: string) {
  await db.instagramConnection.update({
    where: { id: connectionId },
    data: { nextSendAt: new Date(0) },
  });
}

test('Direct Meta grant binds encryption and account ownership to one workspace; disconnect clears private data', async () =>
  fixture(async (c, b) => {
    assert.equal(
      decrypt(c.tokenCipher, `instagram-token:${c.workspaceId}:${c.accountId}`),
      'synthetic-private-token',
    );
    assert.throws(() => decrypt(c.tokenCipher, `instagram-token:${b}:${c.accountId}`));
    await assert.rejects(
      () =>
        saveInstagramGrant(
          b,
          { accountId: c.accountId, username: 'wrong' },
          { accessToken: 'x', expiresIn: 3600 },
        ),
      { code: 'page_already_connected' },
    );
    await ingestInstagram(dm(c.accountId, 'private-mid', 'سلام'));
    const thread = await db.instagramThread.findFirstOrThrow({
      where: { workspaceId: c.workspaceId },
    });
    await assert.rejects(() => instagramThreadMessages(b, thread.id), { code: 'not_found' });
    await assert.rejects(() =>
      db.instagramMessage.create({
        data: {
          id: 'forged-' + serial,
          workspaceId: b,
          threadId: thread.id,
          direction: 'inbound',
          expiresAt: new Date(),
        },
      }),
    );
    const snapshot = await instagramSnapshot(c.workspaceId);
    assert.ok(!JSON.stringify(snapshot).includes('synthetic-private-token'));
    assert.ok(!JSON.stringify(snapshot).includes('senderCipher'));
    assert.equal(
      (await instagramThreadMessages(c.workspaceId, thread.id)).messages[0].text,
      'سلام',
    );
    await disconnectInstagram(c.workspaceId);
    assert.equal(
      (await db.instagramConnection.findUniqueOrThrow({ where: { id: c.id } })).tokenCipher,
      '',
    );
    assert.equal(
      (await db.instagramThread.findUniqueOrThrow({ where: { id: thread.id } })).senderCipher,
      '',
    );
    assert.equal(
      await db.instagramMessage.count({
        where: { workspaceId: c.workspaceId, textCipher: { not: null } },
      }),
      0,
    );
  }));

test('Direct Meta durable ingress deduplicates signed envelopes and messages before any transport call', async () =>
  fixture(async (c) => {
    const payload = dm(c.accountId, 'one-event', 'سلام');
    assert.equal(await storeInstagramWebhook(payload), 1);
    assert.equal(await storeInstagramWebhook(payload), 0);
    const envelope = await db.instagramWebhookEnvelope.findFirstOrThrow({
      where: { workspaceId: c.workspaceId },
    });
    assert.ok(envelope.payloadCipher && !envelope.payloadCipher.includes('سلام'));
    process.env.META_CUSTOMER_SEND_ENABLED = 'false';
    await drainInstagramWebhook(c.workspaceId);
    assert.equal(
      (await db.instagramWebhookEnvelope.findUniqueOrThrow({ where: { id: envelope.id } })).status,
      'processed',
    );
    assert.equal(await db.instagramMessage.count({ where: { workspaceId: c.workspaceId } }), 1);
    assert.equal(
      await db.instagramJob.count({ where: { workspaceId: c.workspaceId, status: 'pending' } }),
      1,
    );
    await ingestInstagram(payload);
    assert.equal(await db.instagramMessage.count({ where: { workspaceId: c.workspaceId } }), 1);
    process.env.META_CUSTOMER_SEND_ENABLED = 'true';
    let sends = 0;
    await Promise.all([
      tickInstagram(
        c.workspaceId,
        transport(() => {
          sends++;
        }),
      ),
      tickInstagram(
        c.workspaceId,
        transport(() => {
          sends++;
        }),
      ),
    ]);
    assert.equal(sends, 1);
    assert.equal(
      (await db.instagramJob.findFirstOrThrow({ where: { workspaceId: c.workspaceId } })).status,
      'accepted',
    );
  }));

test('Direct DM replies use only this page catalog, current prices, and preserve encrypted follow-up context', async () =>
  fixture(async (c, b) => {
    const page = await db.catalogPage.findUniqueOrThrow({
      where: { workspaceId_handle: { workspaceId: c.workspaceId, handle: c.username } },
    });
    const foreign = await db.catalogPage.create({
      data: { workspaceId: b, name: 'B', handle: 'b' },
    });
    await db.catalogProduct.createMany({
      data: [
        {
          workspaceId: c.workspaceId,
          pageId: page.id,
          name: 'گوشی فروشگاه الف',
          description: 'اطلاعات واقعی محصول',
          category: 'موبایل',
          priceToman: 29000000n,
          stock: 2,
          url: 'https://example.com/a',
        },
        {
          workspaceId: b,
          pageId: foreign.id,
          name: 'SECRET FOREIGN PRODUCT',
          description: 'B',
          category: 'موبایل',
          priceToman: 1n,
          stock: 5,
          url: 'https://example.com/b',
        },
      ],
    });
    await ingestInstagram(dm(c.accountId, 'budget', 'تا ۳۰ میلیون تومان گوشی میخوام'));
    let text = '';
    await tickInstagram(
      c.workspaceId,
      transport((v) => {
        text = v;
      }),
    );
    assert.match(text, /گوشی فروشگاه الف/);
    assert.ok(!text.includes('SECRET FOREIGN'));
    const thread = await db.instagramThread.findFirstOrThrow({
      where: { workspaceId: c.workspaceId },
    });
    assert.ok(thread.contextCipher);
    assert.equal(
      (await db.instagramJob.findFirstOrThrow({ where: { workspaceId: c.workspaceId } }))
        .payloadCipher,
      null,
    );
    await db.catalogProduct.updateMany({
      where: { workspaceId: c.workspaceId },
      data: { stock: 0 },
    });
    await ingestInstagram(dm(c.accountId, 'follow', 'اولی موجوده؟'));
    await unthrottle(c.id);
    await tickInstagram(
      c.workspaceId,
      transport((v) => {
        text = v;
      }),
    );
    assert.match(text, /موجود نیست/);
  }));

test('Direct DM unknown sends are quarantined, human handoff stops automatic follow-ups, and manual request IDs dedupe', async () =>
  fixture(async (c) => {
    await ingestInstagram(dm(c.accountId, 'uncertain', 'سلام'));
    await tickInstagram(
      c.workspaceId,
      transport(() => {
        throw new MetaError('unknown');
      }),
    );
    const job = await db.instagramJob.findFirstOrThrow({ where: { workspaceId: c.workspaceId } });
    assert.equal(job.status, 'unknown');
    let sends = 0;
    await unthrottle(c.id);
    await tickInstagram(
      c.workspaceId,
      transport(() => {
        sends++;
      }),
    );
    assert.equal(sends, 0);
    const thread = await db.instagramThread.findFirstOrThrow({
      where: { workspaceId: c.workspaceId },
    });
    await assert.rejects(
      () => enqueueManualReply(c.workspaceId, thread.id, 'تکرار خطرناک', 'same'),
      { code: 'result_unknown' },
    );
    await ingestInstagram(dm(c.accountId, 'human', 'با اپراتور صحبت کنم'));
    await unthrottle(c.id);
    await tickInstagram(
      c.workspaceId,
      transport(() => {
        sends++;
      }),
    );
    assert.equal(
      (await db.instagramThread.findUniqueOrThrow({ where: { id: thread.id } })).handedOff,
      true,
    );
    await ingestInstagram(dm(c.accountId, 'after-human', 'سلام دوباره'));
    assert.equal(await db.instagramJob.count({ where: { workspaceId: c.workspaceId } }), 2);
    assert.equal(
      (await enqueueManualReply(c.workspaceId, thread.id, 'پاسخ دستی فروشنده', 'manual-id')).count,
      1,
    );
    assert.equal(
      (await enqueueManualReply(c.workspaceId, thread.id, 'پاسخ دستی فروشنده', 'manual-id')).count,
      0,
    );
    await unthrottle(c.id);
    await tickInstagram(
      c.workspaceId,
      transport(() => {
        sends++;
      }),
    );
    assert.equal(sends, 2);
  }));

test('Direct Meta temporary rate limits retry within bounds while token failures disable the connection', async () =>
  fixture(async (c) => {
    await ingestInstagram(dm(c.accountId, 'rate', 'سلام'));
    let attempts = 0;
    for (let i = 0; i < 3; i++) {
      await unthrottle(c.id);
      await db.instagramJob.updateMany({
        where: { workspaceId: c.workspaceId, status: 'pending' },
        data: { nextAttemptAt: new Date(0) },
      });
      await tickInstagram(
        c.workspaceId,
        transport(() => {
          attempts++;
          throw new MetaError('rate_limit');
        }),
      );
    }
    assert.equal(attempts, 3);
    assert.equal(
      (await db.instagramJob.findFirstOrThrow({ where: { workspaceId: c.workspaceId } })).status,
      'failed',
    );
    await ingestInstagram(dm(c.accountId, 'token', 'سلام', '79992'));
    await unthrottle(c.id);
    await tickInstagram(
      c.workspaceId,
      transport(() => {
        throw new MetaError('token');
      }),
    );
    const updated = await db.instagramConnection.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(updated.status, 'expired');
    assert.equal(updated.tokenCipher, '');
    assert.equal(updated.autoDm, false);
  }));

test('Direct comment automation ignores nonmatches and disabled rules and sends only once for duplicate events', async () =>
  fixture(async (c) => {
    const rule = await db.instagramAutomation.create({
      data: {
        workspaceId: c.workspaceId,
        connectionId: c.id,
        mediaId: '88001',
        keyword: 'لینک',
        replyText: 'متن معتبر',
        link: 'https://example.com',
        enabled: true,
      },
    });
    const comment = (text: string) => ({
      object: 'instagram',
      entry: [
        {
          id: c.accountId,
          changes: [
            {
              field: 'comments',
              value: { id: '88002', text, media: { id: '88001' }, from: { id: '88003' } },
            },
          ],
        },
      ],
    });
    await ingestInstagram(comment('سلام'));
    assert.equal(await db.instagramJob.count({ where: { workspaceId: c.workspaceId } }), 0);
    await db.instagramAutomation.update({ where: { id: rule.id }, data: { enabled: false } });
    await ingestInstagram(comment('لينك'));
    assert.equal(await db.instagramJob.count({ where: { workspaceId: c.workspaceId } }), 0);
    await db.instagramAutomation.update({ where: { id: rule.id }, data: { enabled: true } });
    await Promise.all([ingestInstagram(comment('لينك')), ingestInstagram(comment('لینک'))]);
    assert.equal(await db.instagramJob.count({ where: { workspaceId: c.workspaceId } }), 1);
    const old = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        Response.json({
          id: '88002',
          text: 'لینک',
          timestamp: new Date().toISOString(),
          media: { id: '88001' },
          from: { id: '88003' },
        });
      let sent = 0;
      const adapter = {
        dm: async () => {
          throw Error('Wrong API mode');
        },
        privateReply: async (account: string, id: string, text: string) => {
          assert.equal(account, c.accountId);
          assert.equal(id, '88002');
          assert.equal(text, 'متن معتبر\nhttps://example.com');
          sent++;
          return { messageId: 'fixture-private' };
        },
      };
      await tickInstagram(c.workspaceId, adapter);
      await unthrottle(c.id);
      await tickInstagram(c.workspaceId, adapter);
      assert.equal(sent, 1);
    } finally {
      globalThis.fetch = old;
    }
  }));

test('Direct Meta transport pins Instagram host, bearer token, recipient ID and subscription fields', async () => {
  const old = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.ok(String(url).startsWith('https://graph.instagram.com/'));
      assert.equal(init?.redirect, 'error');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer fixture-token');
      if (calls === 1) {
        assert.ok(String(init?.body).includes('comments%2Cmessages'));
        return Response.json({ success: true });
      }
      assert.deepEqual(JSON.parse(String(init?.body)), {
        recipient: { id: '22' },
        message: { text: 'متن' },
      });
      return Response.json({ message_id: 'fixture-id' });
    };
    await subscribeInstagramInbox('11', 'fixture-token');
    assert.equal(
      (await sendInstagramMessage('11', '22', 'متن', 'fixture-token')).messageId,
      'fixture-id',
    );
    await assert.rejects(() =>
      sendInstagramMessage('11', 'https://evil.example', 'متن', 'fixture-token'),
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = old;
  }
});
