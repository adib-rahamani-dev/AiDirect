import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '../src/app/api/meta/webhook/route';
test('webhook HTTP handler rejects invalid signature before storage', async () => {
  process.env.META_WEBHOOK_APP_SECRET = 'test-fixture-secret';
  const response = await POST(
    new Request('https://example.com/api/meta/webhook', {
      method: 'POST',
      body: '{"object":"instagram","entry":[]}',
      headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) },
    }),
  );
  assert.equal(response.status, 403);
});
test('webhook HTTP verification returns exact challenge only for matching token', async () => {
  process.env.META_WEBHOOK_VERIFY_TOKEN = 'test-verify-token';
  const good = await GET(
    new Request(
      'https://example.com/api/meta/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345',
    ),
  );
  assert.equal(good.status, 200);
  assert.equal(await good.text(), '12345');
  assert.equal(
    (
      await GET(
        new Request(
          'https://example.com/api/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345',
        ),
      )
    ).status,
    403,
  );
});
