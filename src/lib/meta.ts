import { apiVersion, callbackUrl, required, scopes } from './config';
export type Media = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
};
export type Comment = {
  id: string;
  text: string;
  timestamp: string;
  media: { id: string; media_product_type?: string };
  from?: { id: string; username?: string };
  username?: string;
  parent_id?: string;
  hidden?: boolean;
};
export type ErrorKind =
  'token' | 'permission' | 'rate_limit' | 'temporary' | 'permanent' | 'unknown';
export class MetaError extends Error {
  constructor(
    public kind: ErrorKind,
    public code?: number,
    public subcode?: number,
    public traceId?: string,
    public retryAfter = 60,
  ) {
    super(`Meta operation failed: ${kind}`);
  }
}
export function classify(http: number, body: unknown, write = false): MetaError {
  const e = (
    body as {
      error?: {
        code?: number;
        error_subcode?: number;
        is_transient?: boolean;
        fbtrace_id?: string;
      };
    }
  )?.error;
  const kind: ErrorKind =
    e?.code === 190
      ? 'token'
      : e?.code === 10 || e?.code === 200
        ? 'permission'
        : e && (http === 429 || [4, 17, 32, 613].includes(e.code ?? 0))
          ? 'rate_limit'
          : http >= 500
            ? write
              ? 'unknown'
              : 'temporary'
            : e?.is_transient
              ? write && http >= 400 && http < 500
                ? 'temporary'
                : write
                  ? 'unknown'
                  : 'temporary'
              : !e
                ? write
                  ? 'unknown'
                  : 'temporary'
                : 'permanent';
  // Never keep Meta error.message: it can contain request parameters or personal data.
  return new MetaError(kind, e?.code, e?.error_subcode, e?.fbtrace_id);
}
type Json = Record<string, unknown>;
async function request(url: URL | string, init: RequestInit = {}, write = false): Promise<Json> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MetaError(write ? 'unknown' : 'temporary');
  }
  let body: Json;
  try {
    body = await res.json();
  } catch {
    throw new MetaError(write ? 'unknown' : 'temporary');
  }
  if (!res.ok || body.error || body.error_type) {
    const error = classify(res.status, body, write);
    const seconds = Number(res.headers.get('retry-after'));
    if (Number.isFinite(seconds) && seconds > 0) error.retryAfter = Math.min(seconds, 3600);
    throw error;
  }
  return body;
}
function graph(path: string, params: Record<string, string> = {}) {
  if (!/^(?:me|\d+)(?:\/(?:media|comments|subscribed_apps|messages))?$/.test(path))
    throw new Error('Invalid Graph path');
  const url = new URL(`https://graph.instagram.com/${apiVersion()}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}
export function authorizeUrl(state: string) {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: required('INSTAGRAM_APP_ID'),
    redirect_uri: callbackUrl(),
    response_type: 'code',
    scope: scopes().join(','),
    state,
    enable_fb_login: 'false',
    force_reauth: 'true',
  }).toString();
  return url.toString();
}
export async function exchangeCode(code: string) {
  const body = new FormData();
  for (const [k, v] of Object.entries({
    client_id: required('INSTAGRAM_APP_ID'),
    client_secret: required('INSTAGRAM_APP_SECRET'),
    grant_type: 'authorization_code',
    redirect_uri: callbackUrl(),
    code,
  }))
    body.set(k, v);
  const result = await request('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body,
  });
  const token = (Array.isArray(result.data) ? result.data[0] : result) as {
    access_token?: string;
    user_id?: string;
    permissions?: string | string[];
  };
  if (!token.access_token || !token.user_id) throw new MetaError('permanent');
  if (token.permissions) {
    const granted = Array.isArray(token.permissions)
      ? token.permissions
      : token.permissions.split(',');
    if (scopes().some((x) => !granted.includes(x))) throw new MetaError('permission');
  }
  const url = new URL('https://graph.instagram.com/access_token');
  url.search = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: required('INSTAGRAM_APP_SECRET'),
    access_token: token.access_token,
  }).toString();
  const long = await request(url);
  if (typeof long.access_token !== 'string' || typeof long.expires_in !== 'number')
    throw new MetaError('permanent');
  return {
    accessToken: long.access_token,
    appScopedId: String(token.user_id),
    expiresIn: long.expires_in,
  };
}
export async function refreshToken(token: string) {
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.search = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: token,
  }).toString();
  const result = await request(url);
  if (typeof result.access_token !== 'string' || typeof result.expires_in !== 'number')
    throw new MetaError('permanent');
  return { accessToken: result.access_token, expiresIn: result.expires_in };
}
export async function profile(token: string) {
  const result = await request(graph('me', { fields: 'id,user_id,username' }), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const user = (Array.isArray(result.data) ? result.data[0] : result) as {
    id?: string;
    user_id?: string;
    username?: string;
  };
  if (!user.user_id || !/^\d+$/.test(user.user_id) || !user.username)
    throw new MetaError('permanent');
  return { accountId: user.user_id, appScopedId: user.id, username: user.username };
}
export async function subscribe(accountId: string, token: string) {
  const result = await request(graph(`${accountId}/subscribed_apps`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ subscribed_fields: 'comments' }),
  });
  if (result.success !== true) throw new MetaError('permanent');
}
export async function subscribeInstagramInbox(accountId: string, token: string) {
  const result = await request(graph(`${accountId}/subscribed_apps`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ subscribed_fields: 'comments,messages' }),
  });
  if (result.success !== true) throw new MetaError('permanent');
}
export async function sendInstagramMessage(
  accountId: string,
  recipientId: string,
  text: string,
  token: string,
) {
  if (
    !/^\d{1,40}$/.test(accountId) ||
    !/^\d{1,40}$/.test(recipientId) ||
    !text ||
    text.length > 1000
  )
    throw new MetaError('permanent');
  const result = await request(
    graph(`${accountId}/messages`),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    },
    true,
  );
  if (typeof result.message_id !== 'string') throw new MetaError('unknown');
  return { messageId: result.message_id };
}
export interface InstagramAdapter {
  kind: 'meta' | 'simulated';
  media(accountId: string, token: string): Promise<Media[]>;
  comments(mediaId: string, token: string): Promise<Comment[]>;
  comment(commentId: string, token: string): Promise<Comment>;
  send(
    accountId: string,
    commentId: string,
    text: string,
    token: string,
  ): Promise<{ messageId: string }>;
}
export const metaAdapter: InstagramAdapter = {
  kind: 'meta',
  async media(id, token) {
    const result = await request(
      graph(`${id}/media`, {
        fields: 'id,caption,media_type,media_product_type,permalink',
        limit: '100',
      }),
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!Array.isArray(result.data)) throw new MetaError('permanent');
    return result.data as Media[];
  },
  async comments(id, token) {
    const result = await request(
      graph(`${id}/comments`, {
        fields: 'id,text,timestamp,media,from,parent_id,hidden',
        limit: '100',
      }),
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!Array.isArray(result.data)) throw new MetaError('permanent');
    return result.data as Comment[];
  },
  async comment(id, token) {
    return (await request(
      graph(id, { fields: 'id,text,timestamp,media,from,username,parent_id,hidden' }),
      { headers: { Authorization: `Bearer ${token}` } },
    )) as unknown as Comment;
  },
  async send(id, commentId, text, token) {
    const result = await request(
      graph(`${id}/messages`),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
      },
      true,
    );
    if (typeof result.message_id !== 'string') throw new MetaError('unknown');
    return { messageId: result.message_id };
  },
};
