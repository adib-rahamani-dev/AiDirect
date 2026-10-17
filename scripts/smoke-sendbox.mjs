import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { createHmac, randomUUID } from 'node:crypto';
const base = 'https://aidirect-kappa.vercel.app';
const secrets = parse(readFileSync('.env.sendbox.local'));
const credentials = readFileSync('.local/operator-login.txt', 'utf8');
const email = credentials.match(/^Email: (.+)$/m)?.[1];
const password = credentials.match(/^Password: (.+)$/m)?.[1];
assert(email && password && secrets.SENDBOX_WEBHOOK_SECRET);
let cookie = '',
  checks = 0;
async function call(path, body, headers = {}) {
  try {
    return await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { Origin: base, 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new Error(
      `HTTP smoke transport failed at ${path.split('?')[0]} after ${checks} checks; no payload or secret logged`,
    );
  }
}
function status(r, expected) {
  assert.equal(r.status, expected, `Unexpected HTTP status after ${checks} checks`);
  checks++;
}
function noSecrets(body) {
  for (const secret of [
    secrets.SENDBOX_API_KEY,
    secrets.SENDBOX_WEBHOOK_SECRET,
    secrets.SENDBOX_OAUTH_URL,
  ])
    if (secret) assert.equal(body.includes(secret), false);
  checks++;
}
let r = await call('/sendbox');
status(r, 200);
noSecrets(await r.text());
status(await call('/api/sendbox'), 401);
status(await call('/api/sendbox', { action: 'inspect' }), 401);
status(
  await call('/api/sendbox', { action: 'inspect' }, { Origin: 'https://untrusted.example' }),
  403,
);
status(await call('/api/sendbox/webhook', {}), 401);
// The oversize stream is covered in the local handler test, avoiding a 1 MiB
// upload over the operator's network during the hosted connectivity check.
const raw = JSON.stringify({
  event_id: 'aidirect-synthetic-probe-' + randomUUID(),
  event_type: 'comments',
  account_id: '00000000-0000-4000-8000-00000000dead',
  data: {},
});
function signed(timestamp) {
  return {
    'X-BoxApi-Timestamp': timestamp,
    'X-BoxApi-Signature':
      'sha256=' +
      createHmac('sha256', secrets.SENDBOX_WEBHOOK_SECRET)
        .update(timestamp + '.' + raw)
        .digest('hex'),
  };
}
status(
  await call('/api/sendbox/webhook', raw, signed(String(Math.floor(Date.now() / 1000) - 900))),
  401,
);
r = await call('/api/sendbox/webhook', raw, signed(String(Math.floor(Date.now() / 1000))));
status(r, 200);
assert.equal(await r.text(), 'IGNORED');
checks++;
r = await call('/api/proof/session', { email, password });
if (r.status === 429) {
  await new Promise((resolve) => setTimeout(resolve, 3500));
  r = await call('/api/proof/session', { email, password });
}
status(r, 200);
cookie = r.headers.get('set-cookie')?.split(';')[0] ?? '';
assert(cookie);
checks++;
r = await call('/api/sendbox');
status(r, 200);
const text = await r.text();
noSecrets(text);
assert.equal(JSON.parse(text).configured, true);
assert.equal(JSON.parse(text).sendingEnabled, false);
checks += 2;
r = await call('/api/sendbox', { action: 'inspect' });
status(r, 200);
const inspectionText = await r.text();
noSecrets(inspectionText);
assert.equal(JSON.parse(inspectionText).configured, true);
checks++;
r = await call('/api/sendbox/connect');
status(r, 307);
const login = new URL(r.headers.get('location'));
assert.equal(login.origin, 'https://api.sendbox.chat');
assert.equal(login.pathname, '/instagram-oauth');
assert(login.searchParams.get('id'));
checks++;
r = await call(
  '/api/sendbox/callback?status=success&account_id=00000000-0000-4000-8000-00000000dead',
);
status(r, 307);
assert.equal(new URL(r.headers.get('location')).searchParams.get('result'), 'connection_failed');
checks++;
status(await call('/api/proof', { action: 'logout' }), 200);
status(await call('/api/sendbox'), 401);
console.log(
  JSON.stringify({
    checks,
    result: 'passed',
    scope:
      'HTTP authentication, provider read-only inspection, OAuth start/forged callback, signed synthetic foreign-account probe; no real Instagram event or message',
  }),
);
