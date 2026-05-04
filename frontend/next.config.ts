import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained build artifact in .next/standalone — required for
  // the multi-stage Docker image to copy only what's needed without node_modules.
  output: "standalone",

  // Strict mode surfaces extra React warnings in development only.
  reactStrictMode: true,

  // Security headers applied to every response.
  async headers() {
    return [
      {
        // Next.js static assets (JS/CSS chunks) have content-hash filenames —
        // they can be safely cached for 1 year at the browser and CDN level.
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
};

export default nextConfig;
