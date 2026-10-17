import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { newSession, validSession } from '../src/lib/auth';
test('password hashing uses unique salts and rejects incorrect or malformed input', async () => {
  const a = await hashPassword('a-test-password-123');
  const b = await hashPassword('a-test-password-123');
  assert.notEqual(a, b);
  assert(!a.includes('a-test-password'));
  assert(await verifyPassword('a-test-password-123', a));
  assert(!(await verifyPassword('wrong', a)));
  assert(!(await verifyPassword('a-test-password-123', 'broken')));
  await assert.rejects(() => hashPassword('short'));
});
test('sessions reject tampering, malformed expiry, and changed credentials', () => {
  process.env.SESSION_SECRET = 'test-session-secret-only';
  process.env.OPERATOR_PASSWORD_HASH = 'first-test-hash';
  const session = newSession();
  assert(validSession(session));
  assert(!validSession(session + 'x'));
  assert(!validSession('Infinity.nonce.signature'));
  assert(!validSession(session.replace(/^\d+/, '1000000000000')));
  process.env.OPERATOR_PASSWORD_HASH = 'rotated-test-hash';
  assert(!validSession(session));
});
