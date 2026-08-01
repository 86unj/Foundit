import type { NextConfig } from 'next';

const ngrokDomain = process.env.NGROK_FRONTEND_DOMAIN?.trim();

// NEXT_PUBLIC_* values are inlined into the client bundle at build time, so a
// missing API URL produces a build that succeeds and then fails every request
// at runtime. Fail the production build instead. Dev and test are unaffected.
if (
  process.env.NODE_ENV === 'production' &&
  !process.env.NEXT_PUBLIC_API_URL?.trim()
) {
  throw new Error(
    'NEXT_PUBLIC_API_URL is required for a production build. Set it in ' +
      'foundit-ui/.env.production or in the build environment.'
  );
}

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  ...(ngrokDomain
    ? {
        allowedDevOrigins: [ngrokDomain],
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: 'http://localhost:3001/api/:path*',
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
