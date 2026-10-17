import pg from 'pg';
import { writeFileSync } from 'node:fs';
const target = new URL(process.env.DATABASE_URL_UNPOOLED ?? '');
if (
  !target.hostname.endsWith('.neon.tech') ||
  target.pathname !== '/neondb' ||
  target.hostname.includes('-pooler')
)
  throw new Error('Expected direct connection to the dedicated AiDirect Neon resource');
target.searchParams.set('sslmode', 'verify-full');
const client = new pg.Client({
  connectionString: target.toString(),
  connectionTimeoutMillis: 20000,
});
try {
  await client.connect();
  const found = await client.query("SELECT 1 FROM pg_database WHERE datname='aidirect_test'");
  if (!found.rowCount) await client.query('CREATE DATABASE aidirect_test');
  target.pathname = '/aidirect_test';
  writeFileSync(
    '.env.test.local',
    'TEST_DATABASE_URL=' + JSON.stringify(target.toString()) + '\n',
    { mode: 0o600 },
  );
  console.log('Dedicated aidirect_test database prepared. Connection details not printed.');
} catch (error) {
  console.error(
    'Could not prepare isolated test database. PostgreSQL code: ' + (error.code ?? 'unavailable'),
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
