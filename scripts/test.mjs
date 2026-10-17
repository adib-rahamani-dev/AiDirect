import pg from 'pg';
import { spawnSync } from 'node:child_process';
const remote = process.env.TEST_DATABASE_URL;
const local = new URL(remote ?? process.env.DATABASE_URL);
if (remote) {
  if (!local.hostname.endsWith('.neon.tech') || local.pathname !== '/aidirect_test')
    throw new Error('Remote tests require a dedicated Neon aidirect_test database');
} else if (
  local.hostname !== '127.0.0.1' ||
  local.port !== '55432' ||
  local.pathname !== '/aidirect'
)
  throw new Error('Tests require the isolated local compose database');
local.pathname = '/' + (remote ? 'aidirect_test' : 'aidirect');
const client = new pg.Client({ connectionString: local.toString() });
await client.connect();
const found = await client.query("SELECT 1 FROM pg_database WHERE datname='aidirect_test'");
if (!found.rowCount) await client.query('CREATE DATABASE aidirect_test');
await client.end();
local.pathname = '/aidirect_test';
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: local.toString(),
  DATABASE_URL_UNPOOLED: local.toString(),
  META_ADAPTER: 'simulated',
  REAL_SEND_ENABLED: 'false',
  AUTOMATION_ENABLED: 'true',
};
for (const args of [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  ['--import', 'tsx', '--test', 'tests/*.test.ts'],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
