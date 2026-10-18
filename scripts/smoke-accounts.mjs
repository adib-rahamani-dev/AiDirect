import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import pg from 'pg';
const live = process.argv.includes('--live');
const base = live ? 'https://aidirect-kappa.vercel.app' : 'http://127.0.0.1:3100';
const privateLogin = readFileSync('.local/operator-login.txt', 'utf8');
const email = privateLogin.match(/^Email: (.+)$/m)?.[1],
  password = privateLogin.match(/^Password: (.+)$/m)?.[1];
assert(email && password);
const prefix = 'smoke-accounts-' + randomBytes(8).toString('hex');
const fixturePassword = randomBytes(20).toString('base64url');
const emails = [prefix + '-a@example.invalid', prefix + '-b@example.invalid'];
const created = [];
const createdIds = [];
let owner = '',
  checks = 0;
function check(condition, label) {
  assert(condition, label);
  checks++;
}
async function call(path, body, cookie = '', origin = base) {
  return fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(60000),
  });
}
function cookie(response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}
async function cleanup() {
  if (!created.length) return;
  const config = parse(readFileSync(live ? '.env.deployment.local' : '.env.test.local'));
  const url = new URL(
    live ? config.DATABASE_URL_UNPOOLED || config.DATABASE_URL : config.TEST_DATABASE_URL,
  );
  if (
    !url.hostname.endsWith('.neon.tech') ||
    url.pathname !== (live ? '/neondb' : '/aidirect_test') ||
    created.some((e) => !/^smoke-accounts-[a-f0-9]{16}-[ab]@example\.invalid$/.test(e))
  )
    throw new Error('Cleanup target rejected');
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      'SELECT id FROM "User" WHERE email=ANY($1::text[]) FOR UPDATE',
      [created],
    );
    const ids = rows.rows.map((r) => r.id);
    if (ids.length > 2) throw new Error();
    await client.query('DELETE FROM "Workspace" WHERE "ownerId"=ANY($1::text[])', [ids]);
    await client.query('DELETE FROM "AdminAudit" WHERE "targetId"=ANY($1::text[])', [createdIds]);
    await client.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [ids]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
