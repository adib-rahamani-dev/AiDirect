import { spawn } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import pg from 'pg';
// Deliberately refuses the app DB. This is a restore drill, not production recovery.
try {
  if (!process.argv.includes('--confirm-isolated-restore'))
    throw new Error('restore_consent_required');
  const argument = process.argv.find((v) => v.endsWith('.dump.aes'));
  if (!argument) throw new Error();
  const target = resolve(argument),
    root = resolve('backups');
  if (!target.startsWith(root + sep) || (await stat(target)).size > 100 * 1024 * 1024)
    throw new Error('restore_target_rejected');
  const url = new URL(process.env.RESTORE_TEST_DATABASE_URL || '');
  if (
    url.pathname !== '/aidirect_restore_test' ||
    url.hostname.includes('-pooler') ||
    !(url.hostname === '127.0.0.1' || url.hostname.endsWith('.neon.tech'))
  )
    throw new Error('restore_target_rejected');
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error();
  const archive = await readFile(target);
  if (archive.length < 34 || archive.subarray(0, 5).toString() !== 'AIDB1') throw new Error();
  const decipher = createDecipheriv('aes-256-gcm', key, archive.subarray(5, 17));
  decipher.setAAD(Buffer.from('aidirect-pg-backup-v1'));
  decipher.setAuthTag(archive.subarray(-16));
  // Verify authentication BEFORE allowing a single byte into pg_restore.
  const dump = Buffer.concat([decipher.update(archive.subarray(17, -16)), decipher.final()]);
  key.fill(0);
  if (dump.subarray(0, 5).toString() !== 'PGDMP') throw new Error();
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: 'aidirect_restore_test',
    PGSSLMODE: url.hostname === '127.0.0.1' ? 'disable' : 'verify-full',
  };
  const child = spawn(
    process.env.PG_RESTORE_PATH || 'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      '--dbname=aidirect_restore_test',
    ],
    { env, stdio: ['pipe', 'ignore', 'pipe'] },
  );
  child.stderr.resume();
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdin.once('error', reject);
    child.once('close', (code) => (code === 0 ? resolve() : reject(new Error())));
    child.stdin.end(dump);
  });
  dump.fill(0);
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM "OperatorSession"');
    await client.query('DELETE FROM "Session"');
    await client.query('DELETE FROM "Verification"');
    await client.query('DELETE FROM "OAuthAttempt"');
    await client.query('DELETE FROM "ConnectionInvite"');
    await client.query('DELETE FROM "SendboxInvite"');
    await client.query('UPDATE "ProofRule" SET enabled=false');
    await client.query(
      'INSERT INTO "OperationControl" (id,paused,"updatedAt") VALUES (\'proof\',true,NOW()) ON CONFLICT (id) DO UPDATE SET paused=true,"updatedAt"=NOW()',
    );
    const result = await client.query('SELECT COUNT(*)::int AS products FROM "CatalogProduct"');
    await client.query('COMMIT');
    console.log(
      JSON.stringify({
        status: 'isolated_restore_completed',
        products: result.rows[0].products,
        sessionsRevoked: true,
        proofWorkerPaused: true,
        externalSendingTested: false,
      }),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
} catch (error) {
  if (
    error instanceof Error &&
    ['restore_consent_required', 'restore_target_rejected'].includes(error.message)
  )
    console.error(error.message);
  console.error(
    'Isolated restore did not complete. Only aidirect_restore_test is permitted. No production recovery is claimed.',
  );
  process.exitCode = 1;
}
