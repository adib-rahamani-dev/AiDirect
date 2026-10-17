import { db } from '@/lib/db';
import { provider } from '@/lib/config';
export const runtime = 'nodejs';
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const heartbeat = await db.workerState.findUnique({ where: { id: 'proof' } });
    const ready =
      heartbeat &&
      heartbeat.provider === provider() &&
      Date.now() - heartbeat.lastSeenAt.getTime() < 90000;
    return Response.json(
      {
        status: ready ? 'ok' : 'degraded',
        database: 'ok',
        worker: ready ? 'ready' : 'missing',
        stage: 'proof',
        realProof: 'not_automatically_asserted',
      },
      { status: ready ? 200 : 503 },
    );
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
