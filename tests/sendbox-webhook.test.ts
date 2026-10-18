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
