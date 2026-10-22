import { required } from '@/lib/config';
import { equal, validSignature } from '@/lib/crypto';
import { parseComments } from '@/lib/webhook';
import { ingest } from '@/lib/pipeline';
import { after } from 'next/server';
import { storeInstagramWebhook, drainInstagramWebhook } from '@/lib/instagram-webhook';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (
    p.get('hub.mode') !== 'subscribe' ||
    !equal(p.get('hub.verify_token') ?? '', required('META_WEBHOOK_VERIFY_TOKEN')) ||
    !p.get('hub.challenge')
  )
    return new Response('Forbidden', { status: 403 });
  return new Response(p.get('hub.challenge'), { headers: { 'Content-Type': 'text/plain' } });
}
export async function POST(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return new Response('Invalid body', { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1_048_576) {
      await reader.cancel();
      return new Response('Too large', { status: 413 });
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks);
  const secret = process.env.META_WEBHOOK_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  if (!secret) return new Response('Not configured', { status: 503 });
  if (!validSignature(raw, request.headers.get('x-hub-signature-256'), secret))
    return new Response('Forbidden', { status: 403 });
  let comments;
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString('utf8'));
    comments = parseComments(payload);
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }
  try {
    await ingest(comments, 'webhook');
    const stored = await storeInstagramWebhook(payload);
    if (stored)
      after(async () => {
        try {
          await drainInstagramWebhook();
        } catch {
          /* durable queue; next worker run recovers */
        }
      });
  } catch {
    return new Response('Storage unavailable', { status: 503 });
  }
  // All accepted work is committed in PostgreSQL before acknowledgment. Worker sends later.
  return new Response('EVENT_RECEIVED', { status: 200 });
}
