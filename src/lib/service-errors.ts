import { InputError } from './http';
import { z } from 'zod';
export function serviceFailure(error: unknown) {
  const status =
    error instanceof z.ZodError
      ? 400
      : error instanceof InputError
        ? error.status
        : error instanceof Error && error.message === 'unauthorized'
          ? 401
          : error instanceof Error && error.message === 'forbidden'
            ? 403
            : 503;
  return Response.json(
    { error: 'request_failed' },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
