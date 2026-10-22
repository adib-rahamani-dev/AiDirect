import { requireOperator } from '@/lib/auth';
import { db } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await requireOperator();
    const [users, suspended, products, pages, latest, connections, accepted, unknown, queued] =
      await Promise.all([
        db.user.count({ where: { email: { not: null } } }),
        db.user.count({ where: { email: { not: null }, suspended: true } }),
        db.catalogProduct.count(),
        db.catalogPage.count(),
        db.user.findMany({
          where: { email: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { name: true, createdAt: true, platformRole: true },
        }),
        db.instagramConnection.count({
          where: { status: 'connected', expiresAt: { gt: new Date() } },
        }),
        db.instagramJob.count({ where: { status: 'accepted' } }),
        db.instagramJob.count({ where: { status: 'unknown' } }),
        db.instagramJob.count({ where: { status: { in: ['pending', 'sending'] } } }),
      ]);
    return Response.json(
      {
        users,
        suspended,
        products,
        pages,
        latest,
        connections,
        accepted,
        unknown,
        queued,
        signupEnabled: process.env.SIGNUP_ENABLED === 'true',
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
