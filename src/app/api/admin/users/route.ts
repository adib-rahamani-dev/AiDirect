import { platformActor } from '@/lib/platform-access';
import { administerUser } from '@/lib/user-administration';
import { requireOrigin } from '@/lib/auth';
import { verifyPassword } from '@/lib/password';
import { consumeAuthLimit } from '@/lib/customer-auth';
import { readJson, InputError } from '@/lib/http';
import { db } from '@/lib/db';
import { CatalogError } from '@/lib/catalog';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function fail(error: unknown) {
  const status =
    error instanceof CatalogError
      ? error.status
      : error instanceof InputError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : error instanceof Error && error.message === 'unauthorized'
            ? 401
            : error instanceof Error && error.message === 'forbidden'
              ? 403
              : 503;
  return Response.json({ error: 'request_failed' }, { status });
}
export async function GET(request: Request) {
  try {
    const actor = await platformActor(request.headers);
    const params = new URL(request.url).searchParams;
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(params.get('page') || 1);
    const q = z
      .string()
      .max(100)
      .parse(params.get('q') || '')
      .trim();
    const role = z
      .enum(['CUSTOMER', 'SENIOR_ADMIN'])
      .optional()
      .parse(params.get('role') || undefined);
    const state = z
      .enum(['active', 'suspended'])
      .optional()
      .parse(params.get('state') || undefined);
    const where = {
      email: { not: null },
      ...(role ? { platformRole: role } : {}),
      ...(state ? { suspended: state === 'suspended' } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [users, total, registered, suspended, workspaces, products, newUsers, audit] =
      await Promise.all([
        db.user.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * 25,
          take: 25,
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            platformRole: true,
            suspended: true,
            createdAt: true,
            memberships: {
              select: {
                role: true,
                workspace: {
                  select: { name: true, paused: true, _count: { select: { pages: true } } },
                },
              },
            },
            _count: { select: { sessions: true } },
          },
        }),
        db.user.count({ where }),
        db.user.count({ where: { email: { not: null } } }),
        db.user.count({ where: { email: { not: null }, suspended: true } }),
        db.workspace.count(),
        db.catalogProduct.count(),
        db.user.count({
          where: { email: { not: null }, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
        }),
        actor.role === 'SUPER_ADMIN'
          ? db.adminAudit.findMany({
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: {
                id: true,
                actorId: true,
                action: true,
                targetId: true,
                detail: true,
                createdAt: true,
              },
            })
          : Promise.resolve([]),
      ]);
    return Response.json(
      {
        role: actor.role,
        users,
        total,
        page,
        stats: { registered, suspended, workspaces, products, newUsers },
        audit,
        scope: 'platform_administration',
        signupEnabled: process.env.SIGNUP_ENABLED === 'true',
        emailServiceReady: false,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const actor = await platformActor(request.headers);
    if (actor.role !== 'SUPER_ADMIN') throw new Error('forbidden');
    const limit = await consumeAuthLimit('admin-mutation:' + actor.id, 60, 10);
    if (!limit.allowed)
      return Response.json(
        { error: 'wait' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
      );
    const { password, ...input } = await readJson(request, 2048);
    if (
      typeof password !== 'string' ||
      !(await verifyPassword(password, process.env.OPERATOR_PASSWORD_HASH || ''))
    )
      throw new Error('forbidden');
    return Response.json(await administerUser(actor, input));
  } catch (error) {
    return fail(error);
  }
}
