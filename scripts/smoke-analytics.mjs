import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import pg from 'pg';
const live = process.argv.includes('--live'),
  ai = process.argv.includes('--ai-synthetic');
const base = live ? 'https://aidirect-kappa.vercel.app' : 'http://127.0.0.1:3100';
const prefix = 'smoke-insights-' + randomBytes(8).toString('hex'),
  emails = [prefix + '-a@example.invalid', prefix + '-b@example.invalid'],
  password = randomBytes(20).toString('base64url');
const created = [];
let checks = 0;
function check(value, label) {
  assert(value, label);
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
    signal: AbortSignal.timeout(45000),
  });
}
function cookies(r) {
  return r.headers
    .getSetCookie()
    .map((s) => s.split(';')[0])
    .join('; ');
}
async function cleanup() {
  if (!created.length) return;
  const env = parse(readFileSync(live ? '.env.deployment.local' : '.env.test.local'));
  const url = new URL(live ? env.DATABASE_URL_UNPOOLED || env.DATABASE_URL : env.TEST_DATABASE_URL);
  if (
    !url.hostname.endsWith('.neon.tech') ||
    url.pathname !== (live ? '/neondb' : '/aidirect_test') ||
    created.some((e) => !/^smoke-insights-[a-f0-9]{16}-[ab]@example\.invalid$/.test(e))
  )
    throw new Error('Cleanup rejected');
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id FROM "User" WHERE email=ANY($1::text[]) FOR UPDATE',
      [created],
    );
    const ids = result.rows.map((r) => r.id);
    assert(ids.length <= 2);
    await client.query('DELETE FROM "Workspace" WHERE "ownerId"=ANY($1::text[])', [ids]);
    await client.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [ids]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}
try {
  check((await call('/api/customer/analytics')).status === 401, 'Anonymous denied');
  const sessions = [];
  for (const email of emails) {
    const r = await call('/api/auth/sign-up/email', {
      name: 'فروشگاه ساختگی آزمون آمار',
      email,
      password,
    });
    check(r.status === 200, 'Fixture signup');
    created.push(email);
    sessions.push(cookies(r));
  }
  const [a, b] = sessions;
  let response = await call('/api/customer/analytics?days=7', undefined, a);
  check(response.status === 200, 'Customer analytics');
  const first = await response.json();
  check(first.source === 'database' && first.metrics.products === 0, 'Empty catalog exact count');
  check(
    first.timeline.length === 7 && first.timeline.every((d) => d.count === 0),
    'Real empty daily series',
  );
  check(
    first.messaging.revenueToman === null && first.messaging.privateReplies === null,
    'Unavailable sales are not zero',
  );
  check(
    first.suggestions.some((s) => s.id === 'add_products'),
    'Empty catalog recommendation',
  );
  response = await call('/api/customer/analytics', undefined, b);
  const other = await response.json();
  check(other.workspace.id !== first.workspace.id, 'Separate analytics workspaces');
  check(
    (await call('/api/customer/analytics?workspace=' + other.workspace.id, undefined, a)).status ===
      403,
    'Cross-tenant metrics denied',
  );
  check(
    (await call('/api/admin/analytics', undefined, a)).status === 401,
    'Customer denied owner analytics',
  );
  check(
    (await call('/api/customer/analytics?days=365', undefined, a)).status === 400,
    'Unsupported period rejected',
  );
  check(
    (await call('/api/customer/analytics', { consent: false }, a)).status === 400,
    'External call requires explicit consent',
  );
  check(
    (await call('/api/customer/analytics', { consent: true }, a, 'https://attacker.invalid'))
      .status === 403,
    'AI CSRF rejected',
  );
  const page = await call(
    '/api/customer/catalog',
    { action: 'page', data: { name: 'ساختگی', handle: 'insights_test' } },
    a,
  );
  check(page.status === 200, 'Fixture page');
  const p = await page.json();
  check(
    (
      await call(
        '/api/customer/catalog',
        {
          action: 'product',
          data: {
            pageId: p.id,
            name: 'محصول ساختگی آزمون',
            description: '',
            category: 'دسته ساختگی',
            priceToman: '29000000',
            stock: 2,
            active: true,
            url: 'https://example.com/synthetic',
          },
        },
        a,
      )
    ).status === 200,
    'Fixture product',
  );
  const report = await (await call('/api/customer/analytics?days=30', undefined, a)).json();
  check(report.metrics.products === 1 && report.metrics.available === 1, 'Product metrics');
  check(report.metrics.inventoryValueToman === '58000000', 'Exact bigint inventory value');
  check(
    report.metrics.lowStock === 1 && report.metrics.missingDescription === 1,
    'Quality counters',
  );
  check(
    report.suggestions.some((s) => s.id === 'description') &&
      report.suggestions.some((s) => s.id === 'post_mapping'),
    'Actionable catalog suggestions',
  );
  check(report.timeline.length === 30, 'Period change');
  check(
    (await (await call('/api/customer/analytics', undefined, b)).json()).metrics.products === 0,
    'Other tenant unaffected',
  );
  if (ai) {
    response = await call('/api/customer/analytics', { consent: true, days: '30' }, a);
    const output = await response.json();
    writeFileSync(
      '.local/analytics-ai-evidence.json',
      JSON.stringify(
        {
          httpStatus: response.status,
          source: output.source,
          provider: output.provider,
          model: output.model,
          generatedAt: output.generatedAt,
          error: output.error,
          providerStatus: output.providerStatus,
          failureKind: output.failureKind,
          mode: output.mode,
          scope: 'synthetic_fixture_aggregate_only',
        },
        null,
        2,
      ),
    );
    check(
      response.status === 200 &&
        output.source === 'external_ai' &&
        output.mode === 'ai_prioritized_rules' &&
        output.focus.length > 0,
      'Real provider analysis',
    );
  } else if (report.ai.mode === 'disabled')
    check(
      (await call('/api/customer/analytics', { consent: true }, a)).status === 409,
      'Disabled provider clearly unavailable',
    );
  for (const path of ['/dashboard/analytics', '/admin/analytics']) {
    response = await call(path);
    check(response.status === 200, 'Page renders');
    check(response.headers.get('x-robots-tag')?.includes('noindex'), 'Private analytics noindex');
    check(
      response.headers.get('cache-control')?.includes('no-store'),
      'Private analytics not cached',
    );
  }
  console.log(
    JSON.stringify({
      checks,
      result: 'passed',
      scope: live
        ? 'HTTPS tenant-scoped analytics and catalog advice'
        : 'isolated local HTTP analytics',
      realAiCalled: ai,
    }),
  );
} catch {
  console.error('Analytics smoke failed after ' + checks + ' checks; no credentials printed.');
  process.exitCode = 1;
} finally {
  await cleanup();
}
