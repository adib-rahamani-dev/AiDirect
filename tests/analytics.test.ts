import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import {
  analyticsSnapshot,
  calendarDays,
  catalogSuggestions,
  type AnalyticsSnapshot,
} from '../src/lib/analytics';
import { analysisFacts, generateCatalogAnalysis } from '../src/lib/analytics-ai';
import { POST } from '../src/app/api/customer/analytics/route';
if (new URL(process.env.DATABASE_URL!).pathname !== '/aidirect_test')
  throw new Error('Isolated DB required');
after(() => db.$disconnect());
const metrics = {
  products: 3,
  active: 2,
  available: 1,
  outOfStock: 1,
  lowStock: 1,
  missingDescription: 2,
  mapped: 2,
  inventoryValueToman: '58000000',
  minPriceToman: '29000000',
  maxPriceToman: '29000000',
};
function sample(): AnalyticsSnapshot {
  return {
    workspace: { id: 'private-workspace', name: 'نام خصوصی فروشگاه', paused: false },
    generatedAt: new Date().toISOString(),
    days: 7,
    timeZone: 'Asia/Tehran',
    source: 'database',
    metrics: { ...metrics, pages: 1, posts: 1 },
    timeline: calendarDays(7).map((day) => ({ day, count: 0 })),
    categories: [{ category: 'نام خصوصی دسته', products: 3, available: 1 }],
    suggestions: catalogSuggestions(metrics, false),
    messaging: {
      status: 'not_connected',
      comments: null,
      privateReplies: null,
      orders: null,
      revenueToman: null,
      conversionRate: null,
    },
  };
}
test('Analytics has scoped exact metrics, distinct post coverage, Tehran dates and missing sales rather than fake zeroes', async () => {
  const suffix = 'analytics-fixture-' + process.pid,
    a = suffix + '-a',
    b = suffix + '-b',
    user = suffix + '-user';
  async function cleanup() {
    await db.workspace.deleteMany({ where: { id: { in: [a, b] } } });
    await db.user.deleteMany({ where: { id: user } });
  }
  await cleanup();
  try {
    await db.user.create({ data: { id: user } });
    await db.workspace.create({
      data: { id: a, name: 'A', memberships: { create: { userId: user, role: 'OWNER' } } },
    });
    await db.workspace.create({ data: { id: b, name: 'B' } });
    const page = await db.catalogPage.create({
      data: { workspaceId: a, name: 'test', handle: 'test' },
    });
    const createdAt = new Date(calendarDays(1)[0] + 'T00:01:00+03:30');
    const values = {
      workspaceId: a,
      pageId: page.id,
      name: 'ساختگی',
      category: 'لپ‌تاپ',
      priceToman: 29000000n,
      stock: 2,
      description: 'توضیح محصول ساختگی به اندازه کافی طولانی است و اطلاعات محرمانه ندارد.',
      url: 'https://example.com/item',
      createdAt,
    };
    const p1 = await db.catalogProduct.create({ data: values });
    await db.catalogProduct.create({ data: { ...values, stock: 0, description: '' } });
    const p3 = await db.catalogProduct.create({
      data: { ...values, active: false, stock: 10, description: '', category: 'گوشی' },
    });
    for (const productId of [p1.id, p3.id])
      await db.mediaProduct.create({
        data: {
          workspaceId: a,
          pageId: page.id,
          productId,
          permalink: 'https://www.instagram.com/p/synthetic/',
        },
      });
    const report = await analyticsSnapshot(user, a, 7);
    assert.deepEqual(report.metrics, { ...metrics, pages: 1, posts: 1 });
    assert.equal(report.timeline.length, 7);
    assert.equal(report.timeline.at(-1)?.count, 3);
    assert.equal(report.categories[0].products, 2);
    assert.equal(report.messaging.revenueToman, null);
    assert.equal(report.messaging.privateReplies, null);
    await assert.rejects(() => analyticsSnapshot(user, b, 7), { message: 'forbidden' });
    assert(report.suggestions.some((s) => s.id === 'stock' && s.affected === 1));
    assert(!report.suggestions.some((s) => s.id === 'paused'));
  } finally {
    await cleanup();
  }
});
test('Tehran calendar crosses UTC midnight correctly and empty catalog gets a real next step', () => {
  assert.deepEqual(calendarDays(2, new Date('2026-10-18T21:31:00Z')), ['2026-10-18', '2026-10-19']);
  const suggestions = catalogSuggestions(
    {
      ...metrics,
      products: 0,
      active: 0,
      available: 0,
      outOfStock: 0,
      lowStock: 0,
      missingDescription: 0,
      mapped: 0,
    },
    false,
  );
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].id, 'add_products');
});
test('Analytics mutations reject a cross-site request before session/AI processing', async () => {
  const response = await POST(
    new Request('https://example.com/api/customer/analytics', {
      method: 'POST',
      headers: { Origin: 'https://attacker.invalid' },
      body: '{"consent":true}',
    }),
  );
  assert.equal(response.status, 403);
});
test('AI SDK adapter projects only counters, validates evidence, disables retries, and keeps provider failures generic', async () => {
  const key = process.env.GROQ_API_KEY,
    enabled = process.env.GROQ_CUSTOMER_ANALYSIS_ENABLED;
  let calls = 0;
  const good = {
    summary: 'موجودی و توضیح محصولات را پیش از تست پیشنهاد بررسی کن.',
    focus: [{ suggestionId: 'stock', reason: 'محصول ناموجود را اصلاح یا غیرفعال کن.' }],
  };
  const response = (output: unknown) =>
    Response.json({
      id: 'synthetic',
      created: 1,
      model: 'openai/gpt-oss-20b',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: JSON.stringify(output) },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    });
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(init?.redirect, 'error');
    const body = String(init?.body);
    assert(!body.includes('نام خصوصی'));
    assert(!body.includes('private-workspace'));
    assert(!body.includes('58000000'));
    return response(good);
  };
  try {
    process.env.GROQ_API_KEY = 'synthetic-test-key-only';
    process.env.GROQ_CUSTOMER_ANALYSIS_ENABLED = 'false';
    await assert.rejects(() => generateCatalogAnalysis(sample(), fetcher), {
      message: 'ai_not_configured',
    });
    assert.equal(calls, 0);
    process.env.GROQ_CUSTOMER_ANALYSIS_ENABLED = 'true';
    assert.equal(analysisFacts(sample()).canMeasureSales, false);
    const report = await generateCatalogAnalysis(sample(), fetcher);
    assert.equal(report.source, 'external_ai');
    assert.equal(calls, 1);
    await assert.rejects(
      () =>
        generateCatalogAnalysis(sample(), async () =>
          response({
            ...good,
            focus: [{ suggestionId: 'invented_sales', reason: 'not grounded' }],
          }),
        ),
      { message: 'ai_unavailable', failureKind: 'invalid_structure' },
    );
    await assert.rejects(
      () =>
        generateCatalogAnalysis(sample(), async () =>
          response({ ...good, summary: 'فروش ۹۰ درصد رشد کرد' }),
        ),
      { message: 'ai_unavailable', failureKind: 'ai_invalid_output' },
    );
    let rateCalls = 0;
    await assert.rejects(
      () =>
        generateCatalogAnalysis(sample(), async () => {
          rateCalls++;
          return Response.json({ error: { message: 'sensitive-provider-text' } }, { status: 429 });
        }),
      { message: 'ai_rate_limited' },
    );
    assert.equal(rateCalls, 1);
    await assert.rejects(
      () =>
        generateCatalogAnalysis(sample(), async () =>
          Response.json({ error: { message: 'sensitive-provider-text' } }, { status: 403 }),
        ),
      { message: 'ai_unavailable' },
    );
  } finally {
    if (key === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = key;
    if (enabled === undefined) delete process.env.GROQ_CUSTOMER_ANALYSIS_ENABLED;
    else process.env.GROQ_CUSTOMER_ANALYSIS_ENABLED = enabled;
  }
});
