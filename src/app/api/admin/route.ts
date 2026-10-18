import { requireOperator } from '@/lib/auth';
import { db } from '@/lib/db';
import { expireSendboxEvidence } from '@/lib/sendbox-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireOperator();
    await expireSendboxEvidence();
    const [connection, events, eventCount, invites] = await Promise.all([
      db.sendboxConnection.findUnique({
        where: { id: 'proof' },
        select: { username: true, expiresAt: true, connectedAt: true },
      }),
      db.sendboxWebhookEvent.findMany({
        orderBy: { receivedAt: 'desc' },
        take: 20,
        select: { eventId: true, eventType: true, receivedAt: true },
      }),
      db.sendboxWebhookEvent.count(),
      db.sendboxInvite.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          claimedAt: true,
          usedAt: true,
          revokedAt: true,
        },
      }),
    ]);
    return Response.json(
      {
        connection,
        events,
        eventCount,
        invites,
        sendingEnabled: false,
        configured: Boolean(process.env.SENDBOX_API_KEY && process.env.SENDBOX_WEBHOOK_SECRET),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      { error: 'unavailable' },
      { status: error instanceof Error && error.message === 'unauthorized' ? 401 : 503 },
    );
  }
}
