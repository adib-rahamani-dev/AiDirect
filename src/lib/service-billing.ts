import { db } from './db';
import { monthlyPeriod, servicePlan } from './service-plans';

export async function workspaceSubscription(workspaceId: string, now = new Date()) {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { id: true, name: true, paused: true, createdAt: true },
  });
  const period = monthlyPeriod(workspace.createdAt, now);
  const [jobs, accepted, failed, unknown, inbound, products, connection, dailyJobs] =
    await Promise.all([
      db.instagramJob.count({
        where: { workspaceId, createdAt: { gte: period.start, lt: period.end } },
      }),
      db.instagramJob.count({
        where: {
          workspaceId,
          status: 'accepted',
          createdAt: { gte: period.start, lt: period.end },
        },
      }),
      db.instagramJob.count({
        where: { workspaceId, status: 'failed', createdAt: { gte: period.start, lt: period.end } },
      }),
      db.instagramJob.count({
        where: { workspaceId, status: 'unknown', createdAt: { gte: period.start, lt: period.end } },
      }),
      db.instagramMessage.count({
        where: {
          workspaceId,
          direction: 'inbound',
          source: 'webhook',
          receivedAt: { gte: period.start, lt: period.end },
        },
      }),
      db.catalogProduct.count({ where: { workspaceId } }),
      db.instagramConnection.findUnique({
        where: { workspaceId },
        select: { status: true, expiresAt: true },
      }),
      db.instagramJob.count({
        where: { workspaceId, createdAt: { gte: new Date(now.getTime() - 86400000), lte: now } },
      }),
    ]);
  return {
    workspace,
    plan: servicePlan,
    period,
    usage: { jobs, accepted, failed, unknown, inbound, products, dailyJobs },
    connectedPages: connection?.status === 'connected' && connection.expiresAt > now ? 1 : 0,
    access: workspace.paused ? 'paused' : 'free',
    // This free monthly projection is derived from workspace creation, not a paid invoice.
    billingSource: 'workspace_anniversary',
    invoiceAvailable: false,
    nextChargeToman: 0,
  };
}
