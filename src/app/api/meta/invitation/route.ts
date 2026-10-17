import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { requireOperator, requireOrigin } from '@/lib/auth';
import { baseUrl, provider } from '@/lib/config';
import { hash } from '@/lib/crypto';
import { db } from '@/lib/db';
import { INVITE_COOKIE, connectionActor } from '@/lib/invitation';
import { InputError, readJson } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET() {
  try {
    await connectionActor();
    return Response.json({
      ready: true,
      metaReady:
        provider() === 'meta' &&
        Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),
    });
  } catch {
    return Response.json({ ready: false }, { status: 401 });
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = await readJson(request, 1024);
    if (input.action === 'create') {
      await requireOperator();
      const current = await db.proofConnection.findUnique({ where: { id: 'proof' } });
      if (current?.status === 'connected' && current.accountId !== '90001')
        return Response.json({ error: 'disconnect_first' }, { status: 409 });
      if (
        provider() !== 'meta' ||
        !process.env.INSTAGRAM_APP_ID ||
        !process.env.INSTAGRAM_APP_SECRET
      )
        return Response.json({ error: 'meta_not_configured' }, { status: 409 });
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 2 * 3600_000);
      await db.$transaction(async (tx) => {
        await tx.connectionInvite.deleteMany({});
        await tx.connectionInvite.create({ data: { tokenHash: hash(token), expiresAt } });
      });
      return Response.json({ url: `${baseUrl()}/connect#token=${token}`, expiresAt });
    }
    if (
      input.action !== 'redeem' ||
      typeof input.token !== 'string' ||
      !/^[-\w]{43}$/.test(input.token)
    )
      return Response.json({ error: 'invalid' }, { status: 400 });
    const claim = await db.connectionInvite.updateMany({
      where: {
        tokenHash: hash(input.token),
        claimedAt: null,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { claimedAt: new Date() },
    });
    if (!claim.count) return Response.json({ error: 'expired_or_used' }, { status: 410 });
    (await cookies()).set(INVITE_COOKIE, input.token, {
      httpOnly: true,
      secure: baseUrl().startsWith('https://'),
      sameSite: 'lax',
      maxAge: 2 * 3600,
      path: '/',
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof InputError)
      return Response.json({ error: 'invalid_input' }, { status: e.status });
    const status =
      e instanceof Error && e.message === 'unauthorized'
        ? 401
        : e instanceof Error && e.message === 'forbidden'
          ? 403
          : 503;
    return Response.json({ error: 'unavailable' }, { status });
  }
}
