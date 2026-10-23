import { db } from './db';

export async function instagramDmMetrics(workspaceId: string) {
  const where = {
    workspaceId,
    kind: 'dm_auto',
    createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
  };
  const [groups, latency] = await Promise.all([
    db.instagramJob.groupBy({
      by: ['intent', 'resultKind', 'interpretation', 'aiAttempted', 'aiSucceeded', 'budgetBucket'],
      where: { ...where, interpretation: { not: 'none' } },
      _count: { _all: true },
    }),
    db.instagramJob.aggregate({
      where: { ...where, status: 'accepted', responseMs: { not: null } },
      _avg: { responseMs: true },
    }),
  ]);
  const intents: Record<string, number> = {},
    budgets: Record<string, number> = {};
  let analyzed = 0,
    aiAttempted = 0,
    aiSucceeded = 0,
    noMatch = 0,
    handoffs = 0;
  for (const row of groups) {
    const n = row._count._all;
    analyzed += n;
    aiAttempted += row.aiAttempted ? n : 0;
    aiSucceeded += row.aiSucceeded ? n : 0;
    noMatch += row.resultKind === 'no_match' ? n : 0;
    handoffs += row.resultKind === 'handoff' ? n : 0;
    intents[row.intent] = (intents[row.intent] ?? 0) + n;
    if (row.budgetBucket) budgets[row.budgetBucket] = (budgets[row.budgetBucket] ?? 0) + n;
  }
  return {
    analyzed,
    aiAttempted,
    aiSucceeded,
    withoutAiPercent: analyzed ? Math.round((100 * (analyzed - aiAttempted)) / analyzed) : null,
    noMatch,
    handoffs,
    intents,
    budgets,
    averageAcceptanceMs:
      latency._avg.responseMs === null ? null : Math.round(latency._avg.responseMs),
    orders: null,
    revenue: null,
    conversionRate: null,
    periodDays: 7,
  };
}
