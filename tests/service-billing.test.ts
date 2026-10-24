import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import { workspaceSubscription } from '../src/lib/service-billing';
import { saveInstagramGrant } from '../src/lib/instagram-connection';
import { encrypt } from '../src/lib/crypto';
if (new URL(process.env.DATABASE_URL!).pathname !== '/aidirect_test')
  throw Error('Isolated test DB required');
after(() => db.$disconnect());
test('monthly usage excludes imported history and other workspaces, with no invoice or automatic charging', async () => {
  const root = 'billing-fixture-' + process.pid,
    other = root + '-other';
  await db.workspace.createMany({
    data: [
      { id: root, name: 'A', createdAt: new Date(Date.now() - 86400000) },
      { id: other, name: 'B' },
    ],
  });
  try {
    const c = await saveInstagramGrant(
      root,
      { accountId: '980' + process.pid, username: 'billing_fixture' },
      { accessToken: 'synthetic-only-token', expiresIn: 86400 },
    );
    const b = await saveInstagramGrant(
      other,
      { accountId: '981' + process.pid, username: 'billing_other' },
      { accessToken: 'synthetic-only-token', expiresIn: 86400 },
    );
    for (const [workspaceId, connectionId, threadId] of [
      [root, c.id, root + '-thread'],
      [other, b.id, other + '-thread'],
    ]) {
      await db.instagramThread.create({
        data: {
          id: threadId,
          workspaceId,
          connectionId,
          senderCipher: encrypt('synthetic-sender', 'instagram-sender:' + threadId),
          lastInboundAt: new Date(),
          lastMessageAt: new Date(),
        },
      });
      await db.instagramMessage.createMany({
        data: [
          {
            id: threadId + '-new',
            threadId,
            workspaceId,
            direction: 'inbound',
            source: 'webhook',
            receivedAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
          },
          {
            id: threadId + '-history',
            threadId,
            workspaceId,
            direction: 'inbound',
            source: 'history',
            receivedAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
      });
      await db.instagramJob.create({
        data: {
          workspaceId,
          connectionId,
          kind: 'dm_auto',
          dedupeKey: threadId + '-job',
          status: 'accepted',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    }
    const usage = await workspaceSubscription(root);
    assert.equal(usage.workspace.id, root);
    assert.equal(usage.usage.jobs, 1);
    assert.equal(usage.usage.inbound, 1);
    assert.equal(usage.usage.accepted, 1);
    assert.equal(usage.plan.priceToman, 0);
    assert.equal(usage.plan.automaticCharging, false);
    assert.equal(usage.invoiceAvailable, false);
    assert.equal(usage.nextChargeToman, 0);
    await db.workspace.update({ where: { id: root }, data: { paused: true } });
    assert.equal((await workspaceSubscription(root)).access, 'paused');
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: [root, other] } } });
  }
});
