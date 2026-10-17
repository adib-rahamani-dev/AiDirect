import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson, InputError } from '../src/lib/http';
test('public JSON inputs reject oversized streams, invalid JSON and arrays', async () => {
  const request = (body: string) => new Request('https://app.example', { method: 'POST', body });
  assert.deepEqual(await readJson(request('{"action":"create"}'), 100), { action: 'create' });
  for (const body of ['null', '[]', '{broken'])
    await assert.rejects(() => readJson(request(body), 100), InputError);
  await assert.rejects(
    () => readJson(request('x'.repeat(101)), 100),
    (error: unknown) => error instanceof InputError && error.status === 413,
  );
});
