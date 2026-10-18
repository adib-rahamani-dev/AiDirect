import { requireOperator, requireOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
import { InputError, readJson } from '@/lib/http';
import { csvCell } from '@/lib/recommendations';
import { provider, realSending, automaticSending } from '@/lib/config';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function failure(error: unknown) {
  const status =
    error instanceof InputError
      ? error.status
      : error instanceof z.ZodError
        ? 400
        : error instanceof Error && error.message === 'unauthorized'
          ? 401
          : error instanceof Error && error.message === 'forbidden'
            ? 403
            : 503;
  return Response.json({ error: 'request_failed' }, { status });
}
const statuses = [
  'pending',
  'preparing',
  'sending',
  'unknown',
  'failed',
  'expired',
  'skipped',
  'simulated',
  'accepted',
  'delivered',
] as const;
export async function GET(request: Request) {
  try {
    await requireOperator();
    const url = new URL(request.url);
    const status = z
      .enum(statuses)
      .optional()
      .parse(url.searchParams.get('status') || undefined);
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .parse(url.searchParams.get('days') || 30);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(url.searchParams.get('page') || 1);
    const isCsv = url.searchParams.get('format') === 'csv';
    const where = {
      ...(status ? { status } : {}),
      createdAt: { gte: new Date(Date.now() - days * 86400_000) },
    };
    const [deliveries, total, control, worker, metaConnection, sendboxConnection] =
      await Promise.all([
        db.delivery.findMany({
          where,
          select: {
            id: true,
            provider: true,
            source: true,
            status: true,
            attempts: true,
            errorKind: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: isCsv ? 0 : (page - 1) * 50,
          take: isCsv ? 1000 : 50,
        }),
        db.delivery.count({ where }),
        db.operationControl.findUnique({ where: { id: 'proof' }, select: { paused: true } }),
        db.workerState.findUnique({
          where: { id: 'proof' },
          select: { lastSeenAt: true, provider: true },
        }),
        db.proofConnection.findUnique({
          where: { id: 'proof' },
          select: { expiresAt: true, status: true },
        }),
        db.sendboxConnection.findUnique({ where: { id: 'proof' }, select: { expiresAt: true } }),
      ]);
    if (isCsv) {
      const rows = [
        ['شناسه', 'ارائه‌دهنده', 'منبع', 'وضعیت', 'تلاش', 'نوع خطا', 'ایجاد'],
        ...deliveries.map((d) => [
          d.id,
          d.provider,
          d.source,
          d.status,
          String(d.attempts),
          d.errorKind ?? '',
          d.createdAt.toISOString(),
        ]),
      ];
      return new Response('\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="deliveries.csv"',
          'Cache-Control': 'no-store',
          'X-Export-Truncated': String(total > 1000),
        },
      });
    }
    return Response.json(
      {
        deliveries,
        total,
        page,
        paused: control?.paused ?? false,
        worker,
        workerHealthy: Boolean(worker && Date.now() - worker.lastSeenAt.getTime() < 60000),
        metaConnection,
        sendboxConnection,
        provider: provider(),
        realSending: realSending(),
        automaticSending: automaticSending(),
        scope: 'operator_proof_only',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireOperator();
    const input = z
      .object({ paused: z.boolean() })
      .strict()
      .parse(await readJson(request, 500));
    await db.operationControl.upsert({
      where: { id: 'proof' },
      create: { id: 'proof', paused: input.paused },
      update: { paused: input.paused },
    });
    return Response.json({ paused: input.paused, scope: 'proof_worker' });
  } catch (error) {
    return failure(error);
  }
}
