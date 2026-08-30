/**
 * PDPA consent, enforced on the server.
 *
 * It used to be enforced only in the browser, so posting directly to the signup
 * routes started a signup with no consent recorded. The tick becomes a
 * consent_version + consent_at stamp on a minor's profile — it should not be
 * defeatable with curl.
 *
 * `/api/auth/password` is the route that matters most now: it is the primary
 * way into the product, it creates a live account in a single request with no
 * email round trip, and it serves both the hydrated client and the no-JS form.
 * A consent hole there is a consent hole in nearly every signup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { CONSENT_VERSION, CONSENT_COOKIE, CONSENT_PARAM, hasValidConsent, isValidConsent } from '@/lib/consent';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const { POST: PASSWORD_POST } = await import('../app/api/auth/password/route');
const { GET: LINE_GET } = await import('../app/api/auth/line/start/route');

const jsonRequest = (body: Record<string, unknown>, cookie?: string) =>
  new NextRequest('http://localhost/api/auth/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tundee.org');
  vi.stubEnv('LINE_LOGIN_CHANNEL_ID', 'test-channel');
  vi.stubEnv('LINE_AUTH_REDIRECT_URI', 'https://www.tundee.org/api/auth/line/callback');
});
afterEach(() => vi.unstubAllEnvs());

describe('hasValidConsent', () => {
  it('accepts any carrier presenting the issued version', () => {
    // Cookie, form field and query param are the same click reported three ways.
    expect(hasValidConsent(CONSENT_VERSION)).toBe(true);
    expect(hasValidConsent(null, undefined, CONSENT_VERSION)).toBe(true);
  });

  it('rejects a version we never issued', () => {
    expect(hasValidConsent('0.9', 'true', 'yes', '1')).toBe(false);
    expect(hasValidConsent(null, undefined, '')).toBe(false);
    expect(isValidConsent('1')).toBe(false);
  });
});

describe('POST /api/auth/password', () => {
  const CREDS = { email: 'student@example.com', password: 'longenoughpw' };

  it('refuses without consent', async () => {
    const res = await PASSWORD_POST(jsonRequest(CREDS));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('consent_required');
  });

  it('refuses a forged consent value', async () => {
    const res = await PASSWORD_POST(jsonRequest({ ...CREDS, [CONSENT_PARAM]: 'true' }));
    expect((await res.json()).error).toBe('consent_required');
  });

  it('refuses before validating the address, so it cannot be used to probe emails', async () => {
    // Enumeration: an unconsented caller must not learn whether an address is even
    // well-formed, let alone whether it has an account. The signup form necessarily
    // discloses existence to a CONSENTED caller — every password login does — but
    // that disclosure must not be reachable without the tick.
    const res = await PASSWORD_POST(jsonRequest({ email: 'not-an-email', password: 'longenoughpw' }));
    expect((await res.json()).error).toBe('consent_required');
  });

  it('refuses before checking the password, for the same reason', async () => {
    const res = await PASSWORD_POST(jsonRequest({ email: 'a@b.com', password: 'x' }));
    expect((await res.json()).error).toBe('consent_required');
  });

  /*
   * "Consent was accepted" is asserted through the NEXT gate rather than by
   * letting the request reach Supabase, which needs a request scope these tests
   * do not have. A malformed address answered `invalid_email` proves the
   * consent check passed and execution moved on — which is the property under
   * test — without standing up a session.
   */
  it('gets past consent on the cookie the hydrated page sets', async () => {
    const res = await PASSWORD_POST(
      jsonRequest({ email: 'nope', password: 'longenoughpw' }, `${CONSENT_COOKIE}=${CONSENT_VERSION}`),
    );
    expect((await res.json()).error).toBe('invalid_email');
  });

  it('gets past consent on the body the client posts', async () => {
    const res = await PASSWORD_POST(
      jsonRequest({ email: 'nope', password: 'longenoughpw', [CONSENT_PARAM]: CONSENT_VERSION }),
    );
    expect((await res.json()).error).toBe('invalid_email');
  });

  it('rejects a short password once consent is present', async () => {
    const res = await PASSWORD_POST(
      jsonRequest({ email: 'a@b.com', password: 'short', [CONSENT_PARAM]: CONSENT_VERSION }),
    );
    expect((await res.json()).error).toBe('weak_password');
  });

  it('rejects a malformed address once consent is present', async () => {
    const res = await PASSWORD_POST(
      jsonRequest({ email: 'nope', password: 'longenoughpw', [CONSENT_PARAM]: CONSENT_VERSION }),
    );
    expect((await res.json()).error).toBe('invalid_email');
  });
});

describe('the no-JS form posts to the same route and gets the same answers', () => {
  const formPost = (body: Record<string, string>) =>
    PASSWORD_POST(new NextRequest('http://localhost/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    }));

  it('refuses an unconsented submission, echoing the address back', async () => {
    // The address is echoed so the student does not retype it — on these connections a
    // lost form field is a lost signup.
    const res = await formPost({ email: 'a@b.com', password: 'longenoughpw', next: '/', noscript: '1' });
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/auth');
    expect(location.searchParams.get('error')).toBe('consent_required');
    expect(location.searchParams.get('email')).toBe('a@b.com');
  });

  it('redirects rather than returning JSON, so a browser with no JS can follow it', async () => {
    const res = await formPost({ email: 'a@b.com', password: 'x', noscript: '1', consent: CONSENT_VERSION });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('weak_password');
  });

  it('preserves next through a refusal, so it does not also lose where they were going', async () => {
    const res = await formPost({
      email: 'a@b.com', password: 'x', noscript: '1',
      consent: CONSENT_VERSION, next: '/scholarships?from=preview',
    });
    expect(new URL(res.headers.get('location')!).searchParams.get('next'))
      .toBe('/scholarships?from=preview');
  });
});

describe('GET /api/auth/line/start', () => {
  const get = (qs: string, cookie?: string) =>
    LINE_GET(new NextRequest(`http://localhost/api/auth/line/start${qs}`, {
      headers: cookie ? { cookie } : {},
    }));

  it('refuses without consent and sends the visitor back to /auth', async () => {
    const res = await get('?next=%2Fscholarships');
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/auth');
    expect(location.searchParams.get('error')).toBe('consent_required');
    // next is preserved, so refusing does not also lose where they were going.
    expect(location.searchParams.get('next')).toBe('/scholarships');
  });

  it('proceeds to LINE when the cookie carries consent', async () => {
    const res = await get('?next=%2F', `${CONSENT_COOKIE}=${CONSENT_VERSION}`);
    expect(res.headers.get('location')).toContain('access.line.me');
  });

  it('proceeds on the query param the no-JS form submits, and persists it', async () => {
    // The no-JS shell has no way to set a cookie, so the checkbox travels in the query
    // string. Without persisting it, /auth/callback would see an unconsented signup.
    const res = await get(`?next=%2F&${CONSENT_PARAM}=${CONSENT_VERSION}`);
    expect(res.headers.get('location')).toContain('access.line.me');
    expect(res.cookies.get(CONSENT_COOKIE)?.value).toBe(CONSENT_VERSION);
  });

  it('refuses a forged query param', async () => {
    const res = await get(`?next=%2F&${CONSENT_PARAM}=1`);
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('consent_required');
  });
});
