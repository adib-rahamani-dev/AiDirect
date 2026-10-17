import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';

const release = JSON.parse(readFileSync('.local/release.json', 'utf8'));
const base = release.url;
const parsed = new URL(base);
assert.equal(parsed.protocol, 'https:');
assert(parsed.hostname.endsWith('.vercel.app'));
assert.equal(release.project, 'aidirect');
const credentials = readFileSync('.local/operator-login.txt', 'utf8');
const email = credentials.match(/^Email: (.+)$/m)?.[1];
const password = credentials.match(/^Password: (.+)$/m)?.[1];
assert(email && password && process.env.CRON_SECRET);
let cookie = '';
let checks = 0;
async function call(path, body, options = {}) {
  const send = () =>
    fetch(base + path, {
      method: options.method ?? (body ? 'POST' : 'GET'),
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
        ...options.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(70000),
    });
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch {
      if (body || attempt >= 2)
        throw new Error(
          'Request failed at ' +
            path +
            ' after ' +
            checks +
            ' checks; write requests are not blindly retried.',
        );
      await pause(1000);
    }
  }
}
function status(response, expected) {
  assert.equal(response.status, expected);
  checks++;
}
for (const path of ['/', '/guide', '/privacy', '/data-deletion', '/connect'])
  status(await call(path), 200);
status(await call('/api/proof'), 401);
status(await call('/api/proof', { action: 'media' }), 401);
status(
  await call(
    '/api/proof/session',
    { email, password },
    { headers: { Origin: 'https://untrusted.example' } },
  ),
  403,
);
status(await call('/api/jobs/run', {}, {}), 401);
status(
  await call(
    '/api/meta/webhook',
    {},
    { headers: { 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) } },
  ),
  process.env.META_WEBHOOK_APP_SECRET || process.env.INSTAGRAM_APP_SECRET ? 403 : 503,
);
let login = await call('/api/proof/session', { email, password });
if (login.status === 429) {
  await pause(3500);
  login = await call('/api/proof/session', { email, password });
}
status(login, 200);
const session = login.headers.get('set-cookie');
assert(session?.includes('HttpOnly') && session.includes('Secure'));
checks++;
cookie = session.split(';')[0];
console.log('Public pages, access control, CSRF, worker authentication and operator login passed.');
const configuration = await (await call('/api/proof')).json();
assert.equal(configuration.config.provider, 'simulated');
assert.equal(configuration.config.realSendEnabled, false);
checks += 2;
status(await call('/api/proof', { action: 'simulation_setup' }), 200);
const media = await (await call('/api/proof', { action: 'media' })).json();
assert.equal(media.media[0].id, '90002');
checks++;
status(
  await call('/api/proof', {
    action: 'rule',
    rule: {
      mediaId: '999',
      keyword: 'لینک',
      replyText: 'test',
      link: 'https://example.com',
      enabled: true,
    },
  }),
  400,
);
status(
  await call(
    '/api/proof',
    { action: 'simulation_comment' },
    { headers: { Origin: 'https://untrusted.example' } },
  ),
  403,
);
status(await call('/api/proof', { action: 'simulation_comment' }), 200);
status(
  await call(
    '/api/jobs/run',
    {},
    { headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET } },
  ),
  200,
);
const report = await (await call('/api/proof')).json();
assert.equal(report.deliveries.length, 1);
assert.equal(report.deliveries[0].status, 'simulated');
checks += 2;
for (const forbidden of ['tokenCipher', 'replyCipher', password, process.env.CRON_SECRET]) {
  assert(!JSON.stringify(report).includes(forbidden));
  checks++;
}
status(await call('/api/proof', { action: 'simulation_comment' }), 200);
const duplicate = await (await call('/api/proof')).json();
assert.equal(duplicate.deliveries.length, 1);
checks++;
status(await call('/api/health'), 200);
console.log(
  'Simulated cloud queue, deduplication, secret omission and database/worker health passed.',
);

// Seed only test invitation records, never a Meta token. The deployed adapter remains simulated.
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
  connectionTimeoutMillis: 20000,
  query_timeout: 15000,
});
const token = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(token).digest('hex');
const operatorCookie = cookie;
try {
  await client.connect();
  await client.query('INSERT INTO "ConnectionInvite" ("tokenHash","expiresAt") VALUES ($1,$2)', [
    hash,
    new Date(Date.now() + 60000),
  ]);
  cookie = '';
  const invitation = await call('/api/meta/invitation', { action: 'redeem', token });
  status(invitation, 200);
  const limitedCookie = invitation.headers.get('set-cookie');
  assert(limitedCookie?.includes('HttpOnly'));
  checks++;
  cookie = limitedCookie.split(';')[0];
  status(await call('/api/proof'), 401);
  status(await call('/api/proof', { action: 'media' }), 401);
  status(await call('/api/meta/invitation', { action: 'redeem', token }), 410);
  status(await call('/api/meta/invitation'), 200);
} finally {
  await client.query('DELETE FROM "ConnectionInvite" WHERE "tokenHash"=$1', [hash]).catch(() => {});
  await client.end();
  cookie = operatorCookie;
}
status(await call('/api/proof', { action: 'purge' }), 400);
status(await call('/api/proof', { action: 'purge', confirm: 'DELETE' }), 200);
const purged = await (await call('/api/proof')).json();
assert.equal(purged.connection, null);
assert.equal(purged.rule, null);
assert.equal(purged.deliveries.length, 0);
checks += 3;
// Restore a clearly marked simulated example for the owner's first visit.
status(await call('/api/proof', { action: 'simulation_setup' }), 200);
status(await call('/api/proof', { action: 'simulation_comment' }), 200);
status(
  await call(
    '/api/jobs/run',
    {},
    { headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET } },
  ),
  200,
);
status(await call('/api/proof', { action: 'logout' }), 200);
// Deliberately replay the old signed cookie: logout must revoke it server-side.
status(await call('/api/proof'), 401);
console.log(
  'Deployment HTTP smoke passed: ' +
    checks +
    ' checks; real Meta connection and messages were not tested.',
);
