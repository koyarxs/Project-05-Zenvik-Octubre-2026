import type { NextConfig } from 'next';
const deployment = process.env.APP_ORIGIN?.startsWith('https://') ?? false;
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      // Same-origin GPS supports client navigation; only explicit attendance actions request it.
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
      // Next currently uses inline hydration scripts. Nonce CSP is a separate deployment task.
      { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
      ...(deployment ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
    ] }];
  },
};
export default config;
