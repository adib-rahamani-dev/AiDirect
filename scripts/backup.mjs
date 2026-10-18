import { spawn } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
// Full PostgreSQL custom-format dump, encrypted as it streams; never a plaintext file.
const root = resolve('backups');
const target = resolve(root, `aidirect-${new Date().toISOString().replaceAll(':', '-')}.dump.aes`);
let created = false;
try {
  if (!target.startsWith(root + sep) || dirname(target) !== root) throw new Error();
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error('backup_key_required');
  const connection = new URL(process.env.DATABASE_URL_UNPOOLED || '');
  if (
    connection.hostname.includes('-pooler') ||
    !['postgres:', 'postgresql:'].includes(connection.protocol)
  )
    throw new Error('direct_database_required');
  const executable = process.env.PG_DUMP_PATH || 'pg_dump';
  await mkdir(root, { recursive: true });
  const handle = await open(target, 'wx', 0o600);
  created = true;
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('aidirect-pg-backup-v1'));
  await handle.write(Buffer.concat([Buffer.from('AIDB1'), iv]));
  await handle.close();
  const child = spawn(executable, ['--format=custom', '--no-owner', '--no-acl'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PGHOST: connection.hostname,
      PGPORT: connection.port || '5432',
      PGUSER: decodeURIComponent(connection.username),
      PGPASSWORD: decodeURIComponent(connection.password),
      PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
      PGSSLMODE: 'verify-full',
    },
  });
  // pg_dump stderr can include connection info. Report only generic failure.
  child.stderr.resume();
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => (code === 0 ? resolve() : reject(new Error('dump_failed'))));
  });
  await Promise.all([
    pipeline(child.stdout, cipher, createWriteStream(target, { flags: 'a' })),
    completed,
  ]);
  const output = await open(target, 'a');
  await output.write(cipher.getAuthTag());
  await output.close();
  key.fill(0);
  console.log(
    JSON.stringify({
      status: 'encrypted_backup_created',
      file: target,
      format: 'AIDB1',
      restoreTested: false,
    }),
  );
} catch {
  if (created) await unlink(target).catch(() => {});
  console.error(
    'Encrypted database backup did not complete. Check the direct connection, private backup key and installed pg_dump version. No usable backup is claimed.',
  );
  process.exitCode = 1;
}
