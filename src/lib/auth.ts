import { cookies } from 'next/headers';
import { createHmac, randomBytes } from 'node:crypto';
import { baseUrl, required } from './config';
import { equal } from './crypto';
export const COOKIE = 'aidirect_proof';
function sign(payload: string) {
  return createHmac('sha256', required('SESSION_SECRET'))
    .update(
      `${payload}|${process.env.OPERATOR_PASSWORD_HASH ?? process.env.PROOF_ADMIN_SECRET ?? ''}`,
    )
    .digest('hex');
}
export function newSession() {
  const payload = `${Date.now() + 8 * 3600_000}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}
export function validSession(value: string) {
  if (!/^\d{13}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(value)) return false;
  const [expires, nonce, signature] = value.split('.');
  if (Number(expires) <= Date.now() || Number(expires) > Date.now() + 8 * 3600_000) return false;
  return equal(signature, sign(`${expires}.${nonce}`));
}
export async function requireOperator() {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value || !validSession(value)) throw new Error('unauthorized');
}
export function requireOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(baseUrl()).origin) throw new Error('forbidden');
}
