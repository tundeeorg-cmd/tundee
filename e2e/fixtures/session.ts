/**
 * Signed-in state for the visual test, against e2e/fake-supabase.mjs only.
 *
 * The session cookie is minted by @supabase/ssr itself (setSession → its cookie
 * writer), so the name, encoding and chunking are exactly what the app reads, and
 * stay right if the library changes them. The fake server accepts any token whose
 * signature part is `e2e`; nothing here is a real credential.
 */
import type { BrowserContext } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { FAKE_SUPABASE_URL } from './fakeSupabase';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

function e2eAccessToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub: '00000000-0000-4000-8000-00000000e2e0', role: 'authenticated', aud: 'authenticated', email: 'e2e@example.test', iat: now, exp: now + 24 * 3600 }),
    'e2e',
  ].join('.');
}

export async function signInAsE2EUser(context: BrowserContext, baseURL = 'http://localhost:3000'): Promise<void> {
  const jar: { name: string; value: string }[] = [];
  const supabase = createServerClient(FAKE_SUPABASE_URL, 'e2e-anon-key', {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        for (const c of cookies) {
          const i = jar.findIndex((j) => j.name === c.name);
          if (i >= 0) jar.splice(i, 1);
          if (c.value) jar.push({ name: c.name, value: c.value });
        }
      },
    },
  });
  const { error } = await supabase.auth.setSession({ access_token: e2eAccessToken(), refresh_token: 'e2e-refresh-token' });
  if (error) throw new Error(`fake sign-in failed: ${error.message}`);
  if (!jar.length) throw new Error('fake sign-in wrote no session cookie');
  await context.addCookies(jar.map((c) => ({ ...c, url: baseURL })));
}

/** The cookie /api/preview-match sets after a /start match (lib/preview/types encodePreviewInput). */
export async function setPreviewCookie(
  context: BrowserContext,
  input: { level: string; gpa: number | null; province: string; income: number },
  baseURL = 'http://localhost:3000',
): Promise<void> {
  const value = Buffer.from(JSON.stringify([input.level, input.gpa, input.province, input.income]), 'utf8')
    .toString('base64url');
  await context.addCookies([{ name: 'tundee_preview', value, url: baseURL }]);
}
