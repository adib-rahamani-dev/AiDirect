import { after } from 'next/server';
import { z } from 'zod';
import { requireOrigin } from '@/lib/auth';
import { readJson, InputError } from '@/lib/http';
import { db } from '@/lib/db';
import {
  instagramActor,
  instagramToken,
  disconnectInstagram,
  InstagramError,
} from '@/lib/instagram-connection';
import {
  instagramMedia,
  instagramSnapshot,
  instagramThreadMessages,
  customerSending,
} from '@/lib/instagram-view';
import { subscribeInstagramInbox, MetaError } from '@/lib/meta';
import { consumeAuthLimit } from '@/lib/customer-auth';
import { randomUUID } from 'node:crypto';
import { enqueueManualReply } from '@/lib/instagram-jobs';
import { drainInstagramWebhook } from '@/lib/instagram-webhook';
export const runtime = 'nodejs';
export const maxDuration = 60;
const id = z.string().min(1).max(100);
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('subscribe') }).strict(),
  z.object({ action: z.literal('disconnect') }).strict(),
  z.object({ action: z.literal('process') }).strict(),
  z
    .object({
      action: z.literal('settings'),
      autoDm: z.boolean(),
      tone: z.enum(['friendly', 'formal']),
      shippingPolicy: z.string().trim().max(600),
      shorthandMillions: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('reply'),
      threadId: id,
      text: z.string().trim().min(1).max(900),
      requestId: z.uuid(),
    })
    .strict(),
  z.object({ action: z.literal('handoff'), threadId: id, paused: z.boolean() }).strict(),
  z
    .object({
      action: z.literal('automation'),
      id: id.optional(),
      mediaId: z.string().regex(/^\d+$/),
      keyword: z.string().trim().min(1).max(80),
      replyText: z.string().trim().min(1).max(700),
      link: z
        .string()
        .max(250)
        .refine((v) => {
          if (!v) return true;
          try {
            const u = new URL(v);
            return u.protocol === 'https:' && !u.username && !u.password;
          } catch {
            return false;
          }
        }),
      enabled: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal('delete_automation'), id }).strict(),
]);
export async function GET(request: Request) {
  try {
    const { workspace } = await instagramActor(request.headers);
    const query = new URL(request.url).searchParams;
    return Response.json(
      query.get('view') === 'media'
        ? { source: 'meta', media: await instagramMedia(workspace.id), limit: 100 }
        : query.get('thread')
          ? await instagramThreadMessages(workspace.id, id.parse(query.get('thread')))
          : await instagramSnapshot(workspace.id),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const { workspace } = await instagramActor(request.headers);
    const data = input.parse(await readJson(request, 8000));
    if (!(await consumeAuthLimit('instagram-write:' + workspace.id, 60, 30)).allowed)
      throw new InstagramError(429, 'wait');
    if (data.action === 'disconnect') {
      await disconnectInstagram(workspace.id);
      return Response.json({ ok: true, remoteRevocation: 'instagram_apps_and_websites_required' });
    }
    if (data.action === 'process') {
      after(async () => {
        try {
          await drainInstagramWebhook(workspace.id);
        } catch {}
      });
      return Response.json({ queued: true });
    }
    if (data.action === 'handoff') {
      const updated = await db.instagramThread.updateMany({
        where: { id: data.threadId, workspaceId: workspace.id },
        data: { handedOff: data.paused, contextCipher: null, contextAt: null },
      });
      if (!updated.count) throw new InstagramError(404, 'not_found');
      return Response.json({ ok: true });
    }
    if (data.action === 'delete_automation') {
      await db.instagramAutomation.deleteMany({
        where: { id: data.id, workspaceId: workspace.id },
      });
      return Response.json({ ok: true });
    }
    const { connection: c, token } = await instagramToken(workspace.id);
    if (data.action === 'subscribe') {
      await subscribeInstagramInbox(c.accountId, token);
      await db.instagramConnection.updateMany({
        where: { id: c.id, status: 'connected' },
        data: { subscribed: true, errorKind: null },
      });
      return Response.json({ ok: true });
    }
    if (data.action === 'settings') {
      if (data.autoDm && (!customerSending() || !c.subscribed))
        throw new InstagramError(409, 'subscribe_or_enable_sending');
      await db.instagramConnection.updateMany({
        where: { id: c.id, workspaceId: workspace.id, status: 'connected' },
        data: {
          autoDm: data.autoDm,
          tone: data.tone,
          shippingPolicy: data.shippingPolicy,
          shorthandMillions: data.shorthandMillions,
          settingsRevision: randomUUID(),
        },
      });
      await db.instagramThread.updateMany({
        where: { workspaceId: workspace.id },
        data: { contextCipher: null, contextAt: null },
      });
      if (!data.autoDm)
        await db.instagramJob.updateMany({
          where: { workspaceId: workspace.id, kind: 'dm_auto', status: 'pending' },
          data: { status: 'skipped', payloadCipher: null, errorKind: 'settings_changed' },
        });
      return Response.json({ ok: true });
    }
    if (data.action === 'reply') {
      const result = await enqueueManualReply(
        workspace.id,
        data.threadId,
        data.text,
        data.requestId,
      );
      after(async () => {
        try {
          await drainInstagramWebhook(workspace.id);
        } catch {}
      });
      return Response.json({ queued: result.count > 0, deduplicated: result.count === 0 });
    }
    if (data.action === 'automation') {
      if (data.enabled && (!customerSending() || !c.subscribed))
        throw new InstagramError(409, 'subscribe_or_enable_sending');
      const media = await instagramMedia(workspace.id);
      if (
        !media.some(
          (m) => m.id === data.mediaId && ['FEED', 'REELS'].includes(m.media_product_type ?? ''),
        )
      )
        throw new InstagramError(409, 'media_not_owned');
      const values = {
        mediaId: data.mediaId,
        keyword: data.keyword,
        replyText: data.replyText,
        link: data.link,
        enabled: data.enabled,
        revision: randomUUID(),
      };
      if (data.id) {
        const updated = await db.instagramAutomation.updateMany({
          where: { id: data.id, workspaceId: workspace.id, connectionId: c.id },
          data: values,
        });
        if (!updated.count) throw new InstagramError(404, 'not_found');
      } else
        await db.instagramAutomation.create({
          data: { workspaceId: workspace.id, connectionId: c.id, ...values },
        });
      return Response.json({ ok: true });
    }
    throw new InstagramError(400, 'invalid_action');
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  const status =
    e instanceof InstagramError
      ? e.status
      : e instanceof InputError
        ? e.status
        : e instanceof z.ZodError
          ? 400
          : e instanceof Error && e.message === 'unauthorized'
            ? 401
            : e instanceof Error && e.message === 'forbidden'
              ? 403
              : e instanceof MetaError && e.kind === 'rate_limit'
                ? 429
                : typeof e === 'object' && e && 'code' in e && e.code === 'P2002'
                  ? 409
                  : 503;
  return Response.json(
    {
      error:
        e instanceof InstagramError
          ? e.code
          : e instanceof MetaError
            ? 'meta_' + e.kind
            : 'request_failed',
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
