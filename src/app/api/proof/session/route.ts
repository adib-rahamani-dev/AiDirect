import { cookies } from 'next/headers';
import { COOKIE, newSession, requireOrigin } from '@/lib/auth';
import { baseUrl, required } from '@/lib/config';
import { equal, hash } from '@/lib/crypto';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { InputError, readJson } from '@/lib/http';
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const { secret, email, password } = await readJson(request, 2048);
    const claimed = await db.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "ProofLoginGuard" (id,"nextAttemptAt") VALUES ('operator',NOW()) ON CONFLICT (id) DO NOTHING`;
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`UPDATE "ProofLoginGuard" SET "nextAttemptAt"=NOW()+INTERVAL '3 seconds' WHERE id='operator' AND "nextAttemptAt"<=NOW() RETURNING id`;
      return rows.length > 0;
    });
    if (!claimed)
      return Response.json(
        { error: 'wait' },
        { status: 429, headers: { 'Retry-After': '3', 'Cache-Control': 'no-store' } },
      );
    const passwordHash = process.env.OPERATOR_PASSWORD_HASH;
    let authorized = false;
    if (passwordHash && process.env.OPERATOR_EMAIL && typeof password === 'string') {
      const passwordOk = await verifyPassword(password, passwordHash);
      authorized =
        passwordOk &&
        typeof email === 'string' &&
        equal(email.trim().toLowerCase(), process.env.OPERATOR_EMAIL.trim().toLowerCase());
    } else if (!process.env.VERCEL && !passwordHash && typeof secret === 'string') {
      authorized = equal(secret, required('PROOF_ADMIN_SECRET'));
    }
    if (!authorized) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const session = newSession();
    await db.operatorSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await db.operatorSession.create({
      data: { tokenHash: hash(session), expiresAt: new Date(Number(session.split('.')[0])) },
    });
    (await cookies()).set(COOKIE, session, {
      httpOnly: true,
      secure: baseUrl().startsWith('https://'),
      sameSite: 'lax',
      maxAge: 8 * 3600,
      path: '/',
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof InputError)
      return Response.json({ error: 'invalid_input' }, { status: e.status });
    return Response.json(
      { error: e instanceof Error && e.message === 'forbidden' ? 'forbidden' : 'unavailable' },
      { status: e instanceof Error && e.message === 'forbidden' ? 403 : 503 },
    );
  }
}
