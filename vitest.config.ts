import { defineConfig, defaultExclude } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // scripts/analysis/* are measurement tools, not unit tests: they hit the
    // live database and need env vars, so they must not run in `npm test` or
    // in CI. Run one explicitly:
    //   npx vitest run scripts/analysis/rankDisplacement.test.ts
    exclude: [...defaultExclude, 'scripts/analysis/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
