import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.argv.includes('--local')
  ? 'http://127.0.0.1:3100'
  : 'https://aidirect-kappa.vercel.app';
const secret = readFileSync('.local/operator-login.txt', 'utf8');
const email = secret.match(/^Email: (.+)$/m)?.[1],
  password = secret.match(/^Password: (.+)$/m)?.[1];
assert(email && password);
let cookie = '',
  checks = 0;
function check(value, label) {
  assert(value, label);
  checks++;
}
async function request(path, body, session = cookie, origin = base) {
  return fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(45000),
    headers: {
      ...(session ? { Cookie: session } : {}),
      ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
try {
  for (const path of ['/api/catalog', '/api/admin/operations'])
    check((await request(path)).status === 401, 'Anonymous API rejected');
  check(
    (await request('/api/catalog', { action: 'product' }, '', 'https://attacker.example'))
      .status === 403,
    'CSRF rejected',
  );
  let login = await request('/api/proof/session', { email, password });
  if (login.status === 429) {
    await new Promise((r) => setTimeout(r, 3500));
    login = await request('/api/proof/session', { email, password });
  }
  check(login.status === 200, 'Operator login succeeded');
  cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  for (const path of ['/admin/catalog', '/admin/operations']) {
    const response = await request(path);
    check(response.status === 200, 'Private page renders');
    check(response.headers.get('x-robots-tag')?.includes('noindex'), 'Private page not indexed');
    check(response.headers.get('cache-control')?.includes('no-store'), 'Private page not cached');
  }
  let response = await request('/api/catalog');
  check(response.status === 200, 'Catalog available');
  const data = await response.json();
  check(
    data.mode === 'catalog_preview' && data.sendingEnabled === false,
    'Explicit catalog-only mode',
  );
  check(
    !JSON.stringify(data).includes('password') && !JSON.stringify(data).includes('tokenCipher'),
    'No authentication secrets',
  );
  check(
    (await request('/api/catalog?workspace=unowned-catalog')).status === 403,
    'Forged workspace rejected',
  );
  check(
    (
      await request('/api/catalog', {
        workspaceId: 'unowned-catalog',
        action: 'pause',
        paused: true,
      })
    ).status === 403,
    'Forged mutation rejected',
  );
  for (const path of ['/api/catalog?format=csv', '/api/admin/operations?format=csv']) {
    response = await request(path);
    check(response.status === 200, 'CSV available to operator');
    check(response.headers.get('content-type')?.includes('text/csv'), 'CSV MIME');
    check(response.headers.get('cache-control')?.includes('no-store'), 'CSV private');
  }
  check(
    (await request('/api/admin/operations?status=invalid')).status === 400,
    'Invalid report filter rejected',
  );
  check((await request('/api/admin/operations?days=9000')).status === 400, 'Report bounded');
  response = await request('/api/admin/operations?days=7');
  check(response.status === 200, 'Report filters available');
  const report = await response.json();
  check(report.scope === 'operator_proof_only', 'Report not represented as customer tenancy');
  check(
    report.deliveries.every((d) => !('replyCipher' in d) && !('commentId' in d)),
    'Minimal delivery metadata',
  );
  console.log(
    JSON.stringify({
      checks,
      result: 'passed',
      scope:
        'authenticated catalog/report HTTP, CSV, role boundary, CSRF; read-only production data; no provider sends',
    }),
  );
} catch {
  console.error(`Catalog HTTP check failed after ${checks} checks; credentials omitted.`);
  process.exitCode = 1;
} finally {
  if (cookie) await request('/api/proof', { action: 'logout' }).catch(() => {});
}
