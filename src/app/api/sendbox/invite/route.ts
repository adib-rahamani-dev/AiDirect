import { cookies } from 'next/headers';
import { requireOperator, requireOrigin } from '@/lib/auth';
import { baseUrl } from '@/lib/config';
import { InputError, readJson } from '@/lib/http';
import { sendboxInfo } from '@/lib/sendbox';
import {
  createSendboxInvite,
  inspectSendboxGrant,
  redeemSendboxInvite,
  revokeSendboxInvite,
  SENDBOX_INVITE_COOKIE,
  SendboxInviteError,
} from '@/lib/sendbox-invites';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    try {
      await requireOperator();
      return Response.json({ role: 'operator', status: 'ready' });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'unauthorized') throw error;
    }
    const grant = await inspectSendboxGrant((await cookies()).get(SENDBOX_INVITE_COOKIE)?.value);
    return Response.json({
      role: 'owner',
      status: grant.usedAt ? 'completed' : 'ready',
      expiresAt: grant.expiresAt,
    });
  } catch (error) {
    return Response.json(
      { status: 'invite_required' },
      { status: error instanceof SendboxInviteError ? 401 : 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = await readJson(request, 1024);
    if (input.action === 'redeem') {
      const grant = await redeemSendboxInvite(input.token);
      (await cookies()).set(SENDBOX_INVITE_COOKIE, grant.cookie, {
        httpOnly: true,
        secure: baseUrl().startsWith('https:'),
        sameSite: 'lax',
        path: '/',
        maxAge: Math.max(1, Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000)),
      });
      return Response.json({ ok: true, expiresAt: grant.expiresAt });
    }
    await requireOperator();
    if (input.action === 'create') {
      const info = await sendboxInfo();
      if (!info.configured) return Response.json({ error: 'settings_required' }, { status: 409 });
      const invite = await createSendboxInvite();
      return Response.json(
        {
          url: `${baseUrl()}/connect/instagram#token=${invite.token}`,
          expiresAt: invite.expiresAt,
          id: invite.id,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (input.action === 'revoke' && typeof input.id === 'string' && input.id.length < 100) {
      await revokeSendboxInvite(input.id);
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'invalid_input' }, { status: 400 });
  } catch (error) {
    const status =
      error instanceof InputError
        ? error.status
        : error instanceof SendboxInviteError
          ? error.kind === 'disconnect_first'
            ? 409
            : 410
          : error instanceof Error && error.message === 'unauthorized'
            ? 401
            : error instanceof Error && error.message === 'forbidden'
              ? 403
              : 503;
    return Response.json(
      { error: error instanceof SendboxInviteError ? error.kind : 'unavailable' },
      { status },
    );
  }
}
