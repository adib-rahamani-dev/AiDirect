import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  validSendboxSignature,
  parseSendboxEvent,
  sendboxAccounts,
  sendboxInfo,
  SendboxError,
} from '../src/lib/sendbox';

test('Sendbox signature binds exact bytes and timestamp; rejects stale, future, malformed and Meta signatures', () => {
  const secret = 'fixture-sendbox-secret';
  const raw = Buffer.from('{"text":"سلام / دنیا"}');
  const timestamp = '1792274400';
  const signature =
    'sha256=' +
    createHmac('sha256', secret)
      .update(timestamp + '.')
      .update(raw)
      .digest('hex');
  const headers = new Headers({ 'x-boxapi-timestamp': timestamp, 'x-boxapi-signature': signature });
  const now = Number(timestamp) * 1000;
  assert.equal(validSendboxSignature(raw, headers, secret, now), true);
  assert.equal(
    validSendboxSignature(Buffer.from('{ "text":"سلام / دنیا"}'), headers, secret, now),
    false,
  );
  assert.equal(validSendboxSignature(raw, headers, secret, now + 301000), false);
  assert.equal(validSendboxSignature(raw, headers, secret, now - 301000), false);
  assert.equal(
    validSendboxSignature(raw, new Headers({ 'x-hub-signature-256': signature }), secret, now),
    false,
  );
  headers.set('x-boxapi-timestamp', 'NaN');
  assert.equal(validSendboxSignature(raw, headers, secret, now), false);
});
test('Sendbox envelope validates UUID ownership identifier and matching header event id', () => {
  const payload = {
    event_id: 'fixture-event',
    event_type: 'comments',
    account_id: '00000000-0000-4000-8000-000000000001',
    data: {},
  };
  assert.equal(parseSendboxEvent(payload, 'fixture-event').event_type, 'comments');
  assert.throws(() => parseSendboxEvent(payload, 'different'));
  assert.throws(() => parseSendboxEvent({ ...payload, account_id: '1234' }, null));
});
test('Sendbox read-only contract uses X-Api-Key and strips internal tokens and profile data', async () => {
  const original = globalThis.fetch;
  const oldKey = process.env.SENDBOX_API_KEY;
  process.env.SENDBOX_API_KEY = 'fixture-api-key';
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://api.sendbox.chat/api/v1/service/accounts');
      assert.equal((init?.headers as Record<string, string>)['X-Api-Key'], 'fixture-api-key');
      assert.equal(init?.redirect, 'error');
      return Response.json({
        success: true,
        data: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            instagram_user_id: '123',
            username: 'fixture',
            is_active: true,
            expires_at: '2026-12-01T00:00:00Z',
            internal_token: 'must-never-leave-server',
            profile_photo: 'https://example.com/photo',
          },
        ],
      });
    };
    const accounts = await sendboxAccounts();
    assert.equal(accounts.length, 1);
    assert.equal('internal_token' in accounts[0], false);
    assert.equal('profile_photo' in accounts[0], false);
    globalThis.fetch = async () => Response.json({}, { status: 401 });
    await assert.rejects(
      sendboxAccounts,
      (e) => e instanceof SendboxError && e.kind === 'authentication',
    );
    globalThis.fetch = async () => Response.json({}, { status: 429 });
    await assert.rejects(
      sendboxAccounts,
      (e) => e instanceof SendboxError && e.kind === 'rate_limit',
    );
    globalThis.fetch = async () =>
      Response.json({
        success: true,
        data: {
          domain: 'http://localhost:3000',
          login_redirect_url: 'http://localhost:3000/api/sendbox/callback',
          instagram_oauth_url: 'https://attacker.example/instagram-oauth?token=fixture',
          plan: { account_limit: 1 },
        },
      });
    await assert.rejects(
      sendboxInfo,
      (e) => e instanceof SendboxError && e.kind === 'configuration',
    );
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.SENDBOX_API_KEY;
    else process.env.SENDBOX_API_KEY = oldKey;
  }
});
