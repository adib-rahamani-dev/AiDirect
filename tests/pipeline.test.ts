import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import { encrypt } from '../src/lib/crypto';
import { ingest } from '../src/lib/pipeline';
import { tick } from '../src/lib/worker';
import { MetaError, type InstagramAdapter } from '../src/lib/meta';
const url = new URL(process.env.DATABASE_URL!);
if (
  url.pathname !== '/aidirect_test' ||
  (url.hostname !== '127.0.0.1' &&
    (!process.env.TEST_DATABASE_URL ||
      new URL(process.env.TEST_DATABASE_URL).hostname !== url.hostname ||
      !url.hostname.endsWith('.neon.tech')))
)
  throw new Error('Refusing to mutate non-test database');
after(() => db.$disconnect());
const incoming = (commentId = '3', text = 'لينك') => ({
  accountId: '1',
  mediaId: '2',
  commentId,
  text,
  authorId: '4',
  productType: 'FEED',
});
async function reset(enabled = true) {
  await db.delivery.deleteMany();
  await db.commentEvent.deleteMany();
  await db.proofRule.deleteMany();
  await db.proofConnection.deleteMany();
  await db.proofConnection.create({
    data: {
      id: 'proof',
      accountId: '1',
      appScopedId: '5',
      username: 'owner',
      tokenCipher: encrypt('test-token', 'token:1'),
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  await db.proofRule.create({
    data: {
      id: 'proof',
      accountId: '1',
      mediaId: '2',
      keyword: 'لینک',
      replyText: 'reply',
      link: 'https://example.com',
      enabled,
    },
  });
}
function fake(onSend: () => Promise<void> = async () => {}, old = false): InstagramAdapter {
  return {
    kind: 'simulated',
    async media() {
      return [];
    },
    async comments() {
      return [];
    },
    async comment(id) {
      return {
        id,
        text: 'لینک',
        timestamp: new Date(Date.now() - (old ? 8 * 86400_000 : 0)).toISOString(),
        media: { id: '2' },
        from: { id: '4' },
      };
    },
    async send() {
      await onSend();
      return { messageId: 'simulated:test' };
    },
  };
}
test('Durable PostgreSQL proof pipeline', async (t) => {
  await t.test(
    'comments predating a new connection are skipped after reconnect or purge',
    async () => {
      await reset();
      await db.proofConnection.update({
        where: { id: 'proof' },
        data: { acceptCommentsSince: new Date(Date.now() + 10000) },
      });
      await ingest([incoming()], 'simulation');
      let sends = 0;
      await tick(
        fake(async () => {
          sends++;
        }),
      );
      assert.equal(sends, 0);
      assert.equal((await db.delivery.findFirstOrThrow()).status, 'skipped');
    },
  );
  await t.test(
    'matching comment creates one job across concurrent redeliveries and workers',
    async () => {
      await reset();
      let sends = 0;
      await Promise.all(Array.from({ length: 8 }, () => ingest([incoming()], 'simulation')));
      assert.equal(await db.commentEvent.count(), 1);
      assert.equal(await db.delivery.count(), 1);
      await Promise.all([
        tick(
          fake(async () => {
            sends++;
          }),
        ),
        tick(
          fake(async () => {
            sends++;
          }),
        ),
      ]);
      assert.equal(sends, 1);
      assert.equal((await db.delivery.findFirstOrThrow()).status, 'simulated');
    },
  );
  await t.test(
    'nonmatching, disabled, unrelated account/media, own and nested comments send nothing',
    async () => {
      await reset();
      await ingest(
        [
          incoming('10', 'نامنطبق'),
          { ...incoming('11'), accountId: '999' },
          { ...incoming('12'), mediaId: '999' },
          { ...incoming('13'), authorId: '1' },
          { ...incoming('14'), parentId: '100' },
        ],
        'simulation',
      );
      assert.equal(await db.delivery.count(), 0);
      await reset(false);
      await ingest([incoming()], 'simulation');
      assert.equal(await db.delivery.count(), 0);
    },
  );
  await t.test(
    'a 1000-comment webhook batch persists atomically and replay creates no jobs',
    async () => {
      await reset();
      const batch = Array.from({ length: 1000 }, (_, i) =>
        incoming(String(10000 + i), i % 2 ? 'غیرمنطبق' : 'لینک'),
      );
      await ingest(batch, 'simulation');
      await ingest(batch, 'simulation');
      assert.equal(await db.commentEvent.count(), 1000);
      assert.equal(await db.delivery.count(), 500);
    },
  );
  await t.test('turning rule off after enqueue prevents sending', async () => {
    await reset();
    await ingest([incoming()], 'simulation');
    await db.proofRule.update({ where: { id: 'proof' }, data: { enabled: false } });
    let sends = 0;
    await tick(
      fake(async () => {
        sends++;
      }),
    );
    assert.equal(sends, 0);
    assert.equal((await db.delivery.findFirstOrThrow()).status, 'skipped');
  });
  await t.test('old comments expire using API timestamp, not notification time', async () => {
    await reset();
    await ingest([incoming()], 'simulation');
    let sends = 0;
    await tick(
      fake(async () => {
        sends++;
      }, true),
    );
    assert.equal(sends, 0);
    assert.equal((await db.delivery.findFirstOrThrow()).status, 'expired');
  });
  await t.test('token error requires reconnection and halts retry', async () => {
    await reset();
    await ingest([incoming()], 'simulation');
    await tick(
      fake(async () => {
        throw new MetaError('token', 190);
      }),
    );
    assert.equal((await db.delivery.findFirstOrThrow()).status, 'failed');
    assert.equal((await db.proofConnection.findFirstOrThrow()).status, 'reauthorize_required');
  });
  await t.test('explicit rate rejection is queued with delay', async () => {
    await reset();
    await ingest([incoming()], 'simulation');
    await tick(
      fake(async () => {
        throw new MetaError('rate_limit', 4);
      }),
    );
    const d = await db.delivery.findFirstOrThrow();
    assert.equal(d.status, 'pending');
    assert(d.nextAttemptAt.getTime() > Date.now() + 50000);
  });
  await t.test('temporary read failure retries without calling send', async () => {
    await reset();
    await ingest([incoming()], 'simulation');
    let sends = 0;
    const a = fake(async () => {
      sends++;
    });
    a.comment = async () => {
      throw new MetaError('temporary');
    };
    await tick(a);
    assert.equal(sends, 0);
    assert.equal((await db.delivery.findFirstOrThrow()).status, 'pending');
  });
  await t.test('unknown send result never retries, including duplicate event', async () => {
    await reset();
    await ingest([incoming()], 'simulation');
    let sends = 0;
    const a = fake(async () => {
      sends++;
      throw new MetaError('unknown');
    });
    await tick(a);
    await ingest([incoming()], 'simulation');
    await tick(a);
    assert.equal(sends, 1);
    assert.equal((await db.delivery.findFirstOrThrow()).status, 'unknown');
  });
  await t.test(
    'worker crash after send boundary quarantines job; preflight crash is recoverable',
    async () => {
      await reset();
      await ingest([incoming('31'), incoming('32')], 'simulation');
      const d = await db.delivery.findMany({ orderBy: { createdAt: 'asc' } });
      await db.delivery.update({
        where: { id: d[0].id },
        data: { status: 'sending', leaseUntil: new Date(0) },
      });
      await db.delivery.update({
        where: { id: d[1].id },
        data: { status: 'preparing', leaseUntil: new Date(0) },
      });
      let sends = 0;
      await tick(
        fake(async () => {
          sends++;
        }),
      );
      assert.equal(
        (await db.delivery.findUniqueOrThrow({ where: { id: d[0].id } })).status,
        'unknown',
      );
      assert.equal(sends, 1);
    },
  );
  await t.test('real webhook cannot enqueue simulated jobs', async () => {
    await reset();
    await ingest([incoming()], 'webhook');
    assert.equal(await db.delivery.count(), 0);
  });
});
