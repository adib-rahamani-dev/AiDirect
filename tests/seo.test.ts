import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSiteOrigin, publicIndexingAllowed, serializeJsonLd } from '../src/lib/seo';

test('SEO origin cannot contain credentials, query, fragment or a nonpublic scheme', () => {
  for (const value of [
    'http://example.com',
    'https://user:password@example.com',
    'https://example.com/?token=private',
    'https://example.com/#token',
    'https://example.com/private',
    'https://localhost',
  ])
    assert.throws(() => resolveSiteOrigin({ SITE_URL: value }));
  assert.equal(resolveSiteOrigin({ SITE_URL: 'https://example.com/' }), 'https://example.com');
});
test('Local OAuth URLs never leak into public canonical metadata', () => {
  assert.equal(
    resolveSiteOrigin({ APP_BASE_URL: 'http://127.0.0.1:3100' }),
    'https://aidirect-kappa.vercel.app',
  );
  assert.equal(
    resolveSiteOrigin({ SITE_URL: 'https://example.com', APP_BASE_URL: 'http://localhost:3000' }),
    'https://example.com',
  );
});
test('Preview and development builds cannot opt public pages into indexing', () => {
  assert(!publicIndexingAllowed({ VERCEL_ENV: 'preview' }));
  assert(!publicIndexingAllowed({ VERCEL_ENV: 'development' }));
  assert(publicIndexingAllowed({ VERCEL_ENV: 'production' }));
});
test('JSON-LD cannot close its containing script element', () => {
  const value = { name: '</script><script>alert(1)</script>' };
  const serialized = serializeJsonLd(value);
  assert(!serialized.includes('<'));
  assert.deepEqual(JSON.parse(serialized), value);
});
