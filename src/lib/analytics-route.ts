import { requireOperator, requireOrigin } from './auth';
import { customerIdentity, ensureCustomerWorkspace, consumeAuthLimit } from './customer-auth';
import { operatorCatalogIdentity, CatalogError, catalogAccess } from './catalog';
import { defaultWorkspace } from './platform-access';
import { analyticsSnapshot, calendarDays } from './analytics';
import { analysisAvailability, generateCatalogAnalysis } from './analytics-ai';
import { readJson, InputError } from './http';
import { z } from 'zod';
async function actor(request: Request) {
  if (new URL(request.url).pathname.startsWith('/api/admin/')) {
    await requireOperator();
    return operatorCatalogIdentity();
  }
  const user = await customerIdentity(request.headers);
  await ensureCustomerWorkspace(user.id, user.name);
  return user.id;
}
const period = z
  .union([z.literal('7'), z.literal('30'), z.literal('90')])
  .transform((v) => Number(v) as 7 | 30 | 90);
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const status =
    error instanceof CatalogError
      ? error.status
      : error instanceof InputError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : code === 'unauthorized'
            ? 401
            : code === 'forbidden'
              ? 403
              : code === 'ai_not_configured'
                ? 409
                : code === 'ai_rate_limited'
                  ? 429
                  : 503;
  return Response.json(
    {
      error: ['ai_not_configured', 'ai_rate_limited', 'ai_unavailable'].includes(code)
        ? code
        : 'unavailable',
      ...(code === 'ai_unavailable' && typeof error === 'object' && error && 'failureKind' in error
        ? { failureKind: error.failureKind }
        : {}),
      ...(code === 'ai_unavailable' &&
      typeof error === 'object' &&
      error &&
      'providerStatus' in error &&
      typeof error.providerStatus === 'number'
        ? { providerStatus: error.providerStatus }
        : {}),
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function GET(request: Request) {
  try {
    const userId = await actor(request),
      params = new URL(request.url).searchParams;
    const workspaceId = params.get('workspace') || (await defaultWorkspace(userId));
    const days = period.parse(params.get('days') || '30');
    return Response.json(
      { ...(await analyticsSnapshot(userId, workspaceId, days)), ai: analysisAvailability() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const userId = await actor(request);
    const input = z
      .object({
        consent: z.literal(true),
        days: period.default(30),
        workspaceId: z.string().min(1).max(100).optional(),
      })
      .strict()
      .parse(await readJson(request, 1024));
    const snapshot = await analyticsSnapshot(
      userId,
      input.workspaceId || (await defaultWorkspace(userId)),
      input.days,
    );
    await catalogAccess(userId, snapshot.workspace.id, true);
    if (analysisAvailability().mode !== 'available') throw new Error('ai_not_configured');
    const day = calendarDays(1)[0];
    for (const [key, seconds, max] of [
      [`analysis-minute:${snapshot.workspace.id}`, 60, 1],
      ['analysis-global-minute', 60, 2],
      [`analysis-day:${day}:${snapshot.workspace.id}`, 86400, 5],
      [`analysis-global:${day}`, 86400, 20],
    ] as const) {
      const limit = await consumeAuthLimit(key, seconds, max);
      if (!limit.allowed)
        return Response.json(
          { error: 'ai_limit' },
          { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
        );
    }
    const report = await generateCatalogAnalysis(snapshot);
    return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}
