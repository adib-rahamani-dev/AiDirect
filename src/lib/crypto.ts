import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { required } from './config';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function key() {
  const k = Buffer.from(required('TOKEN_ENCRYPTION_KEY'), 'base64url');
  if (k.length !== 32) throw new Error('Encryption key must be 32 bytes');
  return k;
}
export function encrypt(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}
export function decrypt(value: string, context: string) {
  const [v, iv, tag, data] = value.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Invalid ciphertext');
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString(
    'utf8',
  );
}
export function validSignature(raw: Buffer, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return equal(signature, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
}
