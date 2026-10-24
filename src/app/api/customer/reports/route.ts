import { instagramActor } from '@/lib/instagram-connection';
import { consumeAuthLimit } from '@/lib/customer-auth';
import { serviceFailure } from '@/lib/service-errors';
import { db } from '@/lib/db';
import { csvCell } from '@/lib/recommendations';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const actor = await instagramActor(request.headers);
    if (!(await consumeAuthLimit('delivery-report:' + actor.userId, 60, 30)).allowed)
      return Response.json(
        { error: 'wait' },
        { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
      );
    const params = new URL(request.url).searchParams;
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .parse(params.get('days') || 30);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(params.get('page') || 1);
    const status = z
      .enum(['pending', 'sending', 'accepted', 'unknown', 'failed', 'skipped', 'expired'])
      .optional()
      .parse(params.get('status') || undefined);
    const kind = z
      .enum(['dm_auto', 'dm_manual', 'private_reply'])
      .optional()
      .parse(params.get('kind') || undefined);
    const now = new Date(),
      since = new Date(now.getTime() - days * 86400000);
    const where = {
      workspaceId: actor.workspace.id,
      createdAt: { gte: since, lte: now },
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
    };
    const csv = params.get('format') === 'csv';
    const [rows, total] = await Promise.all([
      db.instagramJob.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: csv ? 0 : (page - 1) * 25,
        take: csv ? 500 : 25,
        select: {
          id: true,
          kind: true,
          status: true,
          errorKind: true,
          intent: true,
          resultKind: true,
          aiAttempted: true,
          aiSucceeded: true,
          attempts: true,
          responseMs: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.instagramJob.count({ where }),
    ]);
    if (csv) {
      const sheet = [
        ['شناسه', 'نوع', 'وضعیت', 'خطا', 'نیت', 'تلاش ارسال', 'زمان پاسخ میلی‌ثانیه', 'ایجاد UTC'],
        ...rows.map((r) => [
          r.id,
          r.kind,
          r.status,
          r.errorKind || '',
          r.intent,
          String(r.attempts),
          r.responseMs === null ? '' : String(r.responseMs),
          r.createdAt.toISOString(),
        ]),
      ];
      return new Response('\uFEFF' + sheet.map((row) => row.map(csvCell).join(',')).join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="aidirect-deliveries.csv"',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Export-Total': String(total),
          'X-Export-Truncated': String(total > 500),
        },
      });
    }
    return Response.json(
      { rows, total, page, days, since, now, csvLimit: 500 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return serviceFailure(error);
  }
}
