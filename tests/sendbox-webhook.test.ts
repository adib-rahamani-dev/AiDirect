import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { POST } from '../src/app/api/sendbox/webhook/route';
import { db } from '../src/lib/db';
import { decrypt } from '../src/lib/crypto';
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
