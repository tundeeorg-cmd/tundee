/**
 * The LINE Login authorization URL, and the auto-login failure loop.
 *
 * LINE Login's whole value here is app-to-app: the LINE app opens and the
 * student approves with one tap. The alternative LINE falls back to is an email
 * + password form that most Thai users cannot complete, because they registered
 * LINE with a phone number and have never had a LINE password.
 *
 * These assert the parameters that decide which of those two a student gets,
 * and the retry that stops a failed auto login from becoming a closed loop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { CONSENT_PARAM, CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/consent';
import { PREVIEW_PARAM, encodePreviewInput } from '@/lib/preview/types';
import {
  LINE_AUTH_NONCE_COOKIE,
  LINE_AUTH_VERIFIER_COOKIE,
  LINE_AUTH_RETRY_COOKIE,
  LINE_AUTH_UTM_COOKIE,
  LINE_AUTH_PREVIEW_COOKIE,
} from '@/lib/line/authCookies';

const { GET: LINE_START } = await import('../app/api/auth/line/start/route');

const PREVIEW = encodePreviewInput({ level: 'M4-M6', province: 'ขอนแก่น', income: 2, gpa: 3.2 });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tundee.org');
  vi.stubEnv('LINE_LOGIN_CHANNEL_ID', 'test-channel');
  vi.stubEnv('LINE_AUTH_REDIRECT_URI', 'https://www.tundee.org/api/auth/line/callback');
});
afterEach(() => vi.unstubAllEnvs());

const start = (qs = '') =>
  LINE_START(new NextRequest(`http://localhost/api/auth/line/start?${CONSENT_PARAM}=${CONSENT_VERSION}${qs}`, {
    headers: { cookie: `${CONSENT_COOKIE}=${CONSENT_VERSION}` },
  }));

const authorizeUrl = async (qs = '') =>
  new URL((await start(qs)).headers.get('location')!);

describe('the parameters that decide app-to-app versus the password form', () => {
  it('never disables auto login on a first attempt', async () => {
    // disable_auto_login=true IS the password form. It belongs only on the
    // documented retry after a failure — sending it up front would guarantee
    // the outcome this whole change exists to avoid, for everyone.
    const url = await authorizeUrl();
    expect(url.searchParams.get('disable_auto_login')).toBeNull();
  });

  it('never forces the QR screen', async () => {
    // initial_amr_display=lineqr replaces the app handoff with a QR code, which
    // is useless on the phone that is displaying it.
    const url = await authorizeUrl();
    expect(url.searchParams.get('initial_amr_display')).toBeNull();
  });

  it('leaves the login-method switcher alone', async () => {
    const url = await authorizeUrl();
    expect(url.searchParams.get('switch_amr')).toBeNull();
  });

  it('asks for the Thai consent screen', async () => {
    // Otherwise LINE follows the device locale, so a Thai student on an
    // English-locale handset reads an English permissions screen.
    expect((await authorizeUrl()).searchParams.get('ui_locales')).toBe('th');
  });

  it('sends the OpenID parameters the callback verifies', async () => {
    const url = await authorizeUrl();
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.searchParams.get('nonce')).toBeTruthy();
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('goes to LINE Login v2.1', async () => {
    expect((await authorizeUrl()).origin + (await authorizeUrl()).pathname)
      .toBe('https://access.line.me/oauth2/v2.1/authorize');
  });
});

describe('nonce and PKCE are actually retained for the return trip', () => {
  it('stores both, or the callback has nothing to check against', async () => {
    const res = await start();
    const url = new URL(res.headers.get('location')!);

    expect(res.cookies.get(LINE_AUTH_NONCE_COOKIE)?.value).toBe(url.searchParams.get('nonce'));
    expect(res.cookies.get(LINE_AUTH_VERIFIER_COOKIE)?.value).toBeTruthy();
  });

  it('keeps them httpOnly — they are the proof, not a hint', async () => {
    const res = await start();
    expect(res.cookies.get(LINE_AUTH_NONCE_COOKIE)?.httpOnly).toBe(true);
    expect(res.cookies.get(LINE_AUTH_VERIFIER_COOKIE)?.httpOnly).toBe(true);
  });

  it('mints a fresh nonce and state per attempt', async () => {
    const a = new URL((await start()).headers.get('location')!);
    const b = new URL((await start()).headers.get('location')!);
    expect(a.searchParams.get('nonce')).not.toBe(b.searchParams.get('nonce'));
    expect(a.searchParams.get('state')).not.toBe(b.searchParams.get('state'));
  });
});

describe('the auto-login retry', () => {
  it('disables auto login when the callback sends us back with retry=1', async () => {
    // LINE's own prescribed remedy for an auto-login failure. Without it the
    // student bounces back to /auth, taps LINE, and reissues exactly the
    // request that just failed — a closed loop on the one-tap method.
    const url = await authorizeUrl('&retry=1');
    expect(url.searchParams.get('disable_auto_login')).toBe('true');
  });

  it('records the retry in a cookie, because the callback cannot see this query string', async () => {
    // LINE returns to the Callback URL registered in its console, byte for
    // byte, so nothing appended here comes back. Without the cookie a second
    // failure would bounce here and retry forever.
    expect((await start('&retry=1')).cookies.get(LINE_AUTH_RETRY_COOKIE)?.value).toBe('1');
  });

  it('writes 0 on a first attempt rather than leaving a stale marker', async () => {
    // An absent cookie has to mean "no retry attempted", never "a cookie from
    // the previous attempt is still lying around".
    expect((await start()).cookies.get(LINE_AUTH_RETRY_COOKIE)?.value).toBe('0');
  });
});

describe('the guest session and campaign survive the LINE round trip', () => {
  it('parks the /start answers for the callback to forward', async () => {
    const res = await start(`&${PREVIEW_PARAM}=${PREVIEW}`);
    expect(res.cookies.get(LINE_AUTH_PREVIEW_COOKIE)?.value).toBe(PREVIEW);
  });

  it('also writes the ordinary preview cookie, for a browser that has none', async () => {
    // The case this exists for: a student who escaped the Facebook webview into
    // Chrome arrives with the answers in the URL and an empty cookie jar. Without
    // this write, Chrome re-asks their grade, GPA and province.
    const res = await start(`&${PREVIEW_PARAM}=${PREVIEW}`);
    expect(res.cookies.get('tundee_preview')?.value).toBe(PREVIEW);
  });

  it('ignores a preview value that does not decode, rather than storing junk', async () => {
    const res = await start(`&${PREVIEW_PARAM}=not-valid-base64url-json`);
    expect(res.cookies.get(LINE_AUTH_PREVIEW_COOKIE)).toBeUndefined();
  });

  it('parks utm_campaign, which the LINE path used to drop entirely', async () => {
    // The callback builds its own handoff URL, so a param left on THIS request
    // never arrived at the profile merge — and every LINE signup was recorded
    // as recruitment_source 'organic' no matter which ad paid for it.
    const res = await start('&utm_campaign=fb_isan_aug');
    expect(res.cookies.get(LINE_AUTH_UTM_COOKIE)?.value).toBe('fb_isan_aug');
  });
});
