import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    /* The default 5s is not a budget for the test, it is a budget for the test
       plus whatever else the pool is running. The keyboard-driven cases spend
       ~2s alone and exceeded 5s under a full parallel run on a loaded machine
       — a flake, not a failure, and CI's two-core runners are more contended
       than any dev box. Raised so a timeout means a hang, not a busy pool. */
    testTimeout: 20_000,
  },
});
