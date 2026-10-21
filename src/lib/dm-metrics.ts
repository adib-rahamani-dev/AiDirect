import { db } from './db';
export async function dmMetrics(
  accountId: string,
  workspaceId: string,
  pageId: string,
  days: 7 | 30 = 30,
) {
  const rows = await db.sendboxDmDelivery.findMany({
    where: { accountId, receivedAt: { gte: new Date(Date.now() - days * 86400_000) } },
    select: {
      intent: true,
      resultKind: true,
      interpretation: true,
      aiAttempted: true,
      aiSucceeded: true,
      budgetBucket: true,
      status: true,
      analyzedAt: true,
      responseMs: true,
      selectedProductIds: true,
      senderHash: true,
    },
    orderBy: { receivedAt: 'desc' },
    take: 5000,
  });
  const analyzed = rows.filter((r) => r.analyzedAt !== null);
  const grouped = (values: (string | null)[]) =>
    Object.entries(
      values.reduce<Record<string, number>>((counts, key) => {
        if (key) counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
    )
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  const accepted = rows.filter((r) => r.status === 'accepted');
  const times = accepted.flatMap((r) => (r.responseMs === null ? [] : [r.responseMs]));
  const ids = accepted.flatMap((r) =>
    Array.isArray(r.selectedProductIds)
      ? r.selectedProductIds.filter((v): v is string => typeof v === 'string' && v.length <= 100)
      : [],
  );
  const catalog = ids.length
    ? await db.catalogProduct.findMany({
        where: { workspaceId, pageId, id: { in: [...new Set(ids)] } },
        select: { id: true, name: true },
      })
    : [];
  const products = grouped(ids)
    .filter((p) => catalog.some((c) => c.id === p.label))
    .slice(0, 5)
    .map((p) => ({ name: catalog.find((c) => c.id === p.label)!.name, count: p.count }));
  const handoffs = await db.sendboxDmContext.count({
    where: { accountId, workspaceId, pageId, handedOff: true, expiresAt: { gt: new Date() } },
  });
  return {
    source: 'database' as const,
    days,
    sampledLimit: 5000,
    mayBeTruncated: rows.length === 5000,
    received: rows.length,
    conversations: new Set(rows.map((r) => r.senderHash)).size,
    analyzed: analyzed.length,
    accepted: accepted.length,
    pending: rows.filter((r) => ['pending', 'sending'].includes(r.status)).length,
    failed: rows.filter((r) => r.status === 'failed').length,
    unknown: rows.filter((r) => r.status === 'unknown').length,
    withoutAi: analyzed.filter((r) => !r.aiAttempted).length,
    aiAttempts: analyzed.filter((r) => r.aiAttempted).length,
    aiSucceeded: analyzed.filter((r) => r.aiSucceeded).length,
    withoutAiPercent: analyzed.length
      ? Math.round((100 * analyzed.filter((r) => !r.aiAttempted).length) / analyzed.length)
      : null,
    noMatch: analyzed.filter((r) => r.resultKind === 'no_match').length,
    handoffs,
    averageAcceptanceMs: times.length
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : null,
    intents: grouped(analyzed.map((r) => r.intent)),
    budgets: grouped(analyzed.map((r) => r.budgetBucket)),
    products,
    orders: null,
    revenueToman: null,
    conversionRate: null,
  };
}
