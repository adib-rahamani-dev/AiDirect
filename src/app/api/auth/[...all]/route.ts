import { customerAuth, consumeAuthLimit } from '@/lib/customer-auth';
import { requireOrigin } from '@/lib/auth';
import { readJson, InputError } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const allowed = new Set([
  'sign-up/email',
  'sign-in/email',
  'sign-out',
  'get-session',
  'change-password',
  'update-user',
  'ok',
]);
async function handle(request: Request) {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, '');
    if (!allowed.has(path)) return Response.json({ error: 'not_found' }, { status: 404 });
    if (request.method === 'POST') {
      requireOrigin(request);
      const input = await readJson(request, 4096);
      // Never accept role/status, callback URLs or a user/workspace ID from signup.
      const permitted =
        path === 'sign-up/email'
          ? ['name', 'email', 'password']
          : path === 'sign-in/email'
            ? ['email', 'password', 'rememberMe']
            : path === 'change-password'
              ? ['currentPassword', 'newPassword', 'revokeOtherSessions']
              : path === 'update-user'
                ? ['name']
                : [];
      if (Object.keys(input).some((key) => !permitted.includes(key)))
        return Response.json({ error: 'invalid_input' }, { status: 400 });
      if (path === 'sign-up/email' || path === 'sign-in/email') {
        if (typeof input.email === 'string') input.email = input.email.trim().toLowerCase();
        const rule =
          path === 'sign-up/email' ? { window: 3600, max: 30 } : { window: 60, max: 120 };
        const limit = await consumeAuthLimit('global:' + path, rule.window, rule.max);
        if (!limit.allowed)
          return Response.json(
            { error: 'wait' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
          );
      }
      const headers = new Headers(request.headers);
      headers.delete('content-length');
      return await customerAuth().handler(
        new Request(request.url, { method: 'POST', headers, body: JSON.stringify(input) }),
      );
    }
    return await customerAuth().handler(request);
  } catch (error) {
    return Response.json(
      { error: 'request_failed' },
      {
        status:
          error instanceof InputError
            ? error.status
            : error instanceof Error && error.message === 'forbidden'
              ? 403
              : 503,
      },
    );
  }
}
export const GET = handle;
export const POST = handle;
