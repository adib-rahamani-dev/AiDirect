import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/lib/password.ts';
const filename = '.env';
if (!existsSync(filename)) throw new Error('Run setup:local first');
let env = readFileSync(filename, 'utf8');
if (/^OPERATOR_PASSWORD_HASH=.+$/m.test(env)) {
  console.log('Existing operator login preserved.');
  process.exit(0);
}
const email = process.argv[2] ?? 'admin@aidirect.local';
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
const password = randomBytes(18).toString('base64url');
const set = (name, value) => {
  const expression = new RegExp(`^${name}=.*$`, 'm');
  env = expression.test(env)
    ? env.replace(expression, `${name}=${value}`)
    : `${env.trimEnd()}\n${name}=${value}\n`;
};
set('OPERATOR_EMAIL', email);
set('OPERATOR_PASSWORD_HASH', await hashPassword(password));
if (!/^CRON_SECRET=.+$/m.test(env)) set('CRON_SECRET', randomBytes(32).toString('base64url'));
mkdirSync('.local', { recursive: true });
writeFileSync(
  '.local/operator-login.txt',
  `AiDirect operator login\nEmail: ${email}\nPassword: ${password}\n\nPrivate local file. Do not commit or share with the Instagram tester.\n`,
  { mode: 0o600 },
);
writeFileSync(filename, env, { mode: 0o600 });
console.log(
  'Email/password login configured. Open .local/operator-login.txt locally; no credentials printed.',
);
