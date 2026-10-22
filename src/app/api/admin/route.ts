import { requireOperator } from '@/lib/auth';
import { db } from '@/lib/db';
import { expireSendboxEvidence } from '@/lib/sendbox-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireOperator();
    await expireSendboxEvidence();
    const [connection, events, eventCount, jobs] = await Promise.all([
      db.instagramConnection.findUnique({
        where: { workspaceId: 'operator-catalog' },
        select: { username: true, expiresAt: true, issuedAt: true, status: true },
      }),
      db.instagramWebhookEnvelope.findMany({
        orderBy: { receivedAt: 'desc' },
        take: 20,
        select: { id: true, status: true, receivedAt: true },
      }),
      db.instagramWebhookEnvelope.count(),
      db.instagramJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          kind: true,
          errorKind: true,
          createdAt: true,
          connection: { select: { username: true, workspace: { select: { name: true } } } },
        },
      }),
    ]);
    return Response.json(
      {
        connection:
          connection?.status === 'connected'
            ? {
                username: connection.username,
                expiresAt: connection.expiresAt,
                connectedAt: connection.issuedAt,
              }
            : null,
        events: events.map((e) => ({
          eventId: e.id,
          eventType: 'instagram_' + e.status,
          receivedAt: e.receivedAt,
        })),
        eventCount,
        invites: [],
        jobs: jobs.map(({ connection, ...job }) => ({
          ...job,
          workspace: connection.workspace.name,
          username: connection.username,
        })),
        sendingEnabled: false,
        configured: Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),
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
