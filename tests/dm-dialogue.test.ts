import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import { localIntent, redactDm, planDmReply, type DialogueSettings } from '../src/lib/dm-dialogue';
import { extractDmNeed } from '../src/lib/dm-ai';
import { dmMetrics } from '../src/lib/dm-metrics';
if (new URL(process.env.DATABASE_URL!).pathname !== '/aidirect_test')
  throw new Error('Isolated DB required');
after(() => db.$disconnect());
const settings: DialogueSettings = {
  tone: 'friendly',
  shippingPolicy: 'ارسال با پست؛ هزینه پس از مشخص‌شدن مقصد اعلام می‌شود.',
  shorthandMillions: true,
  aiEnabled: false,
};

test('DM intent classification and minimization handle common Persian requests without a model', () => {
  for (const [text, intent] of [
    ['سلام', 'greeting'],
    ['تا ۳۰ میلیون گوشی میخوام', 'recommendation'],
    ['اولی موجوده؟', 'availability'],
    ['قیمتش چنده؟', 'price'],
    ['هزینه ارسال چقدره؟', 'shipping'],
    ['با اپراتور صحبت کنم', 'human'],
    ['مرسی', 'thanks'],
    ['برای عکاسی در نور کم', 'unknown'],
  ])
    assert.equal(localIntent(text), intent);
  const filtered = redactDm(
    'ایمیل test@example.com تلفن ۰۹۱۲۳۴۵۶۷۸۹ لینک https://private.example/path شناسه @private_user',
  );
  for (const value of ['test@example.com', '09123456789', 'private.example', 'private_user'])
    assert.ok(!filtered.includes(value));
  assert.ok(filtered.length <= 600);
});

