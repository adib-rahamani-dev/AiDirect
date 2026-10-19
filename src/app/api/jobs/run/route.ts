import { equal } from '@/lib/crypto';
import { db } from '@/lib/db';
import { provider } from '@/lib/config';
import { refreshIfNeeded, tick } from '@/lib/worker';
import { expireSendboxEvidence } from '@/lib/sendbox-store';
import { tickDm } from '@/lib/sendbox-dm';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || !equal(request.headers.get('authorization') ?? '', `Bearer ${expected}`))
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const heartbeat = async () => {
      const data = { lastSeenAt: new Date(), provider: provider() };
      await db.workerState.upsert({
        where: { id: 'proof' },
        create: { id: 'proof', ...data },
        update: data,
      });
    };
    await heartbeat();
    await expireSendboxEvidence();
    const dmProcessed = await tickDm();
    await refreshIfNeeded();
    const processed = await tick();
    await heartbeat();
    return Response.json({ ok: true, processed, dmProcessed });
  } catch {
    return Response.json({ error: 'worker_unavailable' }, { status: 503 });
  }
}
