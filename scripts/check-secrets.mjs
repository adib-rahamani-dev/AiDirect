import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from 'dotenv';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const secrets = [];
for (const file of readdirSync('.').filter(
  (name) => name === '.env' || (name.startsWith('.env.') && name !== '.env.example'),
)) {
  for (const [key, value] of Object.entries(parse(readFileSync(file))))
    if (
      /SECRET|PASSWORD|TOKEN|ENCRYPTION_KEY|DATABASE_URL|API_KEY|OAUTH_URL/.test(key) &&
      value.length >= 16
    )
      secrets.push(value);
}
if (existsSync('.local/operator-login.txt')) {
  const match = readFileSync('.local/operator-login.txt', 'utf8').match(/^Password: (.+)$/m);
  if (match) secrets.push(match[1]);
}
const denied = files.filter(
  (file) =>
    /^(?:\.env(?:\..+)?|\.local\/|\.vercel\/|backups\/|local-evidence\/)/.test(file) &&
    file !== '.env.example',
);
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (
    secrets.some((secret) => text.includes(secret)) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /gh[pousr]_[A-Za-z0-9]{30,}/.test(text)
  )
    denied.push(file);
}
if (denied.length) {
  console.error('Secret check failed in files: ' + [...new Set(denied)].join(', '));
  process.exit(1);
}
console.log(
  'Tracked source checked: no local secret values or private environment files detected.',
);
