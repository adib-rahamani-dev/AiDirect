import { customerIdentity, ensureCustomerWorkspace } from '@/lib/customer-auth';
import { db } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await customerIdentity(request.headers);
    const workspace = await ensureCustomerWorkspace(user.id, user.name);
    const [pages, products, instagram, received, accepted, unknown] = await Promise.all([
      db.catalogPage.count({ where: { workspaceId: workspace.id } }),
      db.catalogProduct.count({ where: { workspaceId: workspace.id } }),
      db.instagramConnection.findUnique({
        where: { workspaceId: workspace.id },
        select: { username: true, status: true, expiresAt: true, subscribed: true, autoDm: true },
      }),
      db.instagramMessage.count({
        where: {
          workspaceId: workspace.id,
          direction: 'inbound',
          receivedAt: { gte: new Date(Date.now() - 7 * 86400000) },
        },
      }),
      db.instagramJob.count({
        where: {
          workspaceId: workspace.id,
          status: 'accepted',
          createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
        },
      }),
      db.instagramJob.count({ where: { workspaceId: workspace.id, status: 'unknown' } }),
    ]);
    return Response.json(
      {
        user: {
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          role: user.platformRole,
        },
        workspace: { id: workspace.id, name: workspace.name, paused: workspace.paused },
        stats: { pages, products, received, accepted, unknown },
        instagram,
        instagramConnected: instagram?.status === 'connected' && instagram.expiresAt > new Date(),
        sendingEnabled: process.env.META_CUSTOMER_SEND_ENABLED === 'true',
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
