import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';

// Explicit fixed targets prevent sending operator credentials to an arbitrary host.
const local = process.argv.includes('--local');
const createShare = process.argv.includes('--create-share');
const base = local ? 'http://127.0.0.1:3100' : 'https://aidirect-kappa.vercel.app';
const credentials = readFileSync('.local/operator-login.txt', 'utf8');
const email = credentials.match(/^Email: (.+)$/m)?.[1];
const password = credentials.match(/^Password: (.+)$/m)?.[1];
assert(email && password);
let manager = '',
  checks = 0;
function check(condition, label) {
  assert(condition, label);
  checks++;
}
async function call(path, body, cookie = '') {
  try {
    return await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { Origin: base, 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new Error(`Admin smoke transport failed after ${checks} checks; no credentials logged`);
  }
}
function status(response, expected) {
  check(response.status === expected, `Unexpected HTTP status after ${checks} checks`);
}
async function makeInvite() {
  if (local) {
    const env = parse(readFileSync('.env.test.local'));
    const url = new URL(env.TEST_DATABASE_URL);
    if (url.pathname !== '/aidirect_test' || !url.hostname.endsWith('.neon.tech'))
      throw new Error('Isolated fixture database required');
    process.env.DATABASE_URL = url.toString();
    process.env.DATABASE_URL_UNPOOLED = url.toString();
    const { createSendboxInvite } = await import('../src/lib/sendbox-invites.ts');
    const row = await createSendboxInvite();
    return {
      id: row.id,
      expiresAt: row.expiresAt.toISOString(),
      url: `${base}/connect/instagram#token=${row.token}`,
    };
  }
  const response = await call('/api/sendbox/invite', { action: 'create' }, manager);
  status(response, 200);
  return response.json();
}
try {
  let r = await call('/admin');
  status(r, 200);
  check(
    (await r.text()).includes('id="access-email"'),
    'Admin must render login without a session',
  );
  r = await call('/connect/instagram');
  status(r, 200);
  for (const path of ['/api/admin', '/api/sendbox', '/api/sendbox/invite'])
    status(await call(path), 401);
  status(await call('/api/sendbox/invite', { action: 'create' }), 401);
  r = await fetch(base + '/api/sendbox/invite', {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: '{"action":"redeem","token":"invalid"}',
    redirect: 'manual',
  });
  status(r, 403);
  r = await call('/api/proof/session', { email, password });
  if (r.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 3500));
    r = await call('/api/proof/session', { email, password });
  }
  status(r, 200);
  const cookieHeader = r.headers.get('set-cookie') ?? '';
  check(
    cookieHeader.includes('HttpOnly') && /SameSite=lax/i.test(cookieHeader),
    'Operator cookie protections',
  );
  if (!local) check(cookieHeader.includes('Secure'), 'HTTPS cookie must be Secure');
  manager = cookieHeader.split(';')[0];
  r = await call('/api/admin', undefined, manager);
  status(r, 200);
  const before = await r.json();
  check(before.sendingEnabled === false, 'Real sending remains disabled');
  check(
    !JSON.stringify(before).includes('tokenHash') && !JSON.stringify(before).includes('claimHash'),
    'Dashboard excludes grant secrets',
  );
  if (before.connection)
    throw new Error(
      'Existing account preserved: invitation creation requires an empty connection slot',
    );
  const invite = await makeInvite();
  const url = new URL(invite.url);
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  check(
    url.origin === base && url.pathname === '/connect/instagram' && /^[\w-]{43}$/.test(token ?? ''),
    'Application-owned fragment invitation URL',
  );
  check(
    Date.parse(invite.expiresAt) > Date.now() &&
      Date.parse(invite.expiresAt) <= Date.now() + 2 * 3600_000 + 10000,
    'Bounded two-hour expiry',
  );
  r = await call('/api/sendbox/invite', { action: 'redeem', token });
  status(r, 200);
  const grantHeader = r.headers.get('set-cookie') ?? '';
  const guest = grantHeader.split(';')[0];
  check(
    guest.startsWith('aidirect_sendbox_invite=') && !guest.startsWith('aidirect_proof='),
    'Guest receives a scoped grant only',
  );
  check(
    grantHeader.includes('HttpOnly') && /SameSite=lax/i.test(grantHeader),
    'Guest cookie protections',
  );
  if (!local) check(grantHeader.includes('Secure'), 'HTTPS guest cookie must be Secure');
  r = await call('/api/sendbox/invite', undefined, guest);
  status(r, 200);
  const granted = await r.json();
  check(
    granted.role === 'owner' && granted.status === 'ready',
    'Claimed owner can start connection',
  );
  for (const path of ['/api/admin', '/api/sendbox', '/api/proof'])
    status(await call(path, undefined, guest), 401);
  status(await call('/api/sendbox/invite', { action: 'create' }, guest), 401);
  status(await call('/api/sendbox/invite', { action: 'revoke', id: invite.id }, guest), 401);
  status(await call('/api/sendbox/invite', { action: 'redeem', token }), 410);
  status(await call('/api/sendbox/invite', undefined, guest + 'tampered'), 401);
  if (!local) {
    r = await call('/api/sendbox/connect', undefined, guest);
    status(r, 307);
    const login = new URL(r.headers.get('location'));
    check(
      login.origin === 'https://api.sendbox.chat' && login.pathname === '/instagram-oauth',
      'Owner OAuth uses allowlisted provider',
    );
    const state = login.searchParams.get('id');
    check(/^[\w-]{43}$/.test(state ?? ''), 'OAuth state present');
    const stateCookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
    r = await call(
      `/api/sendbox/callback?id=${encodeURIComponent(state)}&status=success&account_id=00000000-0000-4000-8000-00000000dead`,
      undefined,
      guest + '; ' + stateCookie,
    );
    status(r, 307);
    const rejected = new URL(r.headers.get('location'));
    check(
      rejected.pathname === '/connect/instagram' &&
        rejected.searchParams.get('result') === 'connection_failed',
      'Unowned callback account rejected',
    );
    r = await call('/api/admin', undefined, manager);
    status(r, 200);
    check((await r.json()).connection === null, 'Forged callback creates no connection');
  }
  status(await call('/api/sendbox/invite', { action: 'revoke', id: invite.id }, manager), 200);
  status(await call('/api/sendbox/invite', undefined, guest), 401);
  r = await call('/api/sendbox/connect', undefined, guest);
  status(r, 307);
  check(
    new URL(r.headers.get('location')).pathname === '/connect/instagram',
    'Revoked grant cannot reach provider',
  );
  if (createShare) {
    const share = await makeInvite();
    writeFileSync(
      local ? '.local/sendbox-local-invite.json' : '.local/sendbox-owner-invite.json',
      JSON.stringify(share, null, 2) + '\n',
    );
    check(true, 'Fresh invitation saved privately, not redeemed');
  }
  console.log(
    JSON.stringify({
      checks,
      result: 'passed',
      scope: local
        ? 'isolated test DB grant HTTP checks; local creation fixture, no provider OAuth'
        : 'HTTPS manager/owner isolation, one-use invitation, revocation and rejected unowned callback; no Instagram login or sending',
    }),
  );
} finally {
  if (manager) await call('/api/proof', { action: 'logout' }, manager);
  if (local) {
    const { db } = await import('../src/lib/db.ts');
    await db.$disconnect();
  }
}
