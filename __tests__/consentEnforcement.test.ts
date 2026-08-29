/**
 * PDPA consent, enforced on the server.
 *
 * It used to be enforced only in the browser: `/api/auth/email-link` and
 * `/api/auth/line/start` accepted anything, so posting to them directly started a signup
 * with no consent recorded. The tick becomes a consent_version + consent_at stamp on a
 * minor's profile — it should not be defeatable with curl.
 *
 * The subtle part is the email route's contract. Every other failure there returns
 * `fallback: true` so the client retries with supabase.auth.signInWithOtp() — correct for
 * a Resend outage, and catastrophic for a consent refusal, because falling back would
 * send the sign-in link anyway. A refusal has to actually refuse.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { CONSENT_VERSION, CONSENT_COOKIE, CONSENT_PARAM, hasValidConsent, isValidConsent } from '@/lib/consent';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const { POST: EMAIL_POST } = await import('../app/api/auth/email-link/route');
const { GET: LINE_GET } = await import('../app/api/auth/line/start/route');

const jsonRequest = (body: Record<string, unknown>, cookie?: string) =>
  new NextRequest('http://localhost/api/auth/email-link', {
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

describe('POST /api/auth/email-link', () => {
  it('refuses without consent, and does NOT offer a fallback', async () => {
    const res = await EMAIL_POST(jsonRequest({ email: 'student@example.com' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('consent_required');
    // The property that matters: fallback:true here would make the client send the
    // link through Supabase anyway, defeating the check entirely.
    expect(body.fallback).toBe(false);
  });

  it('refuses a forged consent value', async () => {
    const res = await EMAIL_POST(jsonRequest({ email: 'a@b.com', [CONSENT_PARAM]: 'true' }));
    expect((await res.json()).error).toBe('consent_required');
  });

  it('refuses before validating the address, so it cannot be used to probe emails', async () => {
    // Enumeration: an unconsented caller must not learn whether an address is even
    // well-formed, let alone whether it has an account.
    const res = await EMAIL_POST(jsonRequest({ email: 'not-an-email' }));
    expect((await res.json()).error).toBe('consent_required');
  });

  it('accepts consent from the cookie the hydrated page sets', async () => {
    const res = await EMAIL_POST(jsonRequest({ email: 'a@b.com' }, `${CONSENT_COOKIE}=${CONSENT_VERSION}`));
    expect((await res.json()).error).not.toBe('consent_required');
  });

  it('accepts consent from the body the client posts', async () => {
    const res = await EMAIL_POST(jsonRequest({ email: 'a@b.com', [CONSENT_PARAM]: CONSENT_VERSION }));
    expect((await res.json()).error).not.toBe('consent_required');
  });
});

describe('the no-JS form: one form, two buttons', () => {
  // React drops `formAction`, so the shell's LINE button cannot name its own target and
  // would otherwise post the LINE choice to the email route. It carries method=line and
  // this route hands it on — after the consent check, so the hand-off cannot skip it.
  const formPost = (body: Record<string, string>) =>
    EMAIL_POST(new NextRequest('http://localhost/api/auth/email-link', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    }));

  it('hands a consented LINE submission to the LINE start route', async () => {
    const res = await formPost({ method: 'line', consent: CONSENT_VERSION, next: '/scholarships', noscript: '1' });
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/api/auth/line/start');
    expect(location.searchParams.get('next')).toBe('/scholarships');
    expect(location.searchParams.get(CONSENT_PARAM)).toBe(CONSENT_VERSION);
  });

  it('refuses a LINE submission with no consent, rather than forwarding it', async () => {
    const res = await formPost({ method: 'line', next: '/scholarships', noscript: '1' });
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/auth');
    expect(location.searchParams.get('error')).toBe('consent_required');
  });

  it('refuses an email submission with no consent, echoing the address back', async () => {
    // The address is echoed so the student does not retype it — on these connections a
    // lost form field is a lost signup.
    const res = await formPost({ email: 'a@b.com', next: '/', noscript: '1' });
    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('consent_required');
    expect(location.searchParams.get('email')).toBe('a@b.com');
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
