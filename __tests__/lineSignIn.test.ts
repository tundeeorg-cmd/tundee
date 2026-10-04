/**
 * LINE sign-in, through the Supabase custom provider `custom:line`.
 *
 * /api/auth/line/start asks Supabase for the `custom:line` authorize URL and
 * points it back at /auth/callback, which exchanges the code like Google's,
 * writes profiles.line_user_id for the reminder bot, and turns a failed LINE
 * attempt into one retry with auto login disabled, then an explanation.
 *
 * The start-route tests run the real supabase-js against a fake project URL:
 * building the authorize URL is local (no network), so what is asserted is
 * exactly what a student's browser would be sent to.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { CONSENT_PARAM, CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/consent';
import { PREVIEW_PARAM, encodePreviewInput } from '@/lib/preview/types';
import { PREVIEW_COOKIE } from '@/lib/preview/types';
import { lineSubOf, LINE_PROVIDER } from '@/lib/line/authMode';

// ── /auth/callback collaborators, mocked ─────────────────────────────────────
const exchangeCodeForSession = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp: vi.fn(), getUser: vi.fn(async () => ({ data: { user: null } })) } }),
}));
vi.mock('@/lib/auth/resolveRedirect', () => ({
  resolveRedirect: vi.fn(async () => ({ path: '/scholarships' })),
  safeNext: (n: string | null) => n || '/scholarships',
  redirectWithConversion: (origin: string, r: { path: string }) => Response.redirect(`${origin}${r.path}`, 307),
}));
const linkLineProfile = vi.fn(async () => 'linked');
vi.mock('@/lib/line/linkProfile', () => ({ linkLineProfile }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }));

type Handler = (req: NextRequest) => Promise<Response>;
let LINE_START: Handler;
let CALLBACK: Handler;
beforeAll(async () => {
  LINE_START = (await import('../app/api/auth/line/start/route')).GET;
  CALLBACK   = (await import('../app/auth/callback/route')).GET as Handler;
});

const PROJECT = 'https://proj.supabase.co';
const PREVIEW = encodePreviewInput({ level: 'M4-M6', province: 'ขอนแก่น', income: 2, gpa: 3.2 });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tundee.org');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', PROJECT);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  exchangeCodeForSession.mockReset();
  linkLineProfile.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

const start = (qs = '') =>
  LINE_START(new NextRequest(`http://localhost/api/auth/line/start?${CONSENT_PARAM}=${CONSENT_VERSION}${qs}`, {
    headers: { cookie: `${CONSENT_COOKIE}=${CONSENT_VERSION}` },
  }));

const callback = (qs: string) => CALLBACK(new NextRequest(`https://www.tundee.org/auth/callback?${qs}`));

describe('the LINE identity', () => {
  it('reads the LINE id off the custom:line identity', () => {
    expect(lineSubOf({ identities: [{ provider: 'email' }, { provider: LINE_PROVIDER, identity_data: { sub: 'U1' } }] })).toBe('U1');
    expect(lineSubOf({ identities: [{ provider: LINE_PROVIDER, provider_id: 'U2', identity_data: {} }] })).toBe('U2');
    expect(lineSubOf({ identities: [{ provider: 'google', identity_data: { sub: 'g' } }] })).toBeNull();
  });
});

describe('/api/auth/line/start', () => {
  it("sends the student to Supabase's authorize endpoint for custom:line", async () => {
    const res = await start();
    const url = new URL(res.headers.get('location')!);
    expect(url.origin + url.pathname).toBe(`${PROJECT}/auth/v1/authorize`);
    expect(url.searchParams.get('provider')).toBe('custom:line');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')?.toLowerCase()).toBe('s256');
  });

  it('writes the PKCE verifier cookie the callback exchange needs', async () => {
    const res = await start();
    expect(res.headers.getSetCookie().some(c => /code-verifier=/.test(c))).toBe(true);
  });

  it("forwards LINE's own parameters: Thai consent screen, bot prompt, no forced password form", async () => {
    const url = new URL((await start()).headers.get('location')!);
    expect(url.searchParams.get('ui_locales')).toBe('th');
    expect(url.searchParams.get('bot_prompt')).toBeTruthy();
    expect(url.searchParams.has('disable_auto_login')).toBe(false);
  });

  it('returns to /auth/callback carrying next, consent, the guest session, the campaign and the LINE marker', async () => {
    const url = new URL((await start(`&next=/tracker&${PREVIEW_PARAM}=${encodeURIComponent(PREVIEW)}&utm_campaign=fb_sept`)).headers.get('location')!);
    const back = new URL(url.searchParams.get('redirect_to')!);
    expect(back.origin + back.pathname).toBe('https://www.tundee.org/auth/callback');
    expect(back.searchParams.get('next')).toBe('/tracker');
    expect(back.searchParams.get(CONSENT_PARAM)).toBe(CONSENT_VERSION);
    expect(back.searchParams.get(PREVIEW_PARAM)).toBe(PREVIEW);
    expect(back.searchParams.get('utm_campaign')).toBe('fb_sept');
    expect(back.searchParams.get('via_line')).toBe('1');
    expect(back.searchParams.has('line_retry')).toBe(false);
  });

  // Ported from the bridge's tests: these decide app-to-app versus the QR code
  // or the password form, and they matter just as much through Supabase.
  it('never forces the QR screen and leaves the login-method switcher alone', async () => {
    const url = new URL((await start()).headers.get('location')!);
    expect(url.searchParams.has('initial_amr_display')).toBe(false);
    expect(url.searchParams.has('switch_amr')).toBe(false);
  });

  it('writes the ordinary preview cookie, for a browser that escaped a webview with none', async () => {
    const res = await start(`&${PREVIEW_PARAM}=${encodeURIComponent(PREVIEW)}`);
    expect(res.headers.getSetCookie().some(c => c.startsWith(`${PREVIEW_COOKIE}=`))).toBe(true);
  });

  it('ignores a preview value that does not decode, rather than carrying junk', async () => {
    const res = await start(`&${PREVIEW_PARAM}=not-a-preview`);
    const back = new URL(new URL(res.headers.get('location')!).searchParams.get('redirect_to')!);
    expect(back.searchParams.has(PREVIEW_PARAM)).toBe(false);
    expect(res.headers.getSetCookie().some(c => c.startsWith(`${PREVIEW_COOKIE}=`))).toBe(false);
  });

  it('on the retry, disables auto login and marks the return trip as the retry', async () => {
    const url = new URL((await start('&retry=1')).headers.get('location')!);
    expect(url.searchParams.get('disable_auto_login')).toBe('true');
    expect(new URL(url.searchParams.get('redirect_to')!).searchParams.get('line_retry')).toBe('1');
  });

  it('still refuses without consent', async () => {
    const res = await LINE_START(new NextRequest('http://localhost/api/auth/line/start'));
    expect(res.headers.get('location')).toContain('/auth?error=consent_required');
  });

  it('degrades to the email path when Supabase env is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect((await start()).headers.get('location')).toBe('https://www.tundee.org/auth?error=line_not_configured');
  });
});

describe('/api/auth/line/start refuses to start LINE where it cannot open the app', () => {
  // The /auth page shows the Safari help itself — once hydrated. Anything that
  // reaches the route directly (an early tap, a cached page, a typed URL) must
  // get the same, never LINE's email + password form.
  const UA = {
    chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
    fbIos:     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]',
    safari:    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  };
  const startAs = (ua: string, qs = '') =>
    LINE_START(new NextRequest(`http://localhost/api/auth/line/start?${CONSENT_PARAM}=${CONSENT_VERSION}${qs}`, {
      headers: { cookie: `${CONSENT_COOKIE}=${CONSENT_VERSION}`, 'user-agent': ua },
    }));

  it.each([['Chrome on iPhone', UA.chromeIos], ['the Facebook webview on iPhone', UA.fbIos]])(
    '%s goes back to /auth with the Safari help, answers and campaign kept',
    async (_name, ua) => {
      const res = await startAs(ua, `&next=/tracker&${PREVIEW_PARAM}=${encodeURIComponent(PREVIEW)}&utm_campaign=fb_sept`);
      const to = new URL(res.headers.get('location')!);
      expect(to.origin + to.pathname).toBe('https://www.tundee.org/auth');
      expect(to.searchParams.get('error')).toBe('line_open_in_safari');
      expect(to.searchParams.get('next')).toBe('/tracker');
      expect(to.searchParams.get(PREVIEW_PARAM)).toBe(PREVIEW);
      expect(to.searchParams.get('utm_campaign')).toBe('fb_sept');
    },
  );

  it.each([['Safari on iPhone', UA.safari], ['Chrome on Android', UA.chromeAndroid]])(
    '%s goes to LINE as before',
    async (_name, ua) => {
      const url = new URL((await startAs(ua)).headers.get('location')!);
      expect(url.origin + url.pathname).toBe(`${PROJECT}/auth/v1/authorize`);
    },
  );

  it('the /auth page opens the Safari help when sent back with it', async () => {
    const { readFileSync } = await import('node:fs');
    const form = readFileSync('app/auth/AuthForm.tsx', 'utf8');
    expect(form).toContain("if (err === 'line_open_in_safari') {");
    expect(form).toMatch(/line_open_in_safari'\) \{\s*setIosHelp\(true\);/);
  });
});

describe('/auth/callback for a LINE sign-in', () => {
  it('writes the LINE id onto the profile after a successful exchange', async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: 'user-1', identities: [{ provider: 'custom:line', identity_data: { sub: 'Uabc' } }] } },
      error: null,
    });
    const res = await callback('code=c&via_line=1&next=/scholarships');
    expect(linkLineProfile).toHaveBeenCalledWith({ admin: true }, 'user-1', 'Uabc');
    expect(res.headers.get('location')).toBe('https://www.tundee.org/scholarships');
  });

  it('leaves Google sign-ins alone', async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: 'user-2', identities: [{ provider: 'google', identity_data: { sub: 'g' } }] } },
      error: null,
    });
    await callback('code=c');
    expect(linkLineProfile).not.toHaveBeenCalled();
  });

  it('a cancel is final', async () => {
    const res = await callback('error=access_denied&via_line=1');
    expect(res.headers.get('location')).toBe('https://www.tundee.org/auth?error=line_cancelled');
  });

  it('any other LINE failure retries once with auto login disabled, keeping the guest session', async () => {
    const res = await callback(`error=server_error&via_line=1&next=/tracker&${PREVIEW_PARAM}=${encodeURIComponent(PREVIEW)}&utm_campaign=fb_sept`);
    const again = new URL(res.headers.get('location')!);
    expect(again.pathname).toBe('/api/auth/line/start');
    expect(again.searchParams.get('retry')).toBe('1');
    expect(again.searchParams.get('next')).toBe('/tracker');
    expect(again.searchParams.get(PREVIEW_PARAM)).toBe(PREVIEW);
    expect(again.searchParams.get('utm_campaign')).toBe('fb_sept');
    expect(again.searchParams.get(CONSENT_PARAM)).toBe(CONSENT_VERSION);
  });

  it('a failure on the retry stops and points at email', async () => {
    const res = await callback('error=server_error&via_line=1&line_retry=1');
    expect(res.headers.get('location')).toBe('https://www.tundee.org/auth?error=line_state_mismatch');
  });

  it('a failed code exchange on a LINE attempt gets the same one retry', async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: { status: 400, message: 'code verifier missing' } });
    const res = await callback('code=c&via_line=1');
    expect(new URL(res.headers.get('location')!).pathname).toBe('/api/auth/line/start');
  });

  it('a non-LINE OAuth error is not retried as LINE', async () => {
    const res = await callback('error=access_denied');
    expect(res.headers.get('location')).toBe('https://www.tundee.org/auth?error=exchange_failed');
  });
});
