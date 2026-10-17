import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { parseSendboxEvent, validSendboxSignature } from '@/lib/sendbox';
import { expireSendboxEvidence } from '@/lib/sendbox-store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const secret = process.env.SENDBOX_WEBHOOK_SECRET;
  if (!secret) return new Response('Not configured', { status: 503 });
  const reader = request.body?.getReader();
  if (!reader) return new Response('Invalid body', { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1_048_576) {
        await reader.cancel();
        return new Response('Too large', { status: 413 });
      }
      chunks.push(part.value);
    }
  } catch {
    return new Response('Invalid body', { status: 400 });
  }
  const raw = Buffer.concat(chunks);
  if (!validSendboxSignature(raw, request.headers, secret))
    return new Response('Unauthorized', { status: 401 });
  let event;
  try {
    event = parseSendboxEvent(
      JSON.parse(raw.toString('utf8')),
      request.headers.get('x-boxapi-event-id'),
    );
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }
  try {
    // Expire encrypted content but retain a small tombstone to suppress late replay.
    const now = new Date();
    await expireSendboxEvidence();
    const connection = await db.sendboxConnection.findUnique({ where: { id: 'proof' } });
    if (!connection || connection.accountId !== event.account_id || connection.expiresAt <= now)
      return new Response('IGNORED', { status: 200 });
    if (
      ![
        'comments',
        'action.private_reply',
        'action.list_posts',
        'action.comment_comments',
      ].includes(event.event_type)
    )
      return new Response('IGNORED', { status: 200 });
    await db.sendboxWebhookEvent.createMany({
      data: [
        {
          eventId: event.event_id,
          accountId: connection.accountId,
          eventType: event.event_type,
          payloadCipher: encrypt(
            JSON.stringify(event.data),
            `sendbox:${event.event_id}:${connection.accountId}`,
          ),
          expiresAt: new Date(Date.now() + 86400_000),
        },
      ],
      skipDuplicates: true,
    });
    // This stage only records signed evidence. It never dispatches a message.
    return new Response('EVENT_STORED', { status: 200 });
  } catch {
    return new Response('Storage unavailable', { status: 503 });
  }
}
