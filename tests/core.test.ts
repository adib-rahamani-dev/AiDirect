import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { normalize, matches } from '../src/lib/matching';
import { encrypt, decrypt, validSignature } from '../src/lib/crypto';
import { parseComments } from '../src/lib/webhook';
import { classify } from '../src/lib/meta';
test('Persian normalization and complete-word matching', () => {
  assert.equal(normalize('  لينك\u200cخريد  '), 'لینک خرید');
  assert(matches('لطفاً لينك را بدهید', 'لینک'));
  assert(matches('کد\u200cتخفیف لطفا', 'كد تخفيف'));
  assert(!matches('لینکی ندارم', 'لینک'));
  assert(!matches('لینک', ''));
});
test('Ciphertext is authenticated and bound to the account context', () => {
  const value = encrypt('sensitive-value', 'token:123');
  assert(!value.includes('sensitive-value'));
  assert.equal(decrypt(value, 'token:123'), 'sensitive-value');
  assert.throws(() => decrypt(value, 'token:456'));
  assert.throws(() => decrypt(value.slice(0, -2) + 'aa', 'token:123'));
});
test('Raw-body HMAC rejects changed bytes, missing and malformed signatures', () => {
  const raw = Buffer.from('{"a": 1}');
  const secret = 'test-fixture-secret';
  const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  assert(validSignature(raw, signature, secret));
  assert(!validSignature(Buffer.from('{"a":1}'), signature, secret));
  assert(!validSignature(raw, null, secret));
  assert(!validSignature(raw, 'sha256=abc', secret));
});
test('Official payload variants parse; messages, live and unrelated events are ignored', () => {
  const value = {
    id: '22',
    text: 'لینک',
    from: { id: '33' },
    media: { id: '44', media_product_type: 'FEED' },
  };
  const base = {
    object: 'instagram',
    entry: [
      {
        id: '11',
        time: 123,
        changes: [
          { field: 'comments', value },
          { field: 'messages', value },
          { field: 'live_comments', value },
        ],
      },
    ],
  };
  assert.equal(parseComments(base).length, 1);
  assert.equal(
    parseComments([{ object: 'instagram', entry: [{ id: '11', field: 'comments', value }] }])
      .length,
    1,
  );
  assert.equal(parseComments({ object: 'page', entry: [] }).length, 0);
  assert.equal(
    parseComments({
      ...base,
      entry: [
        {
          id: '11',
          changes: [{ field: 'comments', value: { ...value, media: { id: '44', ad_id: '99' } } }],
        },
      ],
    }).length,
    0,
  );
});
test('Send errors distinguish an explicit rejection from an ambiguous result', () => {
  assert.equal(classify(400, { error: { code: 190 } }, true).kind, 'token');
  assert.equal(classify(400, { error: { code: 10 } }, true).kind, 'permission');
  assert.equal(classify(429, { error: { code: 4 } }, true).kind, 'rate_limit');
  assert.equal(classify(500, { error: { is_transient: true } }, true).kind, 'unknown');
  assert.equal(classify(503, { error: { is_transient: true } }, false).kind, 'temporary');
  assert.equal(classify(200, {}, true).kind, 'unknown');
});
