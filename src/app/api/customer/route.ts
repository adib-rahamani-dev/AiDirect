import { customerIdentity, ensureCustomerWorkspace } from '@/lib/customer-auth';
import { db } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await customerIdentity(request.headers);
    const workspace = await ensureCustomerWorkspace(user.id, user.name);
    const [pages, products] = await Promise.all([
      db.catalogPage.count({ where: { workspaceId: workspace.id } }),
      db.catalogProduct.count({ where: { workspaceId: workspace.id } }),
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
        stats: { pages, products },
        instagramConnected: false,
        sendingEnabled: false,
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
