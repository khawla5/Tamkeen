import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* Pin the trace root to the monorepo. Without this, Next walks up and can
     pick an unrelated lockfile outside the repo as the workspace root. */
  outputFileTracingRoot: monorepoRoot,
  /* @tamkeen/types ships compiled CommonJS from the workspace; transpiling it
     keeps Turbopack/webpack happy in the monorepo. */
  transpilePackages: ['@tamkeen/types'],
  typedRoutes: false,
  /* On Vercel the web app runs as a Services service, where `/_next/image`
     answers 404 — every <Image> rendered blank (the hero photos first). Serve
     the files as they are there; local dev and `next start` keep the optimizer.
     See D-137. */
  images: { unoptimized: process.env.VERCEL === '1' },
};

export default withNextIntl(nextConfig);
