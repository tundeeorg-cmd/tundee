import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Config for scripts/analysis/* — measurement tools, not unit tests.
 *
 * They read the live database, so vitest.config.ts excludes them from
 * `npm test`. A path filter alone cannot re-include them: vitest applies
 * `exclude` even when you name a file explicitly, and the CLI's --exclude
 * appends rather than replaces. Hence a separate config with its own include.
 *
 * Run: npm run analyze
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['scripts/analysis/**/*.test.ts'],
    testTimeout: 120_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
