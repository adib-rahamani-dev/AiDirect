import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'dotenv';
import { spawnSync } from 'node:child_process';
const file = '.env.meta.local';
if (!existsSync(file)) throw new Error('Create .env.meta.local using the deployment guide');
const config = parse(readFileSync(file));
if (
  !/^\d+$/.test(config.INSTAGRAM_APP_ID ?? '') ||
  !config.INSTAGRAM_APP_SECRET ||
  config.INSTAGRAM_APP_SECRET.length < 16
)
  throw new Error('Fill Instagram App ID and new App Secret locally; no values printed');
if (config.APP_SECRET_ROTATED !== 'true')
  throw new Error('Reset the previously exposed secret, then set APP_SECRET_ROTATED=true locally');
const project = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
if (project.projectName !== 'aidirect') throw new Error('Wrong Vercel target');
const values = {
  INSTAGRAM_APP_ID: config.INSTAGRAM_APP_ID,
  INSTAGRAM_APP_SECRET: config.INSTAGRAM_APP_SECRET,
  META_WEBHOOK_APP_SECRET: config.META_WEBHOOK_APP_SECRET ?? config.INSTAGRAM_APP_SECRET,
  META_ADAPTER: 'meta',
  REAL_SEND_ENABLED: 'false',
  AUTOMATION_ENABLED: 'false',
};
for (const [name, value] of Object.entries(values)) {
  const result = spawnSync(
    process.execPath,
    [
      process.env.APPDATA + '/npm/node_modules/vercel/dist/index.js',
      'env',
      'add',
      name,
      'production',
      '--force',
      '--sensitive',
    ],
    { input: value, encoding: 'utf8', timeout: 45000 },
  );
  if (result.status !== 0) throw new Error('Could not configure ' + name);
  console.log('Configured ' + name);
}
console.log(
  'Meta configuration saved. Redeploy, verify OAuth, then authorize the first manual send. No send switches were enabled.',
);
