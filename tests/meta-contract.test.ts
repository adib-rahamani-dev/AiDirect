import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaAdapter, profile, exchangeCode } from '../src/lib/meta';
test('Private reply contract uses the comment ID, bearer token and Instagram host', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://graph.instagram.com/v26.0/123/messages');
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer fixture-token');
      assert.deepEqual(JSON.parse(String(init?.body)), {
        recipient: { comment_id: '456' },
        message: { text: 'reply\nhttps://example.com' },
      });
      return Response.json({ recipient_id: '789', message_id: 'fixture-message' });
    };
    assert.deepEqual(
      await metaAdapter.send('123', '456', 'reply\nhttps://example.com', 'fixture-token'),
      { messageId: 'fixture-message' },
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('Profile uses professional user_id instead of app-scoped id', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(new URL(String(url)).searchParams.get('fields'), 'id,user_id,username');
      return Response.json({ data: [{ id: '111', user_id: '222', username: 'fixture-owner' }] });
    };
    assert.deepEqual(await profile('fixture-token'), {
      accountId: '222',
      appScopedId: '111',
      username: 'fixture-owner',
    });
  } finally {
    globalThis.fetch = original;
  }
});
test('OAuth exchanges documented form fields and supports official data envelope', async () => {
  const original = globalThis.fetch;
  const oldId = process.env.INSTAGRAM_APP_ID,
    oldSecret = process.env.INSTAGRAM_APP_SECRET;
  process.env.INSTAGRAM_APP_ID = '123';
  process.env.INSTAGRAM_APP_SECRET = 'fixture-secret';
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      if (calls === 1) {
        assert.equal(String(url), 'https://api.instagram.com/oauth/access_token');
        assert.equal(init?.method, 'POST');
        const form = init?.body as FormData;
        assert.equal(form.get('client_id'), '123');
        assert.equal(form.get('grant_type'), 'authorization_code');
        assert.equal(form.get('redirect_uri'), 'http://localhost:3000/api/meta/callback');
        return Response.json({
          data: [
            {
              access_token: 'fixture-short',
              user_id: '111',
              permissions: 'instagram_business_basic,instagram_business_manage_comments',
            },
          ],
        });
      }
      const parsed = new URL(String(url));
      assert.equal(parsed.origin, 'https://graph.instagram.com');
      assert.equal(parsed.pathname, '/access_token');
      assert.equal(parsed.searchParams.get('grant_type'), 'ig_exchange_token');
      return Response.json({ access_token: 'fixture-long', expires_in: 5184000 });
    };
    assert.deepEqual(await exchangeCode('fixture-code'), {
      accessToken: 'fixture-long',
      appScopedId: '111',
      expiresIn: 5184000,
    });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    if (oldId === undefined) delete process.env.INSTAGRAM_APP_ID;
    else process.env.INSTAGRAM_APP_ID = oldId;
    if (oldSecret === undefined) delete process.env.INSTAGRAM_APP_SECRET;
    else process.env.INSTAGRAM_APP_SECRET = oldSecret;
  }
});