test('Natural DM plans ground price and stock, use short context, honor consent, and never claim orders', async () => {
  const id = 'dialogue-fixture-' + process.pid,
    other = id + '-other';
  await db.workspace.deleteMany({ where: { id: { in: [id, other] } } });
  try {
    await db.workspace.createMany({
      data: [
        { id, name: 'A' },
        { id: other, name: 'B' },
      ],
    });
    await db.catalogPage.createMany({
      data: [
        { id: id + '-page', workspaceId: id, handle: 'dialogue_a', name: 'A' },
        { id: other + '-page', workspaceId: other, handle: 'dialogue_b', name: 'B' },
      ],
    });
    const p = {
      workspaceId: id,
      pageId: id + '-page',
      description: 'دوربین مناسب عکاسی',
      category: 'موبایل',
      url: 'https://example.com/fixture',
    };
    await db.catalogProduct.createMany({
      data: [
        { ...p, id: id + '-p', name: 'موبایل معتبر', priceToman: 29000000n, stock: 2 },
        { ...p, id: id + '-out', name: 'ناموجود', priceToman: 10000000n, stock: 0 },
        { ...p, id: id + '-exp', name: 'گران', priceToman: 40000000n, stock: 2 },
        { ...p, id: id + '-off', name: 'مخفی', priceToman: 100000n, stock: 2, active: false },
        {
          ...p,
          id: other + '-p',
          workspaceId: other,
          pageId: other + '-page',
          name: 'محصول مشتری دیگر',
          priceToman: 100n,
          stock: 2,
        },
      ],
    });
    let calls = 0;
    const plan = (text: string, extra: Partial<Parameters<typeof planDmReply>[0]> = {}) =>
      planDmReply({ workspaceId: id, pageId: id + '-page', text, settings, ...extra });
    const greet = await plan('سلام', {
      firstTurn: true,
      extractor: async () => {
        calls++;
        throw Error();
      },
    });
    assert.equal(greet.intent, 'greeting');
    assert.match(greet.reply, /خودکار/);
    assert.equal(calls, 0);
    const recommend = await plan('تا ۳۰ تومن محصول میخوام');
    assert.equal(recommend.resultKind, 'recommendations');
    assert.equal(recommend.state.budget, 30000000);
    assert.deepEqual(recommend.selectedProductIds, [id + '-p']);
    assert.doesNotMatch(recommend.reply, /ناموجود|گران|مخفی|محصول مشتری دیگر/);
    assert.ok(recommend.reply.length < 1000);
    const follow = await plan('اولی موجوده؟', { state: recommend.state });
    assert.equal(follow.resultKind, 'product_answer');
    assert.match(follow.reply, /موبایل معتبر/);
    await db.catalogProduct.update({
      where: { id: id + '-p' },
      data: { stock: 0, priceToman: 28000000n },
    });
    const fresh = await plan('قیمتش چنده؟', { state: follow.state });
    assert.equal(fresh.resultKind, 'out_of_stock');
    assert.match(fresh.reply, /۲۸٬۰۰۰٬۰۰۰/);
    assert.match(fresh.reply, /موجود نیست/);
    const shipping = await plan('هزینه ارسال چقدره؟');
    assert.equal(shipping.reply, settings.shippingPolicy);
    const missing = await plan('هزینه ارسال؟', { settings: { ...settings, shippingPolicy: '' } });
    assert.equal(missing.resultKind, 'missing_policy');
    const human = await plan('اپراتور لطفا');
    assert.equal(human.handedOff, true);
    const ambiguous = await plan('۳۰', { state: recommend.state });
    assert.equal(ambiguous.resultKind, 'clarify_budget');
    const none = await plan('تا ۱۰۰۰ تومان');
    assert.equal(none.resultKind, 'no_match');
    const formal = await plan('سلام', { settings: { ...settings, tone: 'formal' } });
    assert.match(formal.reply, /خوش آمدید/);
    assert.ok(!formal.reply.includes('🙂'));
    await db.catalogProduct.update({ where: { id: id + '-p' }, data: { stock: 2 } });
    const text = 'برای عکاسی در نور کم؛ ایمیل test@example.com';
    const extractor = async (message: string, categories: string[]) => {
      calls++;
      assert.ok(!message.includes('test@example.com'));
      return {
        intent: 'recommendation' as const,
        categoryIndex: categories.indexOf('موبایل'),
        confidence: 'high' as const,
      };
    };
    const disabled = await plan(text, { extractor });
    assert.equal(disabled.aiAttempted, false);
    assert.equal(calls, 0);
    const consent = await plan(text, {
      settings: { ...settings, aiEnabled: true },
      state: recommend.state,
      extractor,
    });
    assert.equal(consent.resultKind, 'consent_requested');
    assert.equal(calls, 0);
    assert.ok(consent.state.pendingAiText);
    const declined = await plan('نه', {
      settings: { ...settings, aiEnabled: true },
      state: consent.state,
      extractor,
    });
    assert.equal(declined.resultKind, 'consent_declined');
    assert.equal(calls, 0);
    const extracted = await plan('موافقم', {
      settings: { ...settings, aiEnabled: true },
      state: consent.state,
      extractor,
    });
    assert.equal(calls, 1);
    assert.equal(extracted.interpretation, 'ai');
    assert.equal(extracted.resultKind, 'recommendations');
    assert.equal(extracted.state.pendingAiText, undefined);
    assert.equal(extracted.aiAttempted, true);
    const again = await plan('موافقم', {
      settings: { ...settings, aiEnabled: true },
      state: extracted.state,
      extractor,
    });
    assert.equal(calls, 1);
    assert.equal(again.aiAttempted, false);
    const failed = await plan('موافقم', {
      settings: { ...settings, aiEnabled: true },
      state: consent.state,
      extractor: async () => {
        throw Error('secret');
      },
    });
    assert.equal(failed.resultKind, 'ai_unavailable');
    assert.ok(!failed.reply.includes('secret'));
    const outOfScope = await plan('اولی موجوده؟', { state: { products: [other + '-p'] } });
    assert.equal(outOfScope.resultKind, 'clarify_product');
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: [id, other] } } });
  }
});

