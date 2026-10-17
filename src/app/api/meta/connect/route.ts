import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { connectionActor } from '@/lib/invitation';
import { authorizeUrl } from '@/lib/meta';
import { db } from '@/lib/db';
import { hash } from '@/lib/crypto';
import { baseUrl, provider } from '@/lib/config';
export const runtime = 'nodejs';
export async function GET() {
  let destination = '/proof';
  try {
    const actor = await connectionActor();
    if (actor.inviteHash) destination = '/connect';
    if (provider() !== 'meta')
      return NextResponse.redirect(`${baseUrl()}${destination}?result=select_meta_adapter`);
    const state = randomBytes(32).toString('base64url');
    await db.oAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await db.oAuthAttempt.create({
      data: {
        stateHash: hash(state),
        inviteHash: actor.inviteHash,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    (await cookies()).set('aidirect_oauth', state, {
      httpOnly: true,
      secure: baseUrl().startsWith('https://'),
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    return NextResponse.redirect(authorizeUrl(state));
  } catch {
    return NextResponse.redirect(`${baseUrl()}${destination}?result=connect_not_ready`);
  }
}
