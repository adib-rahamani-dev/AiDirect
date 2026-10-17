import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import { hash } from '../src/lib/crypto';
import { newSession, isActiveSession } from '../src/lib/auth';
if (new URL(process.env.DATABASE_URL!).pathname !== '/aidirect_test')
  throw new Error('Test database required');
after(() => db.$disconnect());
test('server session revocation rejects a valid signed cookie after logout', async () => {
  const token = newSession();
  const tokenHash = hash(token);
  assert.equal(await isActiveSession(token), false);
  try {
    await db.operatorSession.create({
      data: { tokenHash, expiresAt: new Date(Date.now() + 60000) },
    });
    assert.equal(await isActiveSession(token), true);
    await db.operatorSession.delete({ where: { tokenHash } });
    assert.equal(await isActiveSession(token), false);
    await db.operatorSession.create({
      data: { tokenHash, expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal(await isActiveSession(token), false);
  } finally {
    await db.operatorSession.deleteMany({ where: { tokenHash } });
  }
});
