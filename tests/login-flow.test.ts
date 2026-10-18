import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loginDestination } from '../src/lib/login-destination';
import { POST } from '../src/app/api/proof/session/route';
import { db } from '../src/lib/db';
import { baseUrl } from '../src/lib/config';
if (new URL(process.env.DATABASE_URL!).pathname !== '/aidirect_test')
  throw new Error('Test database required');
after(() => db.$disconnect());
test('login destination rejects external, protocol-relative and encoded redirect targets', () => {
  assert.equal(loginDestination('/'), '/');
  assert.equal(loginDestination('/sendbox'), '/sendbox');
  assert.equal(loginDestination('/proof'), '/proof');
  assert.equal(loginDestination('/admin'), '/admin');
  for (const destination of [
    'https://attacker.example',
    '//attacker.example',
    '/%2f%2fattacker.example',
    'javascript:alert(1)',
    '/sendbox/../../',
    undefined,
  ])
    assert.equal(loginDestination(destination), '/sendbox');
});
test('login rejects cross-origin requests and returns a bounded retry signal under the persistent throttle', async () => {
  const request = (origin: string) =>
    new Request(baseUrl() + '/api/proof/session', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fixture@example.com', password: 'fixture-password' }),
    });
  assert.equal((await POST(request('https://attacker.example'))).status, 403);
  await db.proofLoginGuard.upsert({
    where: { id: 'operator' },
    create: { id: 'operator', nextAttemptAt: new Date(Date.now() + 3600_000) },
    update: { nextAttemptAt: new Date(Date.now() + 3600_000) },
  });
  try {
    const response = await POST(request(baseUrl()));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '3');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    await db.proofLoginGuard.deleteMany({ where: { id: 'operator' } });
  }
});
