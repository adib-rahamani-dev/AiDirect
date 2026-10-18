import type { NextConfig } from 'next';
import { siteOrigin } from './src/lib/seo';
const config: NextConfig = {
  poweredByHeader: false,
  logging: { incomingRequests: false },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      ...[
        'api',
        'admin',
        'dashboard',
        'login',
        'signup',
        'proof',
        'sendbox',
        'connect',
        'guide',
        'privacy',
        'data-deletion',
      ].map((prefix) => ({
        source: `/${prefix}/:path*`,
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      })),
      {
        source: '/:path*',
        missing: [
          { type: 'host' as const, value: new URL(siteOrigin).hostname.replace(/\./g, '\\.') },
        ],
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};
export default config;
