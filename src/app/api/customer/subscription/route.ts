import { instagramActor } from '@/lib/instagram-connection';
import { workspaceSubscription } from '@/lib/service-billing';
import { serviceFailure } from '@/lib/service-errors';
import { consumeAuthLimit } from '@/lib/customer-auth';
import { csvCell } from '@/lib/recommendations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const actor = await instagramActor(request.headers);
    if (!(await consumeAuthLimit('subscription-read:' + actor.userId, 60, 30)).allowed)
      return Response.json(
        { error: 'wait' },
        { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
      );
    const data = await workspaceSubscription(actor.workspace.id);
    if (new URL(request.url).searchParams.get('format') === 'csv') {
      const rows = [
        [
          'دوره از',
          'دوره تا',
          'پلن',
          'مبلغ تومان',
          'درخواست ارسال',
          'پذیرش API',
          'ناموفق',
          'نامعلوم',
          'ورودی تازه',
        ],
        [
          data.period.start.toISOString(),
          data.period.end.toISOString(),
          data.plan.name,
          '0',
          String(data.usage.jobs),
          String(data.usage.accepted),
          String(data.usage.failed),
          String(data.usage.unknown),
          String(data.usage.inbound),
        ],
      ];
      return new Response('\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="aidirect-usage.csv"',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return serviceFailure(error);
  }
}
