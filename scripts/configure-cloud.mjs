import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { spawnSync } from 'node:child_process';
const project = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
if (project.projectName !== 'aidirect' || project.orgId !== 'team_0idkdyYpBCuzstjAtWC78n5U')
  throw new Error('Refusing to configure a different Vercel project');
const local = parse(readFileSync('.env'));
const database = parse(readFileSync('.env.cloud.local'));
const required = [
  'TOKEN_ENCRYPTION_KEY',
  'SESSION_SECRET',
  'OPERATOR_EMAIL',
  'OPERATOR_PASSWORD_HASH',
  'CRON_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
];
for (const name of required) if (!local[name]) throw new Error('Missing ' + name);
const config = Object.fromEntries(required.map((name) => [name, local[name]]));
Object.assign(config, {
  META_ADAPTER: 'simulated',
  REAL_SEND_ENABLED: 'false',
  AUTOMATION_ENABLED: 'true',
  META_API_VERSION: 'v26.0',
  META_OAUTH_SCOPES: 'instagram_business_basic,instagram_business_manage_comments',
});
// New dedicated test deployment only; no production customer data exists here.
for (const name of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
  const url = new URL(database[name]);
  if (!url.hostname.endsWith('.neon.tech') || url.pathname !== '/neondb')
    throw new Error('Expected dedicated Neon database');
  url.searchParams.set('sslmode', 'verify-full');
  config[name] = url.toString();
}
const executable = process.env.APPDATA + '/npm/node_modules/vercel/dist/index.js';
for (const [name, value] of Object.entries(config)) {
  const result = spawnSync(
    process.execPath,
    [executable, 'env', 'add', name, 'production', '--force', '--sensitive'],
    { input: value, encoding: 'utf8', timeout: 45000 },
  );
  if (result.status !== 0) {
    console.error('Could not configure ' + name + '; no value printed.');
    process.exit(1);
  }
  console.log('Configured ' + name);
}
const standalone = { ...config };
writeFileSync(
  '.env.deployment.local',
  Object.entries(standalone)
    .map(([name, value]) => name + '=' + JSON.stringify(value))
    .join('\n') + '\n',
  { mode: 0o600 },
);
console.log(
  'Test deployment configuration saved securely. Meta remains unconfigured and real sending disabled.',
);
