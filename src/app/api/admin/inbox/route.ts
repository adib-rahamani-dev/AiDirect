import { requireOperator, requireOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
import { readJson } from '@/lib/http';
import { configureDm, tickDm } from '@/lib/sendbox-dm';
import { sendboxAccounts } from '@/lib/sendbox';
import { z } from 'zod';
import { expireSendboxEvidence } from '@/lib/sendbox-store';
import { dmMetrics } from '@/lib/dm-metrics';
import { dialogueState, planDmReply } from '@/lib/dm-dialogue';
import { extractDmNeed } from '@/lib/dm-ai';
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
            select: {
              enabled: true,
              shorthandMillions: true,
              pageId: true,
              enabledSince: true,
              tone: true,
              shippingPolicy: true,
              aiEnabled: true,
              workspaceId: true,
            },
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
        : db.catalogPage.findMany({
            where: { workspaceId: 'operator-catalog' },
            select: { id: true, name: true, _count: { select: { products: true } } },
            take: 100,
          }),
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
          intent: true,
          resultKind: true,
          interpretation: true,
          aiAttempted: true,
        },
      }),
      db.operationControl.findUnique({ where: { id: 'proof' }, select: { paused: true } }),
    ]);
    const metrics =
      connection && settings
        ? await dmMetrics(connection.accountId, settings.workspaceId, settings.pageId)
        : null;
    return Response.json(
      {
        connection: connection
          ? { username: connection.username, expiresAt: connection.expiresAt }
          : null,
        settings,
        pages,
        deliveries,
        emergencyPaused: paused?.paused ?? false,
        mode: 'hybrid_catalog_dialogue',
        metrics,
        aiConfigured: Boolean(process.env.GROQ_API_KEY),
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
            tone: z.enum(['friendly', 'formal']).optional(),
            shippingPolicy: z.string().trim().max(600).optional(),
            aiEnabled: z.boolean().optional(),
            aiConsent: z.boolean().optional(),
          })
          .strict(),
        z.object({ action: z.literal('process') }).strict(),
        z.object({ action: z.literal('resume_handoffs') }).strict(),
        z.object({ action: z.literal('test_ai'), consent: z.literal(true) }).strict(),
        z
          .object({
            action: z.literal('preview'),
            pageId: z.string().min(1).max(100),
            text: z.string().trim().min(1).max(1000),
            state: dialogueState.optional(),
          })
          .strict(),
      ])
      .parse(await readJson(request, 8000));
    if (data.action === 'process') return Response.json({ processed: await tickDm() });
    if (data.action === 'test_ai') {
      const classification = await extractDmNeed(
        'برای عکاسی با گوشی در نور کم راهنمایی می‌خواهم',
        ['موبایل', 'کفش'],
        'synthetic-test',
      );
      return Response.json(
        { source: 'synthetic_ai_test', provider: 'groq', classification, sent: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (data.action === 'resume_handoffs') {
      const connection = await db.sendboxConnection.findUnique({ where: { id: 'proof' } });
      if (!connection) return Response.json({ error: 'connection_unavailable' }, { status: 409 });
      const cleared = await db.sendboxDmContext.updateMany({
        where: {
          accountId: connection.accountId,
          handedOff: true,
          OR: [{ leaseToken: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: { stateCipher: null, handedOff: false, lastInboundAt: null },
      });
      return Response.json({ resumed: cleared.count });
    }
    if (data.action === 'preview') {
      const page = await db.catalogPage.findFirst({
        where: { id: data.pageId, workspaceId: 'operator-catalog' },
        include: { workspace: true },
      });
      if (!page || page.workspace.paused)
        return Response.json({ error: 'catalog_unavailable' }, { status: 409 });
      const config = await db.sendboxDmSettings.findFirst({
        where: { pageId: page.id, workspaceId: page.workspaceId },
      });
      const settings = config ?? {
        tone: 'friendly',
        shippingPolicy: '',
        shorthandMillions: false,
        aiEnabled: false,
      };
      const plan = await planDmReply({
        workspaceId: page.workspaceId,
        pageId: page.id,
        text: data.text,
        settings,
        state: data.state,
        firstTurn: !data.state,
        extractor: settings.aiEnabled
          ? (text, categories) => extractDmNeed(text, categories, 'preview:' + page.id)
          : undefined,
      });
      return Response.json(
        { ...plan, source: 'preview', sent: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (data.aiEnabled && (!data.aiConsent || !process.env.GROQ_API_KEY))
      return Response.json({ error: 'ai_consent_required' }, { status: 400 });
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
    await configureDm(data.pageId, data.enabled, data.shorthandMillions, {
      tone: data.tone,
      shippingPolicy: data.shippingPolicy,
      aiEnabled: data.aiEnabled,
    });
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
