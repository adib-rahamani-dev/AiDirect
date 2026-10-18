import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';

const local = process.argv.includes('--local');
const canonical = 'https://aidirect-kappa.vercel.app';
const base = local ? 'http://127.0.0.1:3100' : canonical;
let checks = 0;
function check(condition, label) {
  assert(condition, label);
  checks++;
}
async function get(path, canonicalHost = true) {
  if (local) {
    return new Promise((resolve, reject) => {
      // Node fetch normalizes Host; httpGet allows an explicit local host-policy check.
      const request = httpGet(
        base + path,
        {
          headers: canonicalHost ? { Host: new URL(canonical).host } : {},
        },
        (incoming) => {
          const chunks = [];
          incoming.on('data', (chunk) => chunks.push(chunk));
          incoming.on('error', reject);
          incoming.on('end', () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: incoming.statusCode,
                headers: Object.fromEntries(
                  Object.entries(incoming.headers).filter(([, value]) => typeof value === 'string'),
                ),
              }),
            ),
          );
        },
      );
      request.setTimeout(30000, () => request.destroy(new Error('Local SEO request timed out')));
      request.on('error', reject);
    });
  }
  return fetch(base + path, {
    redirect: 'manual',
    headers: {
      'User-Agent': 'AiDirect-SEO-Verification/1.0',
      ...(local && canonicalHost ? { Host: new URL(canonical).host } : {}),
    },
    signal: AbortSignal.timeout(30000),
  });
}
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}
function metadata(html, name, kind = 'name') {
  return [...html.matchAll(/<meta\b[^>]*>/g)]
    .map((m) => attributes(m[0]))
    .filter((m) => m[kind] === name)
    .map((m) => m.content);
}
function canonicalUrl(html) {
  return [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => attributes(m[0]))
    .filter((m) => m.rel === 'canonical')
    .map((m) => m.href);
}
function structuredData(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => attributes(m[1]).type === 'application/ld+json')
    .map((m) => JSON.parse(m[2]));
}

for (const path of ['/', '/instagram-comment-to-dm']) {
  const response = await get(path);
  check(response.status === 200, `Public page status: ${path}`);
  check(
    !response.headers.get('x-robots-tag')?.includes('noindex'),
    `Canonical public host indexable: ${path}`,
  );
  const html = await response.text();
  check(/<html[^>]*lang="fa"[^>]*dir="rtl"/.test(html), 'Persian RTL document');
  check((html.match(/<h1\b/g) ?? []).length === 1, 'One visible H1');
  check(
    (html.match(/<title>/g) ?? []).length === 1 && html.includes('کامنت به دایرکت'),
    'Unique descriptive title',
  );
  check(metadata(html, 'description').length === 1, 'Single meta description');
  check(
    JSON.stringify(canonicalUrl(html).map((value) => new URL(value).href)) ===
      JSON.stringify([canonical + path]),
    'One correct canonical without query or invitation',
  );
  check(
    metadata(html, 'robots').length === 1 && !metadata(html, 'robots')[0].includes('noindex'),
    'Public robots override private default',
  );
  check(metadata(html, 'og:locale', 'property')[0] === 'fa_IR', 'Persian share locale');
  check(
    metadata(html, 'og:image', 'property')[0]?.startsWith(canonical + '/opengraph-image'),
    'Absolute social image',
  );
  check(metadata(html, 'twitter:card')[0] === 'summary_large_image', 'Large social card');
  const data = structuredData(html);
  check(data.length === 1, 'One scoped structured-data document');
  check(data[0]['@type'] === (path === '/' ? 'WebSite' : 'BreadcrumbList'), 'Accurate schema type');
  check(
    !html.includes('aggregateRating') && !html.includes('application/ld+json\">undefined'),
    'No invented ratings or malformed schema',
  );
  if (path === '/') {
    check(
      data[0].url === canonical + '/' && data[0].name === 'AiDirect',
      'Canonical site identity',
    );
    check(html.includes('href="/instagram-comment-to-dm"'), 'Crawlable link to useful content');
  }
}

const privatePaths = [
  '/admin',
  '/proof',
  '/sendbox',
  '/connect',
  '/connect/instagram',
  '/guide',
  '/privacy',
  '/data-deletion',
];
const privateResults = await Promise.allSettled(
  privatePaths.map(async (path) => {
    const response = await get(path);
    const html = await response.text();
    return { path, response, html };
  }),
);
for (const result of privateResults) {
  if (result.status === 'rejected') throw new Error('Private SEO check transport unavailable');
  const { path, response, html } = result.value;
  check(response.status === 200, `Private page accessible as login or public notice: ${path}`);
  check(
    response.headers.get('x-robots-tag')?.includes('noindex'),
    `Private response noindex: ${path}`,
  );
  check(
    response.headers.get('cache-control')?.includes('no-store'),
    `Private page is not cached: ${path}`,
  );
  check(
    metadata(html, 'robots').some((r) => r.includes('noindex')),
    `Private HTML noindex: ${path}`,
  );
}

let response = await get('/api/admin');
check(response.status === 401, 'Operator API still requires authentication');
check(response.headers.get('x-robots-tag')?.includes('noindex'), 'APIs excluded from indexing');
check(response.headers.get('cache-control')?.includes('no-store'), 'API responses remain private');
response = await get('/robots.txt');
check(response.status === 200, 'Robots available');
const robots = await response.text();
check(
  robots.includes('Allow: /') && !robots.includes('Disallow: /'),
  'Crawlers can read page noindex directives',
);
check(robots.includes(`Sitemap: ${canonical}/sitemap.xml`), 'Canonical sitemap advertised');
response = await get('/sitemap.xml');
check(
  response.status === 200 && response.headers.get('content-type')?.includes('xml'),
  'XML sitemap available',
);
const sitemap = await response.text();
const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
check(
  JSON.stringify(locations) ===
    JSON.stringify([canonical + '/', canonical + '/instagram-comment-to-dm']),
  'Only indexable canonical pages in sitemap',
);
check(
  !sitemap.includes('token') && !sitemap.includes('<priority>'),
  'No invitation or fabricated crawl priority',
);
response = await get('/this-page-does-not-exist-seo-check');
check(response.status === 404, 'Missing content is a real 404');
check(
  metadata(await response.text(), 'robots').some((r) => r.includes('noindex')),
  '404 excluded',
);
for (const [path, width, height] of [
  ['/opengraph-image', 1200, 630],
  ['/icon', 96, 96],
  ['/apple-icon', 180, 180],
]) {
  response = await get(path);
  check(
    response.status === 200 && response.headers.get('content-type')?.includes('image/png'),
    `Share/icon image available: ${path}`,
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  check(
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.readUInt32BE(16) === width &&
      bytes.readUInt32BE(20) === height,
    `Correct PNG dimensions: ${path}`,
  );
  if (local && path === '/opengraph-image') writeFileSync('.local/seo-social-card.png', bytes);
}
if (local) {
  response = await get('/', false);
  check(
    response.headers.get('x-robots-tag')?.includes('noindex'),
    'Noncanonical hosts cannot be indexed',
  );
}
console.log(
  JSON.stringify({
    checks,
    result: 'passed',
    scope: local
      ? 'local production build, canonical Host simulation and noncanonical header guard'
      : 'canonical HTTPS SEO, metadata, sitemap, private headers and images; no Search Console ownership or ranking claim',
  }),
);
