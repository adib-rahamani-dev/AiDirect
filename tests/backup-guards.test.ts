import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
test('Restore CLI rejects production database names and missing explicit drill consent', () => {
  mkdirSync('backups', { recursive: true });
  const fixture = `backups/fixture-restore-refusal-${process.pid}.dump.aes`;
  writeFileSync(fixture, Buffer.alloc(34));
  try {
    for (const args of [[], [fixture, '--confirm-isolated-restore']]) {
      const result = spawnSync(process.execPath, ['scripts/restore-backup-test.mjs', ...args], {
        env: {
          ...process.env,
          RESTORE_TEST_DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/neondb',
        },
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(result.status, 1);
      assert(!result.stderr.includes('fixture:fixture'));
      assert(result.stderr.includes('Only aidirect_restore_test is permitted'));
      assert(
        result.stderr.includes(
          args.length ? 'restore_target_rejected' : 'restore_consent_required',
        ),
      );
    }
  } finally {
    unlinkSync(fixture);
  }
});
test('Backup CLI refuses an absent encryption key without exposing connection credentials', () => {
  const result = spawnSync(process.execPath, ['scripts/backup.mjs'], {
    env: {
      ...process.env,
      BACKUP_ENCRYPTION_KEY: '',
      DATABASE_URL_UNPOOLED: 'postgresql://fixture:fixture@127.0.0.1:1/neondb',
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert(!result.stderr.includes('fixture:fixture'));
  assert(!result.stdout.includes('encrypted_backup_created'));
});
