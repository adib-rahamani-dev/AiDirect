import { requireOrigin } from '@/lib/auth';
import { catalogActor, defaultWorkspace } from '@/lib/platform-access';
import {
  catalogSnapshot,
  catalogMutation,
  CatalogError,
  previewRecommendation,
} from '@/lib/catalog';
import { db } from '@/lib/db';
import { InputError, readJson } from '@/lib/http';
import { csvCell } from '@/lib/recommendations';
import { ZodError } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function failure(error: unknown) {
  const status =
    error instanceof CatalogError
      ? error.status
      : error instanceof ZodError
        ? 400
        : error instanceof InputError
          ? error.status
          : error instanceof Error && error.message === 'unauthorized'
            ? 401
            : error instanceof Error && error.message === 'forbidden'
              ? 403
              : typeof error === 'object' && error && 'code' in error && error.code === 'P2002'
                ? 409
                : 503;
  return Response.json(
    { error: error instanceof CatalogError ? error.code : 'request_failed' },
    { status },
  );
}
export async function GET(request: Request) {
  try {
    const { id: userId } = await catalogActor(
      request.headers,
      new URL(request.url).pathname.startsWith('/api/customer/'),
    );
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspace') || (await defaultWorkspace(userId));
    const data = await catalogSnapshot(userId, workspaceId);
    if (url.searchParams.get('format') === 'csv') {
      const rows = [
        ['نام', 'دسته‌بندی', 'قیمت تومان', 'موجودی', 'فعال', 'لینک'],
        ...data.products.map((p) => [
          p.name,
          p.category,
          p.priceToman,
          String(p.stock),
          p.active ? 'بله' : 'خیر',
          p.url,
        ]),
      ];
      return new Response('\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="catalog.csv"',
          'Cache-Control': 'no-store',
        },
      });
    }
    const memberships = await db.membership.findMany({
      where: { userId },
      select: { workspace: { select: { id: true, name: true } } },
    });
    return Response.json(
      { ...data, workspaces: memberships.map((m) => m.workspace) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const { id: userId } = await catalogActor(
      request.headers,
      new URL(request.url).pathname.startsWith('/api/customer/'),
    );
    const input = await readJson(request, 12000);
    const workspaceId =
      typeof input.workspaceId === 'string' ? input.workspaceId : await defaultWorkspace(userId);
    const result =
      input.action === 'preview'
        ? await previewRecommendation(userId, workspaceId, input.data)
        : await catalogMutation(userId, workspaceId, input);
    return Response.json(result);
  } catch (error) {
    return failure(error);
  }
}
