import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { spawnSync } from 'node:child_process';
const project = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
if (project.projectName !== 'aidirect' || project.orgId !== 'team_0idkdyYpBCuzstjAtWC78n5U')
  throw new Error('Wrong Vercel target');
const config = parse(readFileSync('.env.sendbox.local'));
for (const name of ['SENDBOX_API_KEY', 'SENDBOX_WEBHOOK_SECRET']) {
  const value = config[name];
  if (!value || value.length < 20 || /\s/.test(value)) throw new Error('Fill ' + name + ' locally');
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
  if (result.status !== 0) throw new Error('Could not configure ' + name + '; values omitted');
  console.log('Configured ' + name + ' (secret)');
}
console.log(
  'Redeploy required. This only enables signed webhook capture and account connection; no messages are sent.',
);
