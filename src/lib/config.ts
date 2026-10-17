export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}
export const provider = () => (process.env.META_ADAPTER === 'meta' ? 'meta' : 'simulated');
export const realSending = () => provider() === 'meta' && process.env.REAL_SEND_ENABLED === 'true';
export const automaticSending = () => process.env.AUTOMATION_ENABLED === 'true';
export function baseUrl() {
  const value =
    process.env.APP_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : undefined);
  if (!value) throw new Error('Missing configuration: APP_BASE_URL');
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid application URL');
  if (process.env.VERCEL && url.protocol !== 'https:') throw new Error('HTTPS required');
  return url.origin;
}
export const callbackUrl = () => `${baseUrl()}/api/meta/callback`;
export function apiVersion() {
  const v = required('META_API_VERSION');
  if (!/^v\d+\.0$/.test(v)) throw new Error('Invalid API version');
  return v;
}
export function scopes() {
  const requested = (
    process.env.META_OAUTH_SCOPES ?? 'instagram_business_basic,instagram_business_manage_comments'
  ).split(',');
  const allowed = [
    'instagram_business_basic',
    'instagram_business_manage_comments',
    'instagram_business_manage_messages',
  ];
  if (requested.some((x) => !allowed.includes(x)))
    throw new Error('Unsupported scope for this proof');
  return requested;
}