try {
  for (const path of [
    '/api/customer',
    '/api/customer/catalog',
    '/api/admin/users',
    '/api/admin/summary',
  ])
    check((await call(path)).status === 401, 'Anonymous denied');
  check(
    (
      await call('/api/auth/sign-up/email', {
        email: emails[0],
        name: 'ساختگی',
        password: fixturePassword,
        platformRole: 'SENIOR_ADMIN',
      })
    ).status === 400,
    'Self-promotion input rejected',
  );
  check(
    (await call('/api/auth/sign-up/email', {}, '', 'https://attacker.invalid')).status === 403,
    'Signup CSRF rejected',
  );
  let response = await call('/api/account/login', { email, password });
  if (response.status === 429) {
    await new Promise((r) => setTimeout(r, 3500));
    response = await call('/api/account/login', { email, password });
  }
  check(response.status === 200, 'Requested owner login works');
  owner = cookie(response);
  check((await response.json()).destination === '/admin', 'Owner route');
  const signupA = await call('/api/auth/sign-up/email', {
    email: emails[0],
    password: fixturePassword,
    name: 'فروشگاه آزمایشی الف',
  });
  check(signupA.status === 200, 'Customer A registration');
  created.push(emails[0]);
  createdIds.push((await signupA.json()).user.id);
  const a = cookie(signupA);
  check(signupA.headers.get('set-cookie')?.includes('HttpOnly'), 'Customer cookie HttpOnly');
  if (live) check(signupA.headers.get('set-cookie')?.includes('Secure'), 'Customer cookie Secure');
  const signupB = await call('/api/auth/sign-up/email', {
    email: emails[1],
    password: fixturePassword,
    name: 'فروشگاه آزمایشی ب',
  });
  check(signupB.status === 200, 'Customer B registration');
  created.push(emails[1]);
  createdIds.push((await signupB.json()).user.id);
  const b = cookie(signupB);
  const summaryA = await call('/api/customer', undefined, a),
    summaryB = await call('/api/customer', undefined, b);
  check(summaryA.status === 200 && summaryB.status === 200, 'Customer dashboards');
  const da = await summaryA.json(),
    db = await summaryB.json();
  check(da.workspace.id !== db.workspace.id, 'Separate workspace IDs');
  check(
    !da.user.emailVerified && !da.instagramConnected && !da.sendingEnabled,
    'No false email or Instagram proof',
  );
  check(
    (await call('/api/customer/catalog?workspace=' + db.workspace.id, undefined, a)).status === 403,
    'Cross-workspace read denied',
  );
  check(
    (
      await call(
        '/api/customer/catalog',
        {
          workspaceId: db.workspace.id,
          action: 'page',
          data: { name: 'غیرمجاز', handle: 'not_owned' },
        },
        a,
      )
    ).status === 403,
    'Cross-workspace mutation denied',
  );
  const catalog = await call('/api/customer/catalog', undefined, a);
  check(catalog.status === 200, 'Scoped catalog');
  const cat = await catalog.json();
  check(cat.workspace.id === da.workspace.id, 'Catalog uses customer identity');
  const page = await call(
    '/api/customer/catalog',
    { action: 'page', data: { name: 'پیج آزمایشی', handle: 'synthetic_store' } },
    a,
  );
  check(page.status === 200, 'Customer page saved');
  const pageData = await page.json();
  check(
    (
      await call(
        '/api/customer/catalog',
        {
          action: 'product',
          data: {
            pageId: pageData.id,
            name: 'محصول ساختگی',
            description: 'فقط تست HTTP',
            category: 'تست',
            priceToman: '29000000',
            stock: 1,
            active: true,
            url: 'https://example.com/test',
          },
        },
        a,
      )
    ).status === 200,
    'Customer product saved',
  );
  const bCatalog = await call('/api/customer/catalog', undefined, b);
  check((await bCatalog.json()).products.length === 0, 'Other customer sees no products');
  for (const path of ['/api/admin/users', '/api/admin/summary', '/api/proof', '/api/sendbox'])
    check(
      [401, 403].includes((await call(path, undefined, a)).status),
      'Customer cannot enter operator APIs',
    );
  const users = await call('/api/admin/users?q=' + encodeURIComponent(emails[0]), undefined, owner);
  check(users.status === 200, 'Owner user search');
  const userList = await users.json();
  check(userList.users.length === 1, 'User filter exact fixture');
  const id = userList.users[0].id;
  check(
    (
      await call(
        '/api/admin/users',
        { action: 'role', id, role: 'SENIOR_ADMIN', password: 'incorrect-fixture-password' },
        owner,
      )
    ).status === 403,
    'Role changes require current owner password',
  );
  check(
    (await call('/api/admin/users', { action: 'role', id, role: 'SENIOR_ADMIN', password }, owner))
      .status === 200,
    'Owner promotes senior',
  );
  check(
    (await call('/api/customer', undefined, a)).status === 401,
    'Old session revoked on role change',
  );
  response = await call('/api/account/login', { email: emails[0], password: fixturePassword });
  check(response.status === 200, 'Senior login');
  const senior = cookie(response);
  check((await response.json()).destination === '/admin/users', 'Senior route');
  const seniorOverview = await call('/api/admin/users', undefined, senior);
  check(seniorOverview.status === 200, 'Senior read permission');
  const seniorData = await seniorOverview.json();
  check(
    seniorData.role === 'SENIOR_ADMIN' && seniorData.audit.length === 0,
    'Senior receives limited role',
  );
  check(
    (await call('/api/admin/users', { action: 'suspend', id, suspended: true, password }, senior))
      .status === 403,
    'Senior cannot modify access',
  );
  check(
    (await call('/api/admin/users', { action: 'suspend', id, suspended: true, password }, owner))
      .status === 200,
    'Owner suspension',
  );
  check(
    (await call('/api/admin/users', undefined, senior)).status === 401,
    'Suspension removes privileged session',
  );
  check((await call('/api/auth/sign-out', {}, b)).status === 200, 'Customer logout');
  check(
    (await call('/api/customer', undefined, b)).status === 401,
    'Logout revokes customer access',
  );
  response = await call('/api/account/login', { email: emails[1], password: fixturePassword });
  check(response.status === 200, 'Customer signs in after logout');
  let activeB = cookie(response);
  response = await call('/api/customer/account', undefined, activeB);
  check(response.status === 200, 'Customer exports own account');
  const exported = await response.json();
  check(
    exported.account.email === emails[1] && !JSON.stringify(exported).includes(emails[0]),
    'Export excludes other customer',
  );
  check(
    !/password|accessToken|sessionToken/i.test(JSON.stringify(exported)),
    'Export excludes credentials',
  );
  check(
    (
      await call(
        '/api/auth/change-password',
        {
          currentPassword: 'incorrect-fixture-password',
          newPassword: fixturePassword + 'new',
          revokeOtherSessions: true,
        },
        activeB,
      )
    ).status !== 200,
    'Password change requires current password',
  );
  const nextPassword = randomBytes(20).toString('base64url');
  response = await call(
    '/api/auth/change-password',
    { currentPassword: fixturePassword, newPassword: nextPassword, revokeOtherSessions: true },
    activeB,
  );
  check(response.status === 200, 'Customer changes password');
  activeB = cookie(response) || activeB;
  check(
    (await call('/api/account/login', { email: emails[1], password: fixturePassword })).status ===
      401,
    'Old customer password rejected',
  );
  check(
    (
      await call(
        '/api/customer/account',
        { action: 'delete_account', confirmation: 'incorrect', password: nextPassword },
        activeB,
      )
    ).status === 400,
    'Deletion requires explicit confirmation',
  );
  check(
    (
      await call(
        '/api/customer/account',
        {
          action: 'delete_account',
          confirmation: 'حذف حساب',
          password: 'incorrect-fixture-password',
        },
        activeB,
      )
    ).status === 403,
    'Deletion requires current password',
  );
  check(
    (
      await call(
        '/api/customer/account',
        { action: 'delete_account', confirmation: 'حذف حساب', password: nextPassword },
        activeB,
      )
    ).status === 200,
    'Customer deletes owned account and catalog',
  );
  check(
    (await call('/api/customer', undefined, activeB)).status === 401,
    'Deleted session rejected',
  );
  check(
    (await call('/api/customer', undefined, a)).status === 401,
    'Unrelated suspended account remains revoked',
  );
  for (const path of ['/signup', '/login', '/dashboard', '/dashboard/settings']) {
    const r = await call(path);
    check(r.status === 200, 'Entry page renders');
    check(r.headers.get('x-robots-tag')?.includes('noindex'), 'Account pages not indexed');
  }
  console.log(
    JSON.stringify({
      checks,
      result: 'passed',
      scope: live
        ? 'HTTPS signup, owner/senior/customer permissions, tenant isolation and session revocation; disposable fixtures removed'
        : 'isolated test DB HTTP account lifecycle and role boundaries',
    }),
  );
} catch {
  console.error(
    `Account checks failed after ${checks} checks. No credentials or session tokens printed.`,
  );
  process.exitCode = 1;
} finally {
  await cleanup();
  if (owner) await call('/api/proof', { action: 'logout' }, owner).catch(() => {});
}
