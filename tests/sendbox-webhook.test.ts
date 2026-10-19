import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { POST } from '../src/app/api/sendbox/webhook/route';
import { db } from '../src/lib/db';
import { decrypt, hash } from '../src/lib/crypto';
import {
  createSendboxInvite,
  redeemSendboxInvite,
  inspectSendboxGrant,
  revokeSendboxInvite,
} from '../src/lib/sendbox-invites';
import { consumeSendboxAttempt, finishSendboxConnection } from '../src/lib/sendbox-connection';
import { POST as invitePost } from '../src/app/api/sendbox/invite/route';
import {
  incomingDm,
  dmBudget,
  enqueueDm,
  tickDm,
  configureDm,
  sendDm,
} from '../src/lib/sendbox-dm';
if (new URL(process.env.DATABASE_URL!).pathname !== '/aidirect_test')
  throw new Error('Test database required');
const accountId = '00000000-0000-4000-8000-000000000001';
const secret = 'fixture-sendbox-secret';
function request(data: unknown, valid = true) {
  const raw = JSON.stringify(data);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request('https://example.com/api/sendbox/webhook', {
    method: 'POST',
    body: raw,
    headers: {
      'x-boxapi-timestamp': timestamp,
      'x-boxapi-signature': valid
        ? 'sha256=' +
          createHmac('sha256', secret)
            .update(timestamp + '.' + raw)
            .digest('hex')
        : 'sha256=' + '0'.repeat(64),
    },
  });
}
after(async () => {
  await db.$disconnect();
});

test('DM parser only accepts fresh inbound text for the connected recipient; shorthand is explicit', () => {
  const now = new Date();
  const since = new Date(now.getTime() - 1000);
  const item = {
    sender: { id: '456' },
    recipient: { id: '123' },
    timestamp: now.getTime(),
    message: { mid: 'fixture-mid', text: 'تا ۳۰ تومن' },
  };
  assert.equal(incomingDm(item, '123', since).length, 1);
  assert.equal(
    incomingDm(
      { messaging: [item, { ...item, message: { ...item.message, is_echo: true } }] },
      '123',
      since,
    ).length,
    1,
  );
  assert.equal(incomingDm(item, '789', since).length, 0);
  assert.equal(incomingDm({ ...item, sender: { id: '123' } }, '123', since).length, 0);
  assert.equal(incomingDm({ ...item, timestamp: now.getTime() - 2000 }, '123', since).length, 0);
  assert.equal(
    incomingDm({ ...item, message: { mid: 'x', attachments: [] } }, '123', since).length,
    0,
  );
  assert.deepEqual(dmBudget('تا ۳۰ تومن میخوام', true), { status: 'ready', toman: 30000000 });
  assert.equal(dmBudget('تا ۳۰ تومن', false).status, 'clarify');
  assert.equal(dmBudget('۳۰ ریال', true).status, 'clarify');
  assert.equal(dmBudget('بین ۲۰ تا ۳۰ تومن', true).status, 'clarify');
  assert.equal(dmBudget('تا -۳۰ تومن', true).status, 'clarify');
});

