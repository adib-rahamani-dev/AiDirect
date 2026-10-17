import { cookies } from 'next/headers';
import { z } from 'zod';
import { COOKIE, requireOperator, requireOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt, encrypt, hash } from '@/lib/crypto';
import { automaticSending, baseUrl, provider, realSending } from '@/lib/config';
import { metaAdapter, MetaError, subscribe } from '@/lib/meta';
import { simulatedAdapter, SIM_ACCOUNT, SIM_MEDIA, simulationComment } from '@/lib/simulated';
import { ingest } from '@/lib/pipeline';
export const runtime = 'nodejs';
const ruleInput = z.object({
  mediaId: z.string().regex(/^\d+$/),
  keyword: z.string().trim().min(1).max(80),
  replyText: z.string().trim().min(1).max(700),
  link: z
    .url()
    .max(250)
    .refine((x) => new URL(x).protocol === 'https:'),
  enabled: z.boolean(),
});
const adapter = () => (provider() === 'meta' ? metaAdapter : simulatedAdapter);
async function connection() {
  const c = await db.proofConnection.findUnique({ where: { id: 'proof' } });
  if (!c || c.status !== 'connected' || c.expiresAt <= new Date())
    throw new Error('connection_not_ready');
  if ((c.accountId === SIM_ACCOUNT) !== (provider() === 'simulated'))
    throw new Error('adapter_mismatch');
  return c;
}
export async function GET() {
  try {
    await requireOperator();
    const [c, rule, deliveries, events, heartbeat] = await Promise.all([
      db.proofConnection.findUnique({
        where: { id: 'proof' },
        select: {
          accountId: true,
          username: true,
          status: true,
          expiresAt: true,
          subscribed: true,
        },
      }),
      db.proofRule.findUnique({ where: { id: 'proof' } }),
      db.delivery.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          provider: true,
          source: true,
          status: true,
          attempts: true,
          errorKind: true,
          errorCode: true,
          errorSubcode: true,
          traceId: true,
          messageId: true,
          createdAt: true,
          observedAt: true,
        },
      }),
      db.commentEvent.count(),
      db.workerState.findUnique({ where: { id: 'proof' } }),
    ]);
    const workerReady = Boolean(
      heartbeat &&
      heartbeat.provider === provider() &&
      Date.now() - heartbeat.lastSeenAt.getTime() < 90000,
    );
    return Response.json({
      connection: c,
      rule,
      deliveries,
      events,
      workerReady,
      config: {
        provider: provider(),
        metaConfigured: Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),
        realSendEnabled: realSending(),
        automaticEnabled: automaticSending(),
        callbackUrl: `${baseUrl()}/api/meta/callback`,
        webhookUrl: `${baseUrl()}/api/meta/webhook`,
      },
    });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error && e.message === 'unauthorized' ? 'unauthorized' : 'unavailable',
      },
      { status: e instanceof Error && e.message === 'unauthorized' ? 401 : 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireOperator();
    const raw = await request.text();
    if (raw.length > 10000) return Response.json({ error: 'invalid_input' }, { status: 400 });
    const input = JSON.parse(raw);
    switch (input.action) {
      case 'logout':
        await db.operatorSession.deleteMany({
          where: { tokenHash: hash((await cookies()).get(COOKIE)?.value ?? '') },
        });
        (await cookies()).delete(COOKIE);
        break;
      case 'media': {
        const c = await connection();
        return Response.json({
          media: await adapter().media(c.accountId, decrypt(c.tokenCipher, `token:${c.accountId}`)),
        });
      }
      case 'rule': {
        const values = ruleInput.parse(input.rule);
        const c = await connection();
        const media = await adapter().media(
          c.accountId,
          decrypt(c.tokenCipher, `token:${c.accountId}`),
        );
        const selected = media.find((m) => m.id === values.mediaId);
        if (!selected || !['FEED', 'REELS'].includes(selected.media_product_type ?? ''))
          throw new Error('media_not_owned');
        const data = { ...values, accountId: c.accountId };
        await db.proofRule.upsert({
          where: { id: 'proof' },
          create: { id: 'proof', ...data },
          update: data,
        });
        break;
      }
      case 'subscribe': {
        if (provider() !== 'meta') throw new Error('simulation_cannot_subscribe');
        const c = await connection();
        await subscribe(c.accountId, decrypt(c.tokenCipher, `token:${c.accountId}`));
        await db.proofConnection.update({ where: { id: 'proof' }, data: { subscribed: true } });
        break;
      }
      case 'comments': {
        const c = await connection();
        const rule = await db.proofRule.findUniqueOrThrow({ where: { id: 'proof' } });
        if (rule.accountId !== c.accountId) throw new Error('rule_mismatch');
        return Response.json({
          comments: await adapter().comments(
            rule.mediaId,
            decrypt(c.tokenCipher, `token:${c.accountId}`),
          ),
        });
      }
      case 'manual': {
        if (!/^\d+$/.test(input.commentId ?? '')) throw new Error('invalid_comment');
        const c = await connection();
        const rule = await db.proofRule.findUniqueOrThrow({ where: { id: 'proof' } });
        const comment = await adapter().comment(
          input.commentId,
          decrypt(c.tokenCipher, `token:${c.accountId}`),
        );
        if (comment.media?.id !== rule.mediaId || rule.accountId !== c.accountId)
          throw new Error('media_not_owned');
        await ingest(
          [
            {
              accountId: c.accountId,
              commentId: comment.id,
              mediaId: comment.media.id,
              text: comment.text,
              authorId: comment.from?.id,
              authorUsername: comment.from?.username ?? comment.username,
              parentId: comment.parent_id,
              productType: comment.media.media_product_type,
            },
          ],
          provider() === 'meta' ? 'manual' : 'simulation',
        );
        break;
      }
      case 'simulation_setup': {
        if (provider() !== 'simulated') throw new Error('select_simulated_adapter');
        const current = await db.proofConnection.findUnique({ where: { id: 'proof' } });
        if (current && current.accountId !== SIM_ACCOUNT && current.status === 'connected')
          throw new Error('disconnect_real_account_first');
        const data = {
          accountId: SIM_ACCOUNT,
          appScopedId: 'simulation',
          username: 'SIMULATED',
          tokenCipher: encrypt('simulation-only', `token:${SIM_ACCOUNT}`),
          expiresAt: new Date(Date.now() + 60 * 86400_000),
          status: 'connected',
          subscribed: false,
        };
        await db.proofConnection.upsert({
          where: { id: 'proof' },
          create: { id: 'proof', ...data },
          update: data,
        });
        await db.proofRule.upsert({
          where: { id: 'proof' },
          create: {
            id: 'proof',
            accountId: SIM_ACCOUNT,
            mediaId: SIM_MEDIA,
            keyword: 'لینک',
            replyText: 'این پاسخ شبیه‌سازی است',
            link: 'https://example.com',
            enabled: true,
          },
          update: {
            accountId: SIM_ACCOUNT,
            mediaId: SIM_MEDIA,
            keyword: 'لینک',
            replyText: 'این پاسخ شبیه‌سازی است',
            link: 'https://example.com',
            enabled: true,
          },
        });
        break;
      }
      case 'simulation_comment': {
        if (provider() !== 'simulated') throw new Error('simulation_only');
        const c = simulationComment();
        await ingest(
          [
            {
              accountId: SIM_ACCOUNT,
              commentId: c.id,
              mediaId: SIM_MEDIA,
              text: c.text,
              authorId: c.from?.id,
              productType: 'FEED',
            },
          ],
          'simulation',
        );
        break;
      }
      case 'disconnect': {
        await db.$transaction(async (tx) => {
          await tx.proofConnection.updateMany({
            data: { status: 'disconnected', tokenCipher: '', subscribed: false },
          });
          await tx.proofRule.updateMany({ data: { enabled: false } });
          await tx.delivery.updateMany({
            where: { status: { in: ['pending', 'preparing'] } },
            data: { status: 'skipped', leaseUntil: null, leaseToken: null },
          });
        });
        break;
      }
      case 'purge': {
        if (input.confirm !== 'DELETE')
          return Response.json({ error: 'confirmation_required' }, { status: 400 });
        await db.$transaction(async (tx) => {
          const c = await tx.proofConnection.findUnique({ where: { id: 'proof' } });
          if (c) {
            await tx.proofConnection.update({
              where: { id: 'proof' },
              data: { status: 'disconnected', tokenCipher: '', subscribed: false },
            });
            await tx.proofRule.updateMany({ data: { enabled: false } });
            await tx.delivery.updateMany({
              where: { accountId: c.accountId, status: { in: ['pending', 'preparing'] } },
              data: { status: 'skipped', leaseUntil: null, leaseToken: null },
            });
            if (
              await tx.delivery.findFirst({ where: { accountId: c.accountId, status: 'sending' } })
            )
              throw new Error('sending_in_progress');
            await tx.commentEvent.deleteMany({ where: { accountId: c.accountId } });
          }
          await tx.proofRule.deleteMany();
          await tx.proofConnection.deleteMany();
          await tx.connectionInvite.deleteMany();
          await tx.oAuthAttempt.deleteMany();
        });
        break;
      }
      case 'observed': {
        const id = z.string().min(1).max(100).parse(input.id);
        await db.delivery.updateMany({
          where: { id, provider: 'meta', status: 'accepted' },
          data: { observedAt: new Date() },
        });
        break;
      }
      default:
        throw new Error('invalid_action');
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'unauthorized')
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'forbidden')
      return Response.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof Error && e.message === 'sending_in_progress')
      return Response.json({ error: 'sending_in_progress' }, { status: 409 });
    if (e instanceof MetaError)
      return Response.json(
        { error: e.kind, code: e.code, subcode: e.subcode, traceId: e.traceId },
        { status: 502 },
      );
    if (e instanceof z.ZodError) return Response.json({ error: 'invalid_input' }, { status: 400 });
    return Response.json({ error: 'operation_unavailable' }, { status: 400 });
  }
}
