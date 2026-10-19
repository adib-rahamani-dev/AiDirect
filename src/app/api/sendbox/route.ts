import { requireOperator, requireOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
import { baseUrl } from '@/lib/config';
import { SendboxError, sendboxAccounts, sendboxInfo } from '@/lib/sendbox';
import { InputError, readJson } from '@/lib/http';
import { expireSendboxEvidence } from '@/lib/sendbox-store';
export const runtime = 'nodejs';
export async function GET() {
  try {
    await requireOperator();
    await expireSendboxEvidence();
    const [connection, events] = await Promise.all([
      db.sendboxConnection.findUnique({
        where: { id: 'proof' },
        select: { username: true, expiresAt: true },
      }),
      db.sendboxWebhookEvent.findMany({
        orderBy: { receivedAt: 'desc' },
        take: 20,
        select: { eventType: true, receivedAt: true },
      }),
    ]);
    return Response.json({
      configured: Boolean(process.env.SENDBOX_API_KEY && process.env.SENDBOX_WEBHOOK_SECRET),
      webhookUrl: `${baseUrl()}/api/sendbox/webhook`,
      callbackUrl: `${baseUrl()}/api/sendbox/callback`,
      connection,
      events,
      sendingEnabled: false,
    });
  } catch (e) {
    return Response.json(
      { error: 'unavailable' },
      { status: e instanceof Error && e.message === 'unauthorized' ? 401 : 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireOperator();
    const input = await readJson(request, 2000);
    if (input.action === 'inspect') {
      const [info, accounts] = await Promise.all([sendboxInfo(), sendboxAccounts()]);
      return Response.json({
        configured: info.configured,
        accountLimit: info.plan.account_limit,
        accounts: accounts.map(({ id, username, is_active, expires_at }) => ({
          id,
          username,
          is_active,
          expires_at,
        })),
      });
    }
    if (input.action === 'disconnect') {
      // Local deletion only; remote revocation is available in the provider panel.
      await db.$transaction([
        db.sendboxDmDelivery.updateMany({
          where: { status: { in: ['pending', 'sending'] } },
          data: { status: 'suppressed', errorKind: 'disconnected', payloadCipher: null },
        }),
        db.sendboxDmDelivery.updateMany({
          data: { payloadCipher: null },
          where: { payloadCipher: { not: null } },
        }),
        db.sendboxWebhookEvent.deleteMany(),
        db.sendboxConnection.deleteMany(),
      ]);
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'invalid_input' }, { status: 400 });
  } catch (e) {
    const status =
      e instanceof InputError
        ? e.status
        : e instanceof Error && e.message === 'unauthorized'
          ? 401
          : e instanceof Error && e.message === 'forbidden'
            ? 403
            : e instanceof SendboxError && e.kind === 'rate_limit'
              ? 429
              : 503;
    return Response.json(
      { error: e instanceof SendboxError ? e.message : 'unavailable' },
      { status },
    );
  }
}
