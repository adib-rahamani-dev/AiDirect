import { requireOperator, requireOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
import { readJson } from '@/lib/http';
import { configureDm, tickDm } from '@/lib/sendbox-dm';
import { sendboxAccounts } from '@/lib/sendbox';
import { z } from 'zod';
import { expireSendboxEvidence } from '@/lib/sendbox-store';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET() {
  try {
    await requireOperator();
    await expireSendboxEvidence();
    const connection = await db.sendboxConnection.findUnique({
      where: { id: 'proof' },
      select: { accountId: true, username: true, expiresAt: true },
    });
    const [settings, pages, deliveries, paused] = await Promise.all([
      connection
        ? db.sendboxDmSettings.findUnique({
            where: { accountId: connection.accountId },
            select: { enabled: true, shorthandMillions: true, pageId: true, enabledSince: true },
          })
        : null,
      connection
        ? db.catalogPage.findMany({
            where: {
              workspaceId: 'operator-catalog',
              handle: { equals: connection.username, mode: 'insensitive' },
            },
            select: { id: true, name: true, _count: { select: { products: true } } },
            take: 100,
          })
        : [],
      db.sendboxDmDelivery.findMany({
        orderBy: { receivedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          status: true,
          errorKind: true,
          attempts: true,
          receivedAt: true,
          updatedAt: true,
        },
      }),
      db.operationControl.findUnique({ where: { id: 'proof' }, select: { paused: true } }),
    ]);
    return Response.json(
      {
        connection: connection
          ? { username: connection.username, expiresAt: connection.expiresAt }
          : null,
        settings,
        pages,
        deliveries,
        emergencyPaused: paused?.paused ?? false,
        mode: 'rules_catalog_only',
        scheduler: 'webhook_after_with_manual_recovery',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireOperator();
    const data = z
      .discriminatedUnion('action', [
        z
          .object({
            action: z.literal('configure'),
            pageId: z.string().min(1).max(100),
            enabled: z.boolean(),
            shorthandMillions: z.boolean(),
          })
          .strict(),
        z.object({ action: z.literal('process') }).strict(),
      ])
      .parse(await readJson(request, 2000));
    if (data.action === 'process') return Response.json({ processed: await tickDm() });
    if (data.enabled) {
      const current = await db.sendboxConnection.findUnique({ where: { id: 'proof' } });
      const accounts = await sendboxAccounts();
      if (
        !current ||
        !accounts.some(
          (a) => a.id === current.accountId && a.is_active && Date.parse(a.expires_at) > Date.now(),
        )
      )
        return Response.json({ error: 'connection_unavailable' }, { status: 409 });
    }
    await configureDm(data.pageId, data.enabled, data.shorthandMillions);
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  const code = e instanceof Error ? e.message : '';
  const status =
    code === 'unauthorized'
      ? 401
      : code === 'forbidden'
        ? 403
        : e instanceof z.ZodError
          ? 400
          : code === 'catalog_connection_mismatch'
            ? 409
            : 503;
  return Response.json(
    { error: status === 409 ? 'catalog_connection_mismatch' : 'unavailable' },
    { status },
  );
}
