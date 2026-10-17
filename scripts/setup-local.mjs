import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('Existing .env preserved.');
  process.exit(0);
}
let env = readFileSync('.env.example', 'utf8');
const password = randomBytes(24).toString('hex');
env = env.replaceAll('CHANGE_ME', password);
for (const key of [
  'TOKEN_ENCRYPTION_KEY',
  'PROOF_ADMIN_SECRET',
  'SESSION_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
]) {
  env = env.replace(`${key}=\n`, `${key}=${randomBytes(32).toString('base64url')}\n`);
}
writeFileSync('.env', env, { mode: 0o600 });
console.log('Local .env created. Secrets were not printed. Meta credentials remain empty.');
