import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import {
  catalogAccess,
  catalogSnapshot,
  catalogMutation,
  previewRecommendation,
} from '../src/lib/catalog';
import { parseBudget, latinDigits, csvCell } from '../src/lib/recommendations';
import { POST as postCatalog } from '../src/app/api/catalog/route';
if (new URL(process.env.DATABASE_URL!).pathname !== '/aidirect_test')
  throw new Error('Test database required');
after(() => db.$disconnect());
test('Budget parsing handles Persian/Arabic digits and refuses ambiguous shorthand, ranges and rial', () => {
  assert.equal(latinDigits('۳۰ ٣٠'), '30 30');
  for (const message of [
    'تا ۳۰ میلیون تومان محصول می‌خوام',
    'تا ٣٠ میلیون تومن',
    'تا ۳۰٬۰۰۰٬۰۰۰ تومان',
  ])
    assert.deepEqual(parseBudget(message), { status: 'ready', toman: 30000000 });
  assert.deepEqual(parseBudget('تا ۱.۵ میلیون تومان'), { status: 'ready', toman: 1500000 });
  assert.deepEqual(parseBudget('', '۳۰,۰۰۰,۰۰۰'), { status: 'ready', toman: 30000000 });
  for (const message of [
    'تا ۳۰ تومن',
    'یه محصول می‌خوام',
    'از ۱۰ تا ۳۰ میلیون',
    '۳۰۰۰۰۰ ریال',
    '۳۰ میلیون ۲ تومان',
    '-۳۰ میلیون',
    '0 تومان',
  ])
    assert.equal(parseBudget(message).status, 'clarify', message);
});
test('CSV export neutralizes formula prefixes and escapes quotes', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('\t+cmd'), '"\'\t+cmd"');
  assert.equal(csvCell('عادی'), '"عادی"');
});
test('Catalog mutation rejects cross-origin request before accepting operator credentials', async () => {
  const r = await postCatalog(
    new Request('https://example.com/api/catalog', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
      body: '{}',
    }),
  );
  assert.equal(r.status, 403);
});
test('Catalog membership, compound ownership, inventory, post mapping, pause and deletion', async () => {
  const a = 'catalog-fixture-a',
    b = 'catalog-fixture-b',
    user = 'catalog-user',
    viewer = 'catalog-viewer',
    editor = 'catalog-editor';
  await db.workspace.deleteMany({ where: { id: { in: [a, b] } } });
  await db.user.deleteMany({ where: { id: { in: [user, viewer, editor] } } });
  await db.user.createMany({ data: [{ id: user }, { id: viewer }, { id: editor }] });
  await db.workspace.create({
    data: {
      id: a,
      name: 'الف',
      memberships: {
        create: [
          { userId: user, role: 'OWNER' },
          { userId: viewer, role: 'VIEWER' },
          { userId: editor, role: 'EDITOR' },
        ],
      },
    },
  });
  await db.workspace.create({ data: { id: b, name: 'ب' } });
  try {
    const page = await db.catalogPage.create({
      data: { workspaceId: a, name: 'الف', handle: 'a_shop' },
    });
    const other = await db.catalogPage.create({
      data: { workspaceId: b, name: 'ب', handle: 'b_shop' },
    });
    const product = (name: string, price: string, stock = 1, active = true) => ({
      pageId: page.id,
      name,
      priceToman: price,
      stock,
      active,
      category: 'کالا',
      description: 'اطلاعات واقعی محصول',
      url: 'https://example.com/product',
    });
    for (const data of [
      product('مناسب', '29000000'),
      product('گران', '31000000'),
      product('ناموجود', '1000', 0),
      product('خاموش', '1000', 1, false),
    ])
      await catalogMutation(user, a, { action: 'product', data });
    await assert.rejects(() => catalogSnapshot(user, b), { status: 403 });
    await assert.rejects(
      () => catalogMutation(viewer, a, { action: 'product', data: product('غیرمجاز', '1') }),
      { status: 403 },
    );
    await assert.rejects(() => catalogMutation(editor, a, { action: 'pause', paused: true }), {
      status: 403,
    });
    await assert.rejects(
      () =>
        catalogMutation(user, a, {
          action: 'product',
          data: { ...product('غیرمجاز', '1'), pageId: other.id },
        }),
      { status: 404 },
    );
    await assert.rejects(() =>
      db.catalogProduct.create({
        data: { ...product('عبور مستقیم', '1'), workspaceId: a, pageId: other.id, priceToman: 1n },
      }),
    );
    const snapshot = await catalogSnapshot(user, a);
    const selected = snapshot.products.find((p) => p.name === 'مناسب')!;
    assert.equal(snapshot.products.length, 4);
    await assert.rejects(
      () =>
        catalogMutation(user, a, {
          action: 'link',
          data: {
            pageId: other.id,
            productId: selected.id,
            permalink: 'https://instagram.com/p/abc',
          },
        }),
      { status: 404 },
    );
    const link = {
      pageId: page.id,
      productId: selected.id,
      permalink: 'https://www.instagram.com/p/abc/',
    };
    await catalogMutation(user, a, { action: 'link', data: link });
    await catalogMutation(user, a, { action: 'link', data: link });
    assert.equal(await db.mediaProduct.count({ where: { workspaceId: a } }), 1);
    const result = await previewRecommendation(user, a, {
      pageId: page.id,
      message: 'تا ۳۰ میلیون تومان',
    });
    assert.equal(result.status, 'ready');
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].name, 'مناسب');
    assert.equal(result.sendingEnabled, false);
    assert.equal(
      (
        await previewRecommendation(user, a, {
          pageId: page.id,
          message: 'تا ۳۰ میلیون تومان',
          permalink: 'https://instagram.com/p/abc',
        })
      ).products.length,
      1,
    );
    assert.equal(
      (
        await previewRecommendation(user, a, {
          pageId: page.id,
          message: 'تا ۳۰ میلیون تومان',
          permalink: 'https://instagram.com/p/unrelated',
        })
      ).products.length,
      0,
    );
    assert.equal(
      (await previewRecommendation(user, a, { pageId: page.id, message: 'تا ۳۰ تومن' })).status,
      'clarify',
    );
    assert.equal(
      (await previewRecommendation(user, a, { pageId: page.id, message: '', budgetToman: '100' }))
        .status,
      'no_match',
    );
    await catalogMutation(user, a, { action: 'pause', paused: true });
    assert.equal(
      (await previewRecommendation(user, a, { pageId: page.id, message: 'تا ۳۰ میلیون تومان' }))
        .status,
      'paused',
    );
    await assert.rejects(
      () => catalogMutation(user, a, { action: 'delete_catalog', confirm: 'wrong' }),
      { status: 400 },
    );
    await catalogMutation(user, a, { action: 'delete_catalog', confirm: 'DELETE CATALOG' });
    assert.equal(await db.catalogProduct.count({ where: { workspaceId: a } }), 0);
    assert.equal(await db.mediaProduct.count({ where: { workspaceId: a } }), 0);
    assert.equal(await db.catalogPage.count({ where: { workspaceId: b } }), 1);
    assert.equal((await catalogAccess(viewer, a)).role, 'VIEWER');
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: [a, b] } } });
    await db.user.deleteMany({ where: { id: { in: [user, viewer, editor] } } });
  }
});
