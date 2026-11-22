/**
 * Visual / accessibility check of the paid-ad flow (npm run test:visual).
 *
 * Runs against BASE_URL when set (a preview deploy, a local `next start`), else
 * starts `next dev` on :3000 with placeholder Supabase env. The spec mocks
 * /api/preview-match and blocks Supabase and every analytics host, so nothing is
 * written anywhere and no participant is ever randomized.
 */
import { defineConfig } from '@playwright/test';
import path from 'node:path';

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
  webServer: external ? undefined : {
    command: 'npx next dev -p 3000',
    cwd: ROOT,
    url: 'http://localhost:3000/start',
    timeout: 180_000,
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder',
      // Shows the age + consent step, as in production. The spec answers "ยังไม่ถึง",
      // so /api/start/randomize is never called.
      ANON_RANDOMIZATION: 'on',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
