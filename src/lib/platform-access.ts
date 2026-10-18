import { cookies } from 'next/headers';
import { COOKIE, isActiveSession } from './auth';
import { customerIdentity, ensureCustomerWorkspace } from './customer-auth';
import { operatorCatalogIdentity } from './catalog';
import { db } from './db';
export type PlatformActor = { id: string; role: 'SUPER_ADMIN' | 'SENIOR_ADMIN' };
export async function hasOwnerSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  return Boolean(token && (await isActiveSession(token)));
}
export async function platformActor(headers: Headers): Promise<PlatformActor> {
  if (await hasOwnerSession()) return { id: 'operator', role: 'SUPER_ADMIN' };
  const user = await customerIdentity(headers);
  if (user.platformRole !== 'SENIOR_ADMIN') throw new Error('forbidden');
  return { id: user.id, role: 'SENIOR_ADMIN' };
}
export async function catalogActor(headers: Headers, customerOnly = false) {
  if (!customerOnly && (await hasOwnerSession()))
    return { id: await operatorCatalogIdentity(), owner: true };
  const user = await customerIdentity(headers);
  await ensureCustomerWorkspace(user.id, user.name);
  return { id: user.id, owner: false };
}
export async function defaultWorkspace(userId: string) {
  const membership = await db.membership.findFirst({
    where: { userId },
    orderBy: { workspaceId: 'asc' },
    select: { workspaceId: true },
  });
  if (!membership) throw new Error('workspace_missing');
  return membership.workspaceId;
}
