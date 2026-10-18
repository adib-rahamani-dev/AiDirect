import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import {
  customerIdentity,
  ensureCustomerWorkspace,
  consumeAuthLimit,
} from '../src/lib/customer-auth';
import { GET, POST } from '../src/app/api/auth/[...all]/route';
import { catalogSnapshot, catalogMutation } from '../src/lib/catalog';
import { administerUser } from '../src/lib/user-administration';
import { baseUrl } from '../src/lib/config';
import { hashPassword, hashConfiguredOwnerPassword, verifyPassword } from '../src/lib/password';
if (new URL(process.env.DATABASE_URL!).pathname !== '/aidirect_test')
  throw new Error('Isolated test database required');
after(() => db.$disconnect());
function request(path: string, body?: unknown, cookie = '') {
  return new Request(baseUrl() + '/api/auth/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: baseUrl(),
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}
test('Customer signup, role protection, independent workspaces, suspension and revocation', async () => {
  process.env.SIGNUP_ENABLED = 'true';
  await db.authThrottle.deleteMany();
  const prefix = `auth-fixture-${process.pid}`,
    password = 'Synthetic-test-passphrase-123';
  const emailA = prefix + '-a@example.invalid',
    emailB = prefix + '-b@example.invalid';
  const cleanup = async () => {
    const users = await db.user.findMany({ where: { email: { in: [emailA, emailB] } } });
    const ids = users.map((u) => u.id);
    await db.workspace.deleteMany({ where: { ownerId: { in: ids } } });
    await db.adminAudit.deleteMany({ where: { targetId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  };
  await cleanup();
  try {
    assert.equal(
      (
        await POST(
          new Request(baseUrl() + '/api/auth/sign-up/email', {
            method: 'POST',
            headers: { Origin: 'https://attacker.invalid' },
            body: '{}',
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await POST(
          request('sign-up/email', {
            email: emailA,
            password,
            name: 'الف',
            platformRole: 'SENIOR_ADMIN',
          }),
        )
      ).status,
      400,
    );
    const a = await POST(
      request('sign-up/email', { email: emailA, password, name: 'فروشگاه الف' }),
    );
    assert.equal(a.status, 200);
    const cookieA = sessionCookie(a);
    assert(cookieA.includes('aidirect_customer'));
    assert(a.headers.get('set-cookie')?.includes('HttpOnly'));
    const b = await POST(request('sign-up/email', { email: emailB, password, name: 'فروشگاه ب' }));
    assert.equal(b.status, 200);
    const cookieB = sessionCookie(b);
    const userA = await customerIdentity(new Headers({ Cookie: cookieA }));
    const userB = await customerIdentity(new Headers({ Cookie: cookieB }));
    assert.equal(userA.platformRole, 'CUSTOMER');
    assert.equal(userA.emailVerified, false);
    const account = await db.account.findFirstOrThrow({ where: { userId: userA.id } });
    assert(account.password !== password);
    assert(await verifyPassword(password, account.password!));
    const [wa, wa2] = await Promise.all([
      ensureCustomerWorkspace(userA.id, userA.name),
      ensureCustomerWorkspace(userA.id, userA.name),
    ]);
    assert.equal(wa.id, wa2.id);
    const wb = await ensureCustomerWorkspace(userB.id, userB.name);
    assert.notEqual(wa.id, wb.id);
    await assert.rejects(() => catalogSnapshot(userB.id, wa.id), { status: 403 });
    await assert.rejects(
      () => catalogMutation(userB.id, wa.id, { action: 'pause', paused: true }),
      { status: 403 },
    );
    await assert.rejects(
      () =>
        administerUser(
          { id: userB.id, role: 'SENIOR_ADMIN' },
          { action: 'role', id: userA.id, role: 'SENIOR_ADMIN' },
        ),
      { status: 403 },
    );
    assert.equal(
      (await POST(request('update-user', { platformRole: 'SENIOR_ADMIN' }, cookieA))).status,
      400,
    );
    await administerUser(
      { id: 'operator', role: 'SUPER_ADMIN' },
      { action: 'role', id: userA.id, role: 'SENIOR_ADMIN' },
    );
    await assert.rejects(() => customerIdentity(new Headers({ Cookie: cookieA })), {
      message: 'unauthorized',
    });
    const login = await POST(request('sign-in/email', { email: emailA, password }));
    assert.equal(login.status, 200);
    const newCookie = sessionCookie(login);
    assert.equal(
      (await customerIdentity(new Headers({ Cookie: newCookie }))).platformRole,
      'SENIOR_ADMIN',
    );
    await administerUser(
      { id: 'operator', role: 'SUPER_ADMIN' },
      { action: 'suspend', id: userA.id, suspended: true },
    );
    await assert.rejects(() => customerIdentity(new Headers({ Cookie: newCookie })), {
      message: 'unauthorized',
    });
    assert.equal((await POST(request('sign-in/email', { email: emailA, password }))).status, 401);
    const logout = await POST(request('sign-out', {}, cookieB));
    assert.equal(logout.status, 200);
    await assert.rejects(() => customerIdentity(new Headers({ Cookie: cookieB })), {
      message: 'unauthorized',
    });
    assert.equal(await db.adminAudit.count({ where: { targetId: userA.id } }), 2);
    assert.equal((await GET(request('admin/create-user'))).status, 404);
  } finally {
    await cleanup();
  }
});
test('Authentication limits are atomic across simultaneous requests', async () => {
  const key = `fixture-limit-${process.pid}-${Date.now()}`;
  const results = await Promise.all(Array.from({ length: 8 }, () => consumeAuthLimit(key, 60, 2)));
  assert.equal(results.filter((r) => r.allowed).length, 2);
  assert(results.some((r) => r.retryAfter !== null));
});
test('Customer password policy rejects short passwords', async () => {
  await assert.rejects(() => hashPassword('short'));
  const configured = await hashConfiguredOwnerPassword('Owner-123');
  assert(await verifyPassword('Owner-123', configured));
  assert(!(await verifyPassword('incorrect', configured)));
});