test('DM transport never retries unknown sends and only marks explicit provider success as accepted', async () => {
  const previous = globalThis.fetch;
  const previousKey = process.env.SENDBOX_API_KEY;
  process.env.SENDBOX_API_KEY = 'fixture-key';
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://api.sendbox.chat/api/v1/service/actions/send_message');
      assert.equal(init?.redirect, 'error');
      assert.deepEqual(JSON.parse(String(init?.body)), {
        account_id: accountId,
        recipient_id: '456',
        message: 'fixture reply',
      });
      return Response.json({ success: true });
    };
    assert.equal(await sendDm(accountId, '456', 'fixture reply'), 'accepted');
    for (const [status, expected] of [
      [401, 'authentication'],
      [429, 'rate_limit'],
      [500, 'unknown'],
      [400, 'rejected'],
    ] as const) {
      globalThis.fetch = async () => new Response('', { status });
      assert.equal(await sendDm(accountId, '456', 'fixture reply'), expected);
    }
    globalThis.fetch = async () => {
      throw new Error('private-provider-detail');
    };
    assert.equal(await sendDm(accountId, '456', 'fixture reply'), 'unknown');
    globalThis.fetch = async () => Response.json({ unrelated: true });
    assert.equal(await sendDm(accountId, '456', 'fixture reply'), 'unknown');
  } finally {
    globalThis.fetch = previous;
    if (previousKey === undefined) delete process.env.SENDBOX_API_KEY;
    else process.env.SENDBOX_API_KEY = previousKey;
  }
});
test('Sendbox ingress rejects an oversized raw body before signature or database processing', async () => {
  process.env.SENDBOX_WEBHOOK_SECRET = secret;
  const response = await POST(
    new Request('https://example.com/api/sendbox/webhook', {
      method: 'POST',
      body: 'x'.repeat(1_048_577),
    }),
  );
  assert.equal(response.status, 413);
});
test('Sendbox HTTP receipt persists once, encrypts content, isolates account and ignores DM echoes', async () => {
  process.env.SENDBOX_WEBHOOK_SECRET = secret;
  await db.sendboxWebhookEvent.deleteMany();
  await db.sendboxConnection.deleteMany();
  await db.sendboxConnection.create({
    data: {
      accountId,
      instagramId: '123',
      username: 'fixture',
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  const event = {
    event_id: 'fixture-comments',
    event_type: 'comments',
    account_id: accountId,
    data: { text: 'سلام' },
  };
  assert.equal((await POST(request(event, false))).status, 401);
  assert.equal(await db.sendboxWebhookEvent.count(), 0);
  assert.equal((await POST(request(event))).status, 200);
  assert.equal((await POST(request(event))).status, 200);
  assert.equal(await db.sendboxWebhookEvent.count(), 1);
  const stored = await db.sendboxWebhookEvent.findUniqueOrThrow({
    where: { eventId: event.event_id },
  });
  assert.equal(stored.payloadCipher?.includes('سلام'), false);
  assert.deepEqual(
    JSON.parse(decrypt(stored.payloadCipher!, `sendbox:${event.event_id}:${accountId}`)),
    event.data,
  );
  assert.equal(
    (
      await POST(
        request({
          ...event,
          event_id: 'other',
          account_id: '00000000-0000-4000-8000-000000000002',
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await POST(request({ ...event, event_id: 'echo', event_type: 'messaging' }))).status,
    200,
  );
  assert.equal(await db.sendboxWebhookEvent.count(), 1);
  await db.sendboxWebhookEvent.update({
    where: { eventId: event.event_id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await POST(request(event));
  assert.equal(
    (await db.sendboxWebhookEvent.findUniqueOrThrow({ where: { eventId: event.event_id } }))
      .payloadCipher,
    null,
  );
  await db.sendboxWebhookEvent.deleteMany();
  await db.sendboxConnection.deleteMany();
});

test('Sendbox invitations serialize creation, redeem once and bind a grant to one browser; completion is atomic', async () => {
  await db.sendboxInvite.deleteMany();
  await db.sendboxConnection.deleteMany();
  try {
    const links = await Promise.all([createSendboxInvite(), createSendboxInvite()]);
    const active = await db.sendboxInvite.findMany({ where: { revokedAt: null } });
    assert.equal(active.length, 1);
    const link = links.find((x) => hash(x.token) === active[0].tokenHash)!;
    assert(link);
    assert.notEqual(active[0].tokenHash, link.token);
    const claims = await Promise.allSettled([
      redeemSendboxInvite(link.token),
      redeemSendboxInvite(link.token),
    ]);
    assert.equal(claims.filter((x) => x.status === 'fulfilled').length, 1);
    const claim = claims.find((x) => x.status === 'fulfilled');
    assert(claim?.status === 'fulfilled');
    const grant = await inspectSendboxGrant(claim.value.cookie);
    assert.equal(grant.usedAt, null);
    await assert.rejects(() => inspectSendboxGrant(`${grant.tokenHash}.${'A'.repeat(43)}`));
    assert.notEqual(grant.claimHash, claim.value.cookie.split('.')[1]);
    const state = 's'.repeat(43);
    await db.oAuthAttempt.create({
      data: {
        stateHash: hash(`sendbox:${state}`),
        inviteHash: grant.tokenHash,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    assert.equal(await consumeSendboxAttempt(state, null), false);
    assert.equal(await consumeSendboxAttempt(state, 'different-invite'), false);
    assert.equal(await consumeSendboxAttempt(state, grant.tokenHash), true);
    assert.equal(await consumeSendboxAttempt(state, grant.tokenHash), false);
    const account = {
      id: accountId,
      instagram_user_id: '123',
      username: 'fixture-invited',
      is_active: true,
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    };
    await finishSendboxConnection(account, grant.tokenHash);
    assert((await inspectSendboxGrant(claim.value.cookie)).usedAt);
    await assert.rejects(() => finishSendboxConnection(account, grant.tokenHash));
    await assert.rejects(createSendboxInvite);
    await assert.rejects(() =>
      finishSendboxConnection({ ...account, id: '00000000-0000-4000-8000-000000000009' }, null),
    );
    assert.equal(
      (await db.sendboxConnection.findUniqueOrThrow({ where: { id: 'proof' } })).accountId,
      accountId,
    );
  } finally {
    await db.sendboxConnection.deleteMany();
    await db.sendboxInvite.deleteMany();
  }
});

test('Sendbox revoked and expired invitations fail; failed account replacement does not consume a grant', async () => {
  await db.sendboxInvite.deleteMany();
  await db.sendboxConnection.deleteMany();
  try {
    const link = await createSendboxInvite();
    const claim = await redeemSendboxInvite(link.token);
    await revokeSendboxInvite(link.id);
    await assert.rejects(() => inspectSendboxGrant(claim.cookie));
    await assert.rejects(() => redeemSendboxInvite(link.token));
    const expired = await createSendboxInvite();
    await db.sendboxInvite.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await assert.rejects(() => redeemSendboxInvite(expired.token));
    const next = await createSendboxInvite();
    const accepted = await redeemSendboxInvite(next.token);
    const grant = await inspectSendboxGrant(accepted.cookie);
    await db.sendboxConnection.create({
      data: {
        accountId,
        instagramId: '123',
        username: 'existing',
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    await assert.rejects(() =>
      finishSendboxConnection(
        {
          id: '00000000-0000-4000-8000-000000000009',
          instagram_user_id: '456',
          username: 'wrong',
          is_active: true,
          expires_at: new Date(Date.now() + 86400_000).toISOString(),
        },
        grant.tokenHash,
      ),
    );
    assert.equal((await inspectSendboxGrant(accepted.cookie)).usedAt, null);
  } finally {
    await db.sendboxConnection.deleteMany();
    await db.sendboxInvite.deleteMany();
  }
});

test('Sendbox invitation endpoint rejects cross-origin and oversized requests before claiming', async () => {
  const request = (origin: string, body: string) =>
    new Request((process.env.APP_BASE_URL ?? 'http://localhost:3000') + '/api/sendbox/invite', {
      method: 'POST',
      headers: { Origin: origin },
      body,
    });
  assert.equal((await invitePost(request('https://untrusted.example', '{}'))).status, 403);
  assert.equal(
    (
      await invitePost(
        request(process.env.APP_BASE_URL ?? 'http://localhost:3000', 'x'.repeat(1025)),
      )
    ).status,
    413,
  );
});

test('DM durable queue uses the matching owner catalog, suppresses duplicates and changed settings, and quarantines uncertain sends', async () => {
  const pageId = 'dm-pilot-fixture';
  await db.sendboxConnection.deleteMany();
  await db.sendboxDmDelivery.deleteMany({ where: { accountId } });
  await db.workspace.upsert({
    where: { id: 'operator-catalog' },
    create: { id: 'operator-catalog', name: 'fixture' },
    update: {},
  });
  await db.catalogPage.deleteMany({ where: { id: pageId } });
  await db.catalogPage.create({
    data: { id: pageId, workspaceId: 'operator-catalog', handle: 'dmfixture', name: 'fixture' },
  });
  await db.sendboxConnection.create({
    data: {
      accountId,
      instagramId: '123',
      username: 'dmfixture',
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  const product = {
    workspaceId: 'operator-catalog',
    pageId,
    description: 'trusted description',
    category: 'موبایل',
    url: 'https://example.com/fixture',
  };
  await db.catalogProduct.createMany({
    data: [
      { ...product, name: 'موجود مجاز', priceToman: 29000000n, stock: 2 },
      { ...product, name: 'ناموجود', priceToman: 20000000n, stock: 0 },
      { ...product, name: 'گران', priceToman: 31000000n, stock: 2 },
      { ...product, name: 'غیرفعال', priceToman: 10000000n, stock: 2, active: false },
    ],
  });
  const item = (mid: string) => ({
    sender: { id: '456' },
    recipient: { id: '123' },
    timestamp: Date.now(),
    message: { mid, text: 'تا ۳۰ تومن محصول میخوام' },
  });
  try {
    assert.equal(await enqueueDm(accountId, item('disabled')), 0);
    await configureDm(pageId, true, true);
    const duplicate = item('once');
    assert.equal(
      (
        await Promise.all([enqueueDm(accountId, duplicate), enqueueDm(accountId, duplicate)])
      ).reduce((a, b) => a + b),
      1,
    );
    const stored = await db.sendboxDmDelivery.findFirstOrThrow({ where: { accountId } });
    assert.ok(stored.payloadCipher && !stored.payloadCipher.includes('456'));
    assert.notEqual(stored.messageHash, 'once');
    let calls = 0;
    const transport = async (account: string, recipient: string, reply: string) => {
      assert.equal(account, accountId);
      assert.equal(recipient, '456');
      assert.match(reply, /موجود مجاز/);
      assert.doesNotMatch(reply, /ناموجود|گران|غیرفعال/);
      assert.ok(reply.length <= 1000);
      calls++;
      return 'accepted' as const;
    };
    await Promise.all([tickDm(transport), tickDm(transport)]);
    assert.equal(calls, 1);
    assert.equal(await enqueueDm(accountId, duplicate), 0);
    assert.equal(
      (await db.sendboxDmDelivery.findUniqueOrThrow({ where: { id: stored.id } })).payloadCipher,
      null,
    );
    await enqueueDm(accountId, item('uncertain'));
    await tickDm(async () => 'unknown');
    await tickDm(transport);
    assert.equal(calls, 1);
    assert.equal(await db.sendboxDmDelivery.count({ where: { accountId, status: 'unknown' } }), 1);
    await enqueueDm(accountId, item('rate'));
    await tickDm(async () => 'rate_limit');
    const rate = await db.sendboxDmDelivery.findFirstOrThrow({
      where: { accountId, status: 'pending' },
    });
    assert.ok(rate.nextAttemptAt.getTime() > Date.now());
    await tickDm(transport);
    assert.equal(calls, 1);
    await configureDm(pageId, false, true);
    assert.equal(await enqueueDm(accountId, item('off')), 0);
    assert.equal(await db.sendboxDmDelivery.count({ where: { accountId, status: 'pending' } }), 0);
    await configureDm(pageId, true, true);
    await enqueueDm(accountId, item('auth'));
    await tickDm(async () => 'authentication');
    assert.equal(
      (await db.sendboxDmSettings.findUniqueOrThrow({ where: { accountId } })).enabled,
      false,
    );
    await assert.rejects(() => configureDm('nonexistent', true, true));
  } finally {
    await db.sendboxDmDelivery.deleteMany({ where: { accountId } });
    await db.catalogPage.deleteMany({ where: { id: pageId } });
    await db.sendboxConnection.deleteMany();
  }
});
