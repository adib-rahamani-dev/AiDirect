import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sendboxConnectionActor } from '@/lib/sendbox-actor';
import { consumeSendboxAttempt, finishSendboxConnection } from '@/lib/sendbox-connection';
import { baseUrl } from '@/lib/config';
import { equal } from '@/lib/crypto';
import { sendboxAccounts } from '@/lib/sendbox';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  let result = 'connection_failed';
  let destination = '/connect/instagram';
  try {
    const actor = await sendboxConnectionActor();
    if (!actor.inviteHash) destination = '/admin';
    const params = new URL(request.url).searchParams;
    const state = params.get('id') ?? '';
    const cookie = (await cookies()).get('aidirect_sendbox')?.value ?? '';
    if (!/^[\w-]{43}$/.test(state) || !cookie || !equal(state, cookie)) throw new Error();
    const consumed = await consumeSendboxAttempt(state, actor.inviteHash);
    (await cookies()).delete('aidirect_sendbox');
    if (!consumed || params.get('status') !== 'success') throw new Error();
    // Never trust callback account_id/username alone; check ownership with the authenticated API.
    const owned = (await sendboxAccounts()).find(
      (a) =>
        a.id === params.get('account_id') && a.is_active && Date.parse(a.expires_at) > Date.now(),
    );
    if (!owned) throw new Error();
    await finishSendboxConnection(owned, actor.inviteHash);
    result = 'connected';
  } catch {
    /* Callback query strings and provider responses may contain secrets: never log them. */
  }
  return NextResponse.redirect(`${baseUrl()}${destination}?result=${result}`);
}
