import { db } from './db';
import { catalogAccess } from './catalog';

export type CatalogMetrics = {
  products: number;
  active: number;
  available: number;
  outOfStock: number;
  lowStock: number;
  missingDescription: number;
  mapped: number;
  inventoryValueToman: string;
  minPriceToman: string | null;
  maxPriceToman: string | null;
};
export type Suggestion = {
  id: 'add_products' | 'stock' | 'description' | 'post_mapping' | 'paused' | 'test_catalog';
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  affected: number;
};
export function catalogSuggestions(m: CatalogMetrics, paused: boolean): Suggestion[] {
  const items: Suggestion[] = [];
  if (!m.products)
    items.push({
      id: 'add_products',
      priority: 'high',
      title: 'ویترین را با محصول واقعی شروع کن',
      detail:
        'محصول، قیمت دقیق به تومان، موجودی و لینک خرید را ثبت کن تا تست پیشنهاد معنا پیدا کند.',
      affected: 0,
    });
  if (m.outOfStock)
    items.push({
      id: 'stock',
      priority: 'high',
      title: 'موجودی محصولات فعال را بررسی کن',
      detail:
        'محصول فعالِ ناموجود در پیشنهاد بودجه نمایش داده نمی‌شود. موجودی را اصلاح کن یا محصول را غیرفعال کن.',
      affected: m.outOfStock,
    });
  if (m.missingDescription)
    items.push({
      id: 'description',
      priority: 'medium',
      title: 'اطلاعات محصول را کامل‌تر کن',
      detail:
        'توضیح خالی یا کوتاه‌تر از چهل نویسه شناسایی شده؛ ویژگی، کاربرد و تفاوت محصول را بنویس.',
      affected: m.missingDescription,
    });
  if (m.products > m.mapped)
    items.push({
      id: 'post_mapping',
      priority: 'medium',
      title: 'ارتباط پست و محصول را مشخص کن',
      detail:
        'برای محصول‌های بدون ارتباط، لینک پست یا ریلز مربوط را ثبت کن. این ارتباط دستی، اتصال رسمی Instagram نیست.',
      affected: m.products - m.mapped,
    });
  if (paused)
    items.push({
      id: 'paused',
      priority: 'high',
      title: 'پیشنهادهای این فضا متوقف‌اند',
      detail:
        'پس از بررسی کاتالوگ، از بخش محصولات توقف را بردار. این کار ارسال دایرکت را فعال نمی‌کند.',
      affected: m.products,
    });
  if (m.available)
    items.push({
      id: 'test_catalog',
      priority: 'low',
      title: 'یک درخواست خرید را امتحان کن',
      detail:
        'با یک بودجه و دستهٔ مشخص پیشنهاد را تست کن؛ قیمت و موجودی از کاتالوگ می‌آیند. این تست به دایرکت پیام نمی‌فرستد.',
      affected: m.available,
    });
  return items.sort(
    (a, b) =>
      ({ high: 0, medium: 1, low: 2 })[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority],
  );
}
export function calendarDays(days: number, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return Array.from({ length: days }, (_, index) =>
    new Date(Date.parse(today + 'T12:00:00Z') - (days - 1 - index) * 86400000)
      .toISOString()
      .slice(0, 10),
  );
}
export async function analyticsSnapshot(userId: string, workspaceId: string, days: 7 | 30 | 90) {
  await catalogAccess(userId, workspaceId);
  const dates = calendarDays(days);
  return db.$transaction(
    async (tx) => {
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { id: true, name: true, paused: true },
      });
      const pages = await tx.catalogPage.count({ where: { workspaceId } });
      const [metrics] = await tx.$queryRaw<CatalogMetrics[]>`
      SELECT count(*)::int AS products,
        count(*) FILTER(WHERE active)::int AS active,
        count(*) FILTER(WHERE active AND stock>0)::int AS available,
        count(*) FILTER(WHERE active AND stock=0)::int AS "outOfStock",
        count(*) FILTER(WHERE active AND stock BETWEEN 1 AND 3)::int AS "lowStock",
        count(*) FILTER(WHERE char_length(btrim(description))<40)::int AS "missingDescription",
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM "MediaProduct" l WHERE l."productId"=p.id AND l."workspaceId"=p."workspaceId"))::int AS mapped,
        COALESCE(sum("priceToman"*stock) FILTER(WHERE active),0)::text AS "inventoryValueToman",
        (min("priceToman") FILTER(WHERE active AND stock>0))::text AS "minPriceToman",
        (max("priceToman") FILTER(WHERE active AND stock>0))::text AS "maxPriceToman"
      FROM "CatalogProduct" p WHERE "workspaceId"=${workspaceId}`;
      const [links] = await tx.$queryRaw<
        { posts: number }[]
      >`SELECT count(DISTINCT ("pageId",permalink))::int AS posts FROM "MediaProduct" WHERE "workspaceId"=${workspaceId}`;
      const categories = await tx.$queryRaw<
        { category: string; products: number; available: number }[]
      >`SELECT category,count(*)::int AS products,count(*) FILTER(WHERE active AND stock>0)::int AS available FROM "CatalogProduct" WHERE "workspaceId"=${workspaceId} GROUP BY category ORDER BY count(*) DESC,category ASC LIMIT 8`;
      const daily = await tx.$queryRaw<
        { day: string; count: number }[]
      >`SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran','YYYY-MM-DD') AS day,count(*)::int AS count FROM "CatalogProduct" WHERE "workspaceId"=${workspaceId} AND ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')::date BETWEEN ${dates[0]}::date AND ${dates.at(-1)}::date GROUP BY day`;
      return {
        workspace,
        generatedAt: new Date().toISOString(),
        days,
        timeZone: 'Asia/Tehran' as const,
        source: 'database' as const,
        metrics: { ...metrics, pages, posts: links.posts },
        timeline: dates.map((day) => ({
          day,
          count: daily.find((r) => r.day === day)?.count ?? 0,
        })),
        categories,
        suggestions: catalogSuggestions(metrics, workspace.paused),
        messaging: {
          status: 'not_connected' as const,
          comments: null,
          privateReplies: null,
          orders: null,
          revenueToman: null,
          conversionRate: null,
        },
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
export type AnalyticsSnapshot = Awaited<ReturnType<typeof analyticsSnapshot>>;
