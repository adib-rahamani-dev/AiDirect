import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { sendboxConnectionActor } from '@/lib/sendbox-actor';
import { baseUrl } from '@/lib/config';
import { db } from '@/lib/db';
import { hash } from '@/lib/crypto';
import { sendboxInfo } from '@/lib/sendbox';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const actor = await sendboxConnectionActor();
    const info = await sendboxInfo();
    if (!info.configured)
      return NextResponse.redirect(
        `${baseUrl()}${actor.inviteHash ? '/connect/instagram' : '/admin'}?result=settings_required`,
      );
    const state = randomBytes(32).toString('base64url');
    await db.oAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await db.oAuthAttempt.create({
      data: {
        stateHash: hash(`sendbox:${state}`),
        inviteHash: actor.inviteHash,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    (await cookies()).set('aidirect_sendbox', state, {
      httpOnly: true,
      secure: baseUrl().startsWith('https:'),
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    const login = new URL(info.instagram_oauth_url);
    login.searchParams.set('id', state);
    const response = NextResponse.redirect(login);
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.redirect(`${baseUrl()}/connect/instagram?result=connect_not_ready`);
  }
}
