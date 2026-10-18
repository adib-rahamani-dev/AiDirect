import { customerIdentity, consumeAuthLimit } from '@/lib/customer-auth';
import { requireOrigin } from '@/lib/auth';
import { verifyPassword } from '@/lib/password';
import { readJson, InputError } from '@/lib/http';
import { db } from '@/lib/db';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await customerIdentity(request.headers);
    const workspace = await db.workspace.findUnique({
      where: { ownerId: user.id },
      select: {
        name: true,
        paused: true,
        pages: {
          select: {
            name: true,
            handle: true,
            products: {
              select: {
                name: true,
                description: true,
                category: true,
                priceToman: true,
                stock: true,
                active: true,
                url: true,
                posts: { select: { permalink: true } },
              },
            },
          },
        },
      },
    });
    return new Response(
      JSON.stringify(
        {
          account: { name: user.name, email: user.email, emailVerified: user.emailVerified },
          workspace,
          exportedAt: new Date().toISOString(),
        },
        (_, value) => (typeof value === 'bigint' ? String(value) : value),
      ),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="aidirect-account.json"',
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: 'unavailable' },
      { status: error instanceof Error && error.message === 'unauthorized' ? 401 : 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await customerIdentity(request.headers);
    const input = z
      .object({
        action: z.literal('delete_account'),
        confirmation: z.literal('حذف حساب'),
        password: z.string().max(256),
      })
      .strict()
      .parse(await readJson(request, 2048));
    const limit = await consumeAuthLimit('delete-account:' + user.id, 300, 5);
    if (!limit.allowed) return Response.json({ error: 'wait' }, { status: 429 });
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const account = await tx.account.findFirst({
        where: { userId: user.id, providerId: 'credential' },
        select: { password: true },
      });
      if (!account?.password || !(await verifyPassword(input.password, account.password)))
        throw new Error('forbidden');
      await tx.workspace.deleteMany({ where: { ownerId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
      await tx.adminAudit.create({
        data: {
          actorId: user.id,
          action: 'account_deleted',
          targetId: user.id,
          detail: '{"scope":"owned_workspace_and_account"}',
        },
      });
    });
    return Response.json({ deleted: true, scope: 'customer_account_and_owned_catalog' });
  } catch (error) {
    return Response.json(
      { error: 'delete_failed' },
      {
        status:
          error instanceof InputError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : error instanceof Error && error.message === 'unauthorized'
                ? 401
                : error instanceof Error && error.message === 'forbidden'
                  ? 403
                  : 503,
      },
    );
  }
}
