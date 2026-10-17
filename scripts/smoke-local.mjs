import assert from 'node:assert/strict';
const base = process.env.APP_BASE_URL;
assert.equal(base, 'http://localhost:3000');
assert.equal(process.env.META_ADAPTER, 'simulated');
assert.equal(process.env.REAL_SEND_ENABLED, 'false');
let cookie = '';
async function call(path, body, origin = base) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}
assert.equal((await call('/api/proof')).status, 401);
assert.equal((await call('/api/proof', { action: 'media' })).status, 401);
assert.equal(
  (await call('/api/proof/session', { secret: 'fixture-invalid' }, 'https://untrusted.example'))
    .status,
  403,
);
const login = await call('/api/proof/session', { secret: process.env.PROOF_ADMIN_SECRET });
assert.equal(login.status, 200);
const setCookie = login.headers.get('set-cookie');
assert(setCookie.includes('HttpOnly'));
cookie = setCookie.split(';')[0];
assert.equal((await call('/api/proof', { action: 'simulation_setup' })).status, 200);
const media = await (await call('/api/proof', { action: 'media' })).json();
assert.equal(media.media[0].id, '90002');
assert.equal(
  (
    await call('/api/proof', {
      action: 'rule',
      rule: {
        mediaId: '999',
        keyword: 'لینک',
        replyText: 'reply',
        link: 'https://example.com',
        enabled: true,
      },
    })
  ).status,
  400,
);
assert.equal(
  (await call('/api/proof', { action: 'simulation_comment' }, 'https://untrusted.example')).status,
  403,
);
assert.equal((await call('/api/proof', { action: 'simulation_comment' })).status, 200);
let report;
for (let i = 0; i < 30; i++) {
  report = await (await call('/api/proof')).json();
  if (report.deliveries.some((d) => d.status === 'simulated')) break;
  await new Promise((r) => setTimeout(r, 500));
}
assert.equal(report.deliveries.length, 1);
assert.equal(report.deliveries[0].provider, 'simulated');
assert.equal(report.deliveries[0].status, 'simulated');
assert(!JSON.stringify(report).includes('tokenCipher'));
assert(!JSON.stringify(report).includes('replyCipher'));
assert(!JSON.stringify(report).includes(process.env.PROOF_ADMIN_SECRET));
assert.equal((await call('/api/proof', { action: 'simulation_comment' })).status, 200);
report = await (await call('/api/proof')).json();
assert.equal(report.deliveries.length, 1);
assert.equal((await call('/api/health')).status, 200);
assert.equal((await call('/api/proof', { action: 'logout' })).status, 200);
console.log(
  'Local HTTP smoke passed: operator auth, CSRF, media ownership, simulated queue, deduplication, secret omission, DB/worker health. No Meta calls or real messages.',
);
