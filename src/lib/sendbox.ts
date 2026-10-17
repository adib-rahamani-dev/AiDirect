import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { baseUrl, required } from './config';
import { equal } from './crypto';

export class SendboxError extends Error {
  constructor(
    public kind:
      'configuration' | 'authentication' | 'rate_limit' | 'unavailable' | 'invalid_response',
  ) {
    super(`sendbox_${kind}`);
  }
}
const account = z.object({
  id: z.uuid(),
  instagram_user_id: z.string().regex(/^\d+$/),
  username: z.string().min(1).max(100),
  is_active: z.boolean(),
  expires_at: z.string().refine((v) => Number.isFinite(Date.parse(v))),
});
export type SendboxAccount = z.infer<typeof account>;
// Fixed provider origin: credentials must never follow a redirect or a user-supplied host.
async function get(path: 'info' | 'accounts') {
  let response: Response;
  try {
    response = await fetch(`https://api.sendbox.chat/api/v1/service/${path}`, {
      headers: { 'X-Api-Key': required('SENDBOX_API_KEY'), Accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new SendboxError('unavailable');
  }
  if ([401, 403].includes(response.status)) throw new SendboxError('authentication');
  if (response.status === 429) throw new SendboxError('rate_limit');
  if (!response.ok) throw new SendboxError('unavailable');
  try {
    const body = await response.json();
    if (body.success !== true) throw new Error();
    return body.data as unknown;
  } catch {
    throw new SendboxError('invalid_response');
  }
}
export async function sendboxAccounts(): Promise<SendboxAccount[]> {
  const parsed = z
    .array(account)
    .max(1000)
    .safeParse(await get('accounts'));
  if (!parsed.success) throw new SendboxError('invalid_response');
  return parsed.data;
}
export async function sendboxInfo() {
  const parsed = z
    .object({
      domain: z.string(),
      login_redirect_url: z.string(),
      instagram_oauth_url: z.url(),
      plan: z.object({ account_limit: z.number() }).passthrough(),
    })
    .safeParse(await get('info'));
  if (!parsed.success) throw new SendboxError('invalid_response');
  const data = parsed.data;
  const login = new URL(data.instagram_oauth_url);
  if (
    login.origin !== 'https://api.sendbox.chat' ||
    login.pathname !== '/instagram-oauth' ||
    !login.searchParams.get('token') ||
    login.username ||
    login.password ||
    login.hash
  )
    throw new SendboxError('configuration');
  return {
    ...data,
    configured:
      data.domain.replace(/\/$/, '') === baseUrl() &&
      data.login_redirect_url === `${baseUrl()}/api/sendbox/callback`,
  };
}
export function validSendboxSignature(
  raw: Buffer,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const timestamp = headers.get('x-boxapi-timestamp') ?? '';
  const signature = headers.get('x-boxapi-signature') ?? '';
  if (
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !/^sha256=[a-f0-9]{64}$/.test(signature)
  )
    return false;
  const expected =
    'sha256=' +
    createHmac('sha256', secret)
      .update(timestamp + '.')
      .update(raw)
      .digest('hex');
  return equal(signature, expected);
}
const envelope = z.object({
  event_id: z.string().min(1).max(200),
  event_type: z
    .string()
    .regex(/^[a-z_.]+$/)
    .max(80),
  account_id: z.uuid().nullable(),
  data: z.unknown().refine((value) => value !== undefined),
});
export function parseSendboxEvent(body: unknown, headerId: string | null) {
  const event = envelope.parse(body);
  if (headerId && headerId !== event.event_id) throw new Error('event_id_mismatch');
  return event;
}
