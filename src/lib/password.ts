import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    nodeScrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 256) throw new Error('password_length');
  return encodePassword(password);
}
// Explicit owner configuration is separate from the public registration policy.
export async function hashConfiguredOwnerPassword(password: string) {
  if (password.length < 8 || password.length > 256) throw new Error('password_length');
  return encodePassword(password);
}
async function encodePassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt-v1.${salt.toString('hex')}.${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  if (password.length > 256 || !/^scrypt-v1\.[a-f0-9]{32}\.[a-f0-9]{128}$/.test(encoded))
    return false;
  const [, salt, key] = encoded.split('.');
  return timingSafeEqual(await derive(password, Buffer.from(salt, 'hex')), Buffer.from(key, 'hex'));
}
