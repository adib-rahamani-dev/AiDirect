import { db } from './db';
import { z } from 'zod';
import type { PlatformActor } from './platform-access';
import { CatalogError } from './catalog';
export async function administerUser(actor: PlatformActor, input: unknown) {
  if (actor.role !== 'SUPER_ADMIN') throw new CatalogError(403, 'forbidden');
  const data = z
    .discriminatedUnion('action', [
      z
        .object({
          action: z.literal('role'),
          id: z.string().max(100),
          role: z.enum(['CUSTOMER', 'SENIOR_ADMIN']),
        })
        .strict(),
      z
        .object({ action: z.literal('suspend'), id: z.string().max(100), suspended: z.boolean() })
        .strict(),
      z.object({ action: z.literal('revoke_sessions'), id: z.string().max(100) }).strict(),
    ])
    .parse(input);
  return db.$transaction(async (tx) => {
    const users = await tx.$queryRaw<
      { id: string; email: string | null; platformRole: string; suspended: boolean }[]
    >`SELECT id,email,"platformRole",suspended FROM "User" WHERE id=${data.id} FOR UPDATE`;
    const target = users[0];
    if (
      !target?.email ||
      target.id === 'operator' ||
      target.email === process.env.OPERATOR_EMAIL?.trim().toLowerCase()
    )
      throw new CatalogError(404, 'not_found');
    const changes =
      data.action === 'role'
        ? { platformRole: data.role }
        : data.action === 'suspend'
          ? { suspended: data.suspended }
          : {};
    await tx.user.update({ where: { id: data.id }, data: changes });
    await tx.session.deleteMany({ where: { userId: data.id } });
    await tx.adminAudit.create({
      data: {
        actorId: actor.id,
        action: data.action,
        targetId: data.id,
        detail: JSON.stringify(
          data.action === 'role'
            ? { before: target.platformRole, after: data.role }
            : data.action === 'suspend'
              ? { before: target.suspended, after: data.suspended }
              : { revoked: true },
        ),
      },
    });
    return { ok: true };
  });
}
