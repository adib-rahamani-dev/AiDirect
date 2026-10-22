import { startInstagramOAuth } from '@/lib/instagram-connection';
import { NextResponse } from 'next/server';
import { baseUrl } from '@/lib/config';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return await startInstagramOAuth(request.headers);
  } catch {
    return NextResponse.redirect(baseUrl() + '/dashboard/instagram?result=connect_not_ready');
  }
}
