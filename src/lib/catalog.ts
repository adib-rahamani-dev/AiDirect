import { z } from 'zod';
import { db } from './db';
import { latinDigits, parseBudget, recommend, recommendationText } from './recommendations';

export class CatalogError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
const id = z.string().min(1).max(100);
const clean = (max: number) => z.string().trim().min(1).max(max);
const httpsUrl = z
  .string()
  .url()
  .max(1000)
  .refine((s) => {
    const url = new URL(s);
    return url.protocol === 'https:' && !url.username && !url.password;
  });
const productInput = z
  .object({
    pageId: id,
    id: id.optional(),
    name: clean(100),
    description: z.string().trim().max(1000),
    category: clean(80),
    priceToman: z
      .string()
      .transform((value) => latinDigits(value).replace(/[,٬\s]/g, ''))
      .refine((s) => /^\d{1,13}$/.test(s) && Number(s) > 0 && Number(s) <= 1e12),
    stock: z.number().int().min(0).max(1e6),
    active: z.boolean(),
    url: httpsUrl,
  })
  .strict();
export async function catalogAccess(userId: string, workspaceId: string, write = false) {
  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership || (write && membership.role === 'VIEWER'))
    throw new CatalogError(403, 'forbidden');
  return membership;
}
export async function operatorCatalogIdentity() {
  // Only called AFTER requireOperator. There is no public customer identity fallback.
  if (
    await db.membership.findUnique({
      where: { userId_workspaceId: { userId: 'operator', workspaceId: 'operator-catalog' } },
    })
  )
    return 'operator';
  await db.user.upsert({ where: { id: 'operator' }, create: { id: 'operator' }, update: {} });
  await db.workspace.upsert({
    where: { id: 'operator-catalog' },
    create: {
      id: 'operator-catalog',
      name: 'فروشگاه من',
      memberships: { create: { userId: 'operator', role: 'OWNER' } },
    },
    update: {},
  });
  return 'operator';
}
export async function catalogSnapshot(userId: string, workspaceId: string) {
  const membership = await catalogAccess(userId, workspaceId);
  const [workspace, pages, products] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, name: true, paused: true },
    }),
    db.catalogPage.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    db.catalogProduct.findMany({
      where: { workspaceId },
      include: { posts: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);
  return {
    workspace,
    role: membership.role,
    pages,
    products: products.map((p) => ({ ...p, priceToman: String(p.priceToman) })),
    sendingEnabled: false,
    mode: 'catalog_preview',
  };
}
export async function catalogMutation(
  userId: string,
  workspaceId: string,
  input: Record<string, unknown>,
) {
  const membership = await catalogAccess(userId, workspaceId, true);
  switch (input.action) {
    case 'page': {
      const data = z
        .object({
          name: clean(100),
          handle: z
            .string()
            .trim()
            .regex(/^[a-zA-Z0-9_.]{1,30}$/),
        })
        .parse(input.data);
      if ((await db.catalogPage.count({ where: { workspaceId } })) >= 100)
        throw new CatalogError(409, 'limit');
      return db.catalogPage.create({
        data: { ...data, handle: data.handle.toLowerCase(), workspaceId },
      });
    }
    case 'product': {
      const { id: productId, ...data } = productInput.parse(input.data);
      if (!(await db.catalogPage.findFirst({ where: { id: data.pageId, workspaceId } })))
        throw new CatalogError(404, 'not_found');
      const values = { ...data, priceToman: BigInt(data.priceToman) };
      if (productId) {
        const result = await db.catalogProduct.updateMany({
          where: { id: productId, workspaceId, pageId: data.pageId },
          data: values,
        });
        if (!result.count) throw new CatalogError(404, 'not_found');
      } else {
        if ((await db.catalogProduct.count({ where: { workspaceId } })) >= 500)
          throw new CatalogError(409, 'limit');
        await db.catalogProduct.create({ data: { ...values, workspaceId } });
      }
      return { saved: true };
    }
    case 'link': {
      const data = z
        .object({
          pageId: id,
          productId: id,
          permalink: httpsUrl.refine((s) =>
            /^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/.test(s),
          ),
        })
        .parse(input.data);
      if (
        !(await db.catalogProduct.findFirst({
          where: { id: data.productId, pageId: data.pageId, workspaceId },
        }))
      )
        throw new CatalogError(404, 'not_found');
      if ((await db.mediaProduct.count({ where: { workspaceId } })) >= 1000)
        throw new CatalogError(409, 'limit');
      const permalink = data.permalink.replace('https://www.', 'https://').replace(/\/$/, '');
      return db.mediaProduct.upsert({
        where: { workspaceId_pageId_productId_permalink: { workspaceId, ...data, permalink } },
        create: { ...data, workspaceId, permalink },
        update: {},
      });
    }
    case 'unlink': {
      const linkId = id.parse(input.id);
      const result = await db.mediaProduct.deleteMany({ where: { id: linkId, workspaceId } });
      if (!result.count) throw new CatalogError(404, 'not_found');
      return { deleted: true };
    }
    case 'delete_product': {
      const productId = id.parse(input.id);
      const result = await db.catalogProduct.deleteMany({ where: { id: productId, workspaceId } });
      if (!result.count) throw new CatalogError(404, 'not_found');
      return { deleted: true };
    }
    case 'pause': {
      if (membership.role !== 'OWNER') throw new CatalogError(403, 'forbidden');
      return db.workspace.update({
        where: { id: workspaceId },
        data: { paused: z.boolean().parse(input.paused) },
        select: { paused: true },
      });
    }
    case 'delete_catalog': {
      if (membership.role !== 'OWNER') throw new CatalogError(403, 'forbidden');
      if (input.confirm !== 'DELETE CATALOG') throw new CatalogError(400, 'confirmation_required');
      // Page cascades remove products and post mappings. Retains workspace/membership.
      await db.$transaction([
        db.workspace.update({ where: { id: workspaceId }, data: { paused: true } }),
        db.catalogPage.deleteMany({ where: { workspaceId } }),
      ]);
      return { deleted: true, scope: 'catalog_only' };
    }
    default:
      throw new CatalogError(400, 'invalid_action');
  }
}
export async function previewRecommendation(userId: string, workspaceId: string, input: unknown) {
  await catalogAccess(userId, workspaceId);
  const data = z
    .object({
      pageId: id,
      message: z.string().max(1000),
      budgetToman: z.string().max(30).optional(),
      category: z.string().trim().max(80).default(''),
      permalink: httpsUrl.optional(),
    })
    .strict()
    .parse(input);
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  if (workspace.paused)
    return {
      status: 'paused',
      mode: 'rules',
      sendingEnabled: false,
      reply: 'پیشنهاد محصول برای این فروشگاه متوقف است.',
      products: [],
    };
  if (!(await db.catalogPage.findFirst({ where: { id: data.pageId, workspaceId } })))
    throw new CatalogError(404, 'not_found');
  const budget = parseBudget(data.message, data.budgetToman);
  if (budget.status === 'clarify')
    return {
      status: 'clarify',
      mode: 'rules',
      sendingEnabled: false,
      reply: budget.message,
      products: [],
    };
  const rows = await db.catalogProduct.findMany({
    where: {
      workspaceId,
      pageId: data.pageId,
      active: true,
      stock: { gt: 0 },
      priceToman: { lte: BigInt(budget.toman) },
      ...(data.permalink
        ? { posts: { some: { workspaceId, pageId: data.pageId, permalink: data.permalink } } }
        : {}),
    },
    take: 500,
    orderBy: { priceToman: 'asc' },
  });
  // Select public fields only: internal IDs/timestamps stay out of generated answers.
  const products = recommend(
    rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      priceToman: String(p.priceToman),
      stock: p.stock,
      active: p.active,
      url: p.url,
    })),
    budget.toman,
    data.category,
  );
  return {
    status: products.length ? 'ready' : 'no_match',
    mode: 'rules',
    sendingEnabled: false,
    budgetToman: budget.toman,
    products,
    reply: recommendationText(products),
  };
}
