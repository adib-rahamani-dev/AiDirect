import { z } from 'zod';
const numeric = z.string().regex(/^\d+$/);
const value = z
  .object({
    id: numeric.optional(),
    comment_id: numeric.optional(),
    text: z.string().max(10000).optional(),
    from: z.object({ id: numeric, username: z.string().optional() }).optional(),
    media: z.object({
      id: numeric,
      media_product_type: z.string().optional(),
      ad_id: z.string().optional(),
    }),
    parent_id: z.string().optional(),
  })
  .passthrough();
const change = z.object({ field: z.string(), value: z.unknown() });
const entry = z
  .object({
    id: numeric,
    time: z.number().optional(),
    changes: z.array(change).max(1000).optional(),
    field: z.string().optional(),
    value: z.unknown().optional(),
  })
  .passthrough();
const envelope = z.object({ object: z.string(), entry: z.array(entry).max(1000) }).passthrough();
export type IncomingComment = {
  accountId: string;
  commentId: string;
  mediaId: string;
  text: string;
  authorId?: string;
  authorUsername?: string;
  parentId?: string;
  productType?: string;
};
export function parseComments(payload: unknown): IncomingComment[] {
  const output: IncomingComment[] = [];
  for (const item of Array.isArray(payload) ? payload : [payload]) {
    const parsed = envelope.safeParse(item);
    if (!parsed.success) throw new Error('invalid_webhook');
    if (parsed.data.object !== 'instagram') continue;
    for (const e of parsed.data.entry) {
      const changes = e.changes ?? (e.field ? [{ field: e.field, value: e.value }] : []);
      for (const c of changes) {
        if (c.field !== 'comments') continue;
        const v = value.safeParse(c.value);
        if (!v.success) continue;
        const commentId = v.data.id ?? v.data.comment_id;
        if (!commentId || !v.data.text || v.data.media.ad_id) continue;
        output.push({
          accountId: e.id,
          commentId,
          mediaId: v.data.media.id,
          text: v.data.text,
          authorId: v.data.from?.id,
          authorUsername: v.data.from?.username,
          parentId: v.data.parent_id,
          productType: v.data.media.media_product_type,
        });
        if (output.length > 1000) throw new Error('webhook_batch_too_large');
      }
    }
  }
  return output;
}
