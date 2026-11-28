/**
 * Visual / accessibility check of the paid-ad flow (npm run test:visual).
 *
 * Runs against BASE_URL when set (a preview deploy, a local `next start`), else
 * starts `next dev` on :3000 pointed at e2e/fake-supabase.mjs: a local Supabase
 * stand-in with fixture scholarships and a fake signed-in user. The spec also mocks
 * /api/preview-match and blocks real Supabase and every analytics host, so nothing
 * is written anywhere and no participant is ever randomized.
 */
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { FAKE_SUPABASE_URL } from './fixtures/fakeSupabase';

// Paths below are relative to this file (e2e/); the app is one level up.
const ROOT = path.resolve(__dirname, '..');

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const external = !!process.env.BASE_URL;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: external ? undefined : [{
    command: 'node e2e/fake-supabase.mjs',
    cwd: ROOT,
    url: `${FAKE_SUPABASE_URL}/rest/v1/rpc/get_public_scholarship_stats`,
    timeout: 10_000,
    reuseExistingServer: true,
    env: { FAKE_SUPABASE_PORT: '54329' },
  }, {
    command: 'npx next dev -p 3000',
    cwd: ROOT,
    url: 'http://localhost:3000/start',
    timeout: 180_000,
    reuseExistingServer: true,
    env: {
      // Always the local fake, never a real project: a stray NEXT_PUBLIC_SUPABASE_URL
      // in the shell must not point a test run at production.
      NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-role-key',
      // Shows the age + consent step, as in production. The spec answers "ยังไม่ถึง",
      // so /api/start/randomize is never called.
      ANON_RANDOMIZATION: 'on',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  }],
});
