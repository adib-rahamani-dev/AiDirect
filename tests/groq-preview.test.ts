import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groqIntentPreview } from '../src/lib/groq-preview';
test('Groq synthetic adapter is opt-in, validates category and has no free-text product authority', async () => {
  const oldEnabled = process.env.GROQ_SYNTHETIC_TEST_ENABLED,
    oldKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_SYNTHETIC_TEST_ENABLED;
  let calls = 0;
  const fake: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options?.redirect, 'error');
    return Response.json({ choices: [{ message: { content: '{"category":"لپ‌تاپ"}' } }] });
  };
  try {
    await assert.rejects(() => groqIntentPreview('ساختگی', ['لپ‌تاپ'], fake));
    assert.equal(calls, 0);
    process.env.GROQ_SYNTHETIC_TEST_ENABLED = 'true';
    process.env.GROQ_API_KEY = 'test-fixture';
    assert.deepEqual(await groqIntentPreview('ساختگی', ['لپ‌تاپ'], fake), { category: 'لپ‌تاپ' });
    await assert.rejects(() =>
      groqIntentPreview('ساختگی', ['لپ‌تاپ'], async () =>
        Response.json({ choices: [{ message: { content: '{"category":"نامعتبر","price":1}' } }] }),
      ),
    );
    await assert.rejects(
      () => groqIntentPreview('ساختگی', ['لپ‌تاپ'], async () => new Response('', { status: 429 })),
      { message: 'groq_rate_limited' },
    );
  } finally {
    if (oldEnabled === undefined) delete process.env.GROQ_SYNTHETIC_TEST_ENABLED;
    else process.env.GROQ_SYNTHETIC_TEST_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = oldKey;
  }
});
