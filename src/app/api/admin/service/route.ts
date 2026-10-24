import { platformActor } from '@/lib/platform-access';
import { consumeAuthLimit } from '@/lib/customer-auth';
import { db } from '@/lib/db';
import { monthlyPeriod, servicePlan } from '@/lib/service-plans';
import { serviceFailure } from '@/lib/service-errors';
import { csvCell } from '@/lib/recommendations';
import { provider } from '@/lib/config';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const actor = await platformActor(request.headers);
    if (!(await consumeAuthLimit('service-overview:' + actor.id, 60, 30)).allowed)
      return Response.json(
        { error: 'wait' },
        { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
      );
    const params = new URL(request.url).searchParams;
    const q = z
      .string()
      .trim()
      .max(80)
      .parse(params.get('q') || '');
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(params.get('page') || 1);
    const state = z
      .enum(['all', 'paused', 'connected', 'attention'])
      .parse(params.get('state') || 'all');
    const now = new Date(),
      since = new Date(now.getTime() - 30 * 86400000),
      soon = new Date(now.getTime() + 7 * 86400000);
    const where = {
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      ...(state === 'paused'
        ? { paused: true }
        : state === 'connected'
          ? { instagram: { is: { status: 'connected', expiresAt: { gt: now } } } }
          : state === 'attention'
            ? {
                instagram: {
                  is: {
                    OR: [
                      { status: { not: 'connected' } },
                      { expiresAt: { lte: soon } },
                      { subscribed: false },
                    ],
                  },
                },
              }
            : {}),
    };
    const [
      workspaces,
      total,
      users,
      registeredWeek,
      paused,
      connected,
      expiring,
      jobs,
      heartbeat,
      errors,
      backlog,
      automations,
      products,
      audit,
    ] = await Promise.all([
      db.workspace.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 25,
        take: 25,
        select: {
          id: true,
          name: true,
          paused: true,
          createdAt: true,
          _count: { select: { memberships: true, pages: true } },
          instagram: {
            select: {
              username: true,
              status: true,
              expiresAt: true,
              subscribed: true,
              autoDm: true,
            },
          },
        },
      }),
      db.workspace.count({ where }),
      db.user.count({ where: { email: { not: null } } }),
      db.user.count({
        where: { email: { not: null }, createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } },
      }),
      db.workspace.count({ where: { paused: true } }),
      db.instagramConnection.count({ where: { status: 'connected', expiresAt: { gt: now } } }),
      db.instagramConnection.count({
        where: { status: 'connected', expiresAt: { gt: now, lte: soon } },
      }),
      db.instagramJob.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.workerState.findUnique({
        where: { id: 'proof' },
        select: { lastSeenAt: true, provider: true },
      }),
      db.instagramJob.groupBy({
        by: ['errorKind'],
        where: { createdAt: { gte: since }, errorKind: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { errorKind: 'desc' } },
        take: 8,
      }),
      db.instagramWebhookEnvelope.count({ where: { status: { in: ['pending', 'processing'] } } }),
      db.instagramAutomation.count({ where: { enabled: true } }),
      db.catalogProduct.count(),
      actor.role === 'SUPER_ADMIN'
        ? db.adminAudit.findMany({
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: { id: true, action: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);
    const rows = workspaces.map((w) => ({
      ...w,
      period: monthlyPeriod(w.createdAt, now),
      plan: servicePlan.id,
      connectionState: !w.instagram
        ? 'none'
        : w.instagram.status !== 'connected'
          ? w.instagram.status
          : w.instagram.expiresAt <= now
            ? 'expired'
            : !w.instagram.subscribed
              ? 'subscription_pending'
              : 'connected',
    }));
    if (params.get('format') === 'csv') {
      const data = [
        ['فروشگاه', 'وضعیت', 'پلن', 'مبلغ تومان', 'شروع دوره', 'پایان دوره', 'اتصال', 'عضو'],
        ...rows.map((w) => [
          w.name,
          w.paused ? 'متوقف' : 'فعال',
          servicePlan.name,
          '0',
          w.period.start.toISOString(),
          w.period.end.toISOString(),
          w.connectionState,
          String(w._count.memberships),
        ]),
      ];
      return new Response('\uFEFF' + data.map((row) => row.map(csvCell).join(',')).join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="aidirect-workspaces-page.csv"',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    return Response.json(
      {
        role: actor.role,
        now,
        periodSince: since,
        plan: servicePlan,
        workspaces: rows,
        total,
        page,
        stats: {
          users,
          registeredWeek,
          paused,
          connected,
          expiring,
          backlog,
          automations,
          products,
        },
        jobs: Object.fromEntries(jobs.map((j) => [j.status, j._count._all])),
        errors: errors.map((e) => ({ kind: e.errorKind, count: e._count._all })),
        audit,
        health: {
          database: 'ok',
          worker:
            heartbeat &&
            heartbeat.provider === provider() &&
            now.getTime() - heartbeat.lastSeenAt.getTime() < 90000
              ? 'ready'
              : 'missing',
          lastWorkerAt: heartbeat?.lastSeenAt ?? null,
        },
        signupEnabled: process.env.SIGNUP_ENABLED === 'true',
        sendingEnabled: process.env.META_CUSTOMER_SEND_ENABLED === 'true',
        revenueToman: 0,
        revenueSource: 'free_plan_no_billing_provider',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return serviceFailure(error);
  }
}