test('DM model only returns validated classification, strips identifiers, and makes a bounded single request', async () => {
  const key = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'fixture-dm-key';
  const response = (output: unknown) =>
    Response.json({
      id: 'fixture',
      object: 'chat.completion',
      created: 1,
      model: 'openai/gpt-oss-20b',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: JSON.stringify(output) },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  try {
    let calls = 0;
    const good = await extractDmNeed(
      'برای عکاسی test@example.com @private ۰۹۱۲۳۴۵۶۷۸۹',
      ['موبایل'],
      'fixture-ai-good-' + process.pid,
      async (url, init) => {
        calls++;
        assert.equal(String(url), 'https://api.groq.com/openai/v1/chat/completions');
        assert.equal(init?.redirect, 'error');
        const body = String(init?.body);
        assert.ok(!body.includes('test@example.com'));
        assert.ok(!body.includes('@private'));
        assert.ok(!body.includes('09123456789'));
        return response({ intent: 'recommendation', categoryIndex: 0, confidence: 'high' });
      },
    );
    assert.equal(calls, 1);
    assert.equal(good.categoryIndex, 0);
    await assert.rejects(
      () =>
        extractDmNeed('ساختگی', ['موبایل'], 'fixture-ai-bad-' + process.pid, async () =>
          response({ intent: 'recommendation', categoryIndex: 4, confidence: 'high' }),
        ),
      { message: 'ai_unavailable' },
    );
    await assert.rejects(
      () =>
        extractDmNeed('ساختگی', ['موبایل'], 'fixture-ai-invent-' + process.pid, async () =>
          response({
            intent: 'recommendation',
            categoryIndex: 0,
            confidence: 'high',
            price: 1,
            reply: 'invented',
          }),
        ),
      { message: 'ai_unavailable' },
    );
  } finally {
    if (key === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = key;
  }
});

test('DM statistics distinguish missing sales and legacy rows from grounded analysis and do not leak foreign product names', async () => {
  const account = 'dm-metrics-fixture-' + process.pid,
    foreign = account + '-other';
  await db.sendboxDmDelivery.deleteMany({ where: { accountId: { in: [account, foreign] } } });
  const base = {
    accountId: account,
    senderHash: 'fixture',
    revision: 'fixture',
    inboundAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
  };
  try {
    await db.sendboxDmDelivery.createMany({
      data: [
        {
          ...base,
          messageHash: '1',
          status: 'accepted',
          intent: 'recommendation',
          resultKind: 'no_match',
          analyzedAt: new Date(),
          interpretation: 'rules',
          budgetBucket: '10m_to_30m',
          responseMs: 500,
        },
        {
          ...base,
          messageHash: '2',
          status: 'unknown',
          intent: 'unknown',
          analyzedAt: new Date(),
          aiAttempted: true,
        },
        { ...base, messageHash: '3', status: 'accepted' },
        {
          ...base,
          messageHash: '4',
          accountId: foreign,
          status: 'accepted',
          intent: 'recommendation',
          analyzedAt: new Date(),
        },
      ],
    });
    const stats = await dmMetrics(account, 'unowned', 'unowned');
    assert.equal(stats.received, 3);
    assert.equal(stats.analyzed, 2);
    assert.equal(stats.withoutAiPercent, 50);
    assert.equal(stats.accepted, 2);
    assert.equal(stats.unknown, 1);
    assert.equal(stats.noMatch, 1);
    assert.equal(stats.averageAcceptanceMs, 500);
    assert.equal(stats.orders, null);
    assert.equal(stats.revenueToman, null);
    assert.equal(stats.conversionRate, null);
    assert.deepEqual(stats.products, []);
    assert.equal('senderHash' in stats, false);
  } finally {
    await db.sendboxDmDelivery.deleteMany({ where: { accountId: { in: [account, foreign] } } });
  }
});
