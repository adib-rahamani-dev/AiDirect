import { POST as ownerLogin } from '../../proof/session/route';
import { POST as customerLogin } from '../../auth/[...all]/route';
import { requireOrigin } from '@/lib/auth';
import { readJson, InputError } from '@/lib/http';
import { db } from '@/lib/db';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const data = z
      .object({ email: z.string().email().max(254), password: z.string().min(1).max(256) })
      .strict()
      .parse(await readJson(request, 2048));
    data.email = data.email.trim().toLowerCase();
    const owner = data.email === process.env.OPERATOR_EMAIL?.trim().toLowerCase();
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.delete('content-length');
    const forwarded = new Request(
      new URL(owner ? '/api/proof/session' : '/api/auth/sign-in/email', request.url),
      { method: 'POST', headers: forwardedHeaders, body: JSON.stringify(data) },
    );
    const response = owner ? await ownerLogin(forwarded) : await customerLogin(forwarded);
    if (!response.ok)
      return Response.json(
        { error: 'sign_in_failed' },
        {
          status: response.status,
          headers: {
            'Retry-After':
              response.headers.get('retry-after') || response.headers.get('x-retry-after') || '3',
          },
        },
      );
    const user = owner
      ? null
      : await db.user.findUnique({
          where: { email: data.email },
          select: { platformRole: true, suspended: true },
        });
    if (!owner && (!user || user.suspended))
      return Response.json({ error: 'sign_in_failed' }, { status: 401 });
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return Response.json(
      {
        ok: true,
        destination: owner
          ? '/admin'
          : user?.platformRole === 'SENIOR_ADMIN'
            ? '/admin/users'
            : '/dashboard',
      },
      { headers },
    );
  } catch (error) {
    return Response.json(
      { error: 'sign_in_failed' },
      {
        status:
          error instanceof InputError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : error instanceof Error && error.message === 'forbidden'
                ? 403
                : 503,
      },
    );
  }
}
