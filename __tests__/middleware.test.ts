/**
 * middleware.ts — session refresh, the three route guards, and (since this
 * fix) fbclid/ttclid capture into first-party cookies on every request.
 *
 * The property this file exists to prove: a visitor arriving with an ad
 * click id never loses it, whether they land on an open route or get
 * redirected by a guard — matching the exact scenario from the bug report,
 * opening /start?fbclid=... and expecting both the query string AND the
 * _fbc cookie to survive.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

let sessionValue: { user: { id: string } } | null = null;
/** What Supabase says when asked (getUser). undefined = agrees with the cookie. */
let liveUser: { id: string } | null | undefined = undefined;
/** Cookies the client "refreshes" during getSession, as the real one does on renewal. */
let refreshCookies: { name: string; value: string }[] = [];
let signOutCalls: unknown[] = [];

type CookieAdapter = { setAll: (c: { name: string; value: string; options?: object }[]) => void };

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: CookieAdapter }) => ({
    auth: {
      getSession: async () => {
        if (refreshCookies.length) opts.cookies.setAll(refreshCookies);
        return { data: { session: sessionValue } };
      },
      getUser: async () => ({
        data: { user: liveUser === undefined ? (sessionValue?.user ?? null) : liveUser },
      }),
      signOut: async (o: unknown) => {
        signOutCalls.push(o);
        opts.cookies.setAll([{ name: 'sb-test-auth-token', value: '', options: { maxAge: 0 } }]);
        return { error: null };
      },
    },
  }),
}));

import { middleware } from '@/middleware';

function req(url: string) {
  return new NextRequest(url);
}

beforeEach(() => {
  sessionValue = null;
  liveUser = undefined;
  refreshCookies = [];
  signOutCalls = [];
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('fbclid/ttclid capture', () => {
  it('sets _fbc on an open route, with the query string left untouched', async () => {
    const res = await middleware(req('https://www.tundee.org/start?fbclid=TESTCLICK123&utm_source=fb'));

    expect(res.headers.get('location')).toBeNull(); // pass-through, not a redirect
    const fbc = res.cookies.get('_fbc');
    expect(fbc?.value).toMatch(/^fb\.1\.\d+\.TESTCLICK123$/);
    expect(fbc?.domain).toBe('.tundee.org');
    expect(fbc?.sameSite).toBe('lax');
    expect(fbc?.secure).toBe(true);
  });

  it('sets _ttclid the same way', async () => {
    const res = await middleware(req('https://www.tundee.org/start?ttclid=TTCLICK456'));
    expect(res.cookies.get('_ttclid')?.value).toBe('TTCLICK456');
  });

  it('sets no click-id cookie when neither id is present', async () => {
    const res = await middleware(req('https://www.tundee.org/start?utm_source=fb'));
    expect(res.cookies.get('_fbc')).toBeUndefined();
    expect(res.cookies.get('_ttclid')).toBeUndefined();
  });

  it('still captures fbclid even when the request gets redirected by a guard', async () => {
    // Unauthenticated visitor lands straight on /tracker with an ad click id —
    // gets bounced to /auth, but the click id must not be dropped on the way.
    const res = await middleware(req('https://www.tundee.org/tracker?fbclid=TESTCLICK123'));
    expect(res.headers.get('location')).toContain('fbclid=TESTCLICK123');
    expect(res.cookies.get('_fbc')?.value).toMatch(/^fb\.1\.\d+\.TESTCLICK123$/);
  });
});

describe('route guards forward the original query string', () => {
  it('/admin redirect keeps fbclid and utm_source', async () => {
    const res = await middleware(req('https://www.tundee.org/admin?fbclid=X&utm_source=fb'));
    const location = res.headers.get('location');
    expect(location).toContain('/auth');
    expect(location).toContain('fbclid=X');
    expect(location).toContain('utm_source=fb');
  });

  it('/tracker redirect keeps fbclid alongside its own from=tracker', async () => {
    const res = await middleware(req('https://www.tundee.org/tracker?fbclid=X'));
    const location = res.headers.get('location');
    expect(location).toContain('from=tracker');
    expect(location).toContain('fbclid=X');
  });

  it('/tracker redirect does not let an incoming from= override the guard\'s own', async () => {
    const res = await middleware(req('https://www.tundee.org/tracker?from=somewhere-else'));
    const location = res.headers.get('location');
    expect(new URL(location!).searchParams.get('from')).toBe('tracker');
  });

  it('logged-in visitor bounced off /auth keeps fbclid on the way to /scholarships', async () => {
    sessionValue = { user: { id: 'u1' } };
    const res = await middleware(req('https://www.tundee.org/auth?fbclid=X'));
    const location = res.headers.get('location');
    expect(location).toContain('/scholarships');
    expect(location).toContain('fbclid=X');
  });

  it('logged-in visitor with ?next= is sent there, still carrying fbclid', async () => {
    sessionValue = { user: { id: 'u1' } };
    const res = await middleware(req('https://www.tundee.org/auth?next=%2Fscholarships%2Ftd%2F123&fbclid=X'));
    const location = res.headers.get('location');
    expect(location).toContain('/scholarships/td/123');
    expect(location).toContain('fbclid=X');
  });

  it('rejects an off-site ?next= exactly as before, unaffected by query forwarding', async () => {
    sessionValue = { user: { id: 'u1' } };
    const res = await middleware(req('https://www.tundee.org/auth?next=https%3A%2F%2Fevil.example.com'));
    const location = res.headers.get('location');
    expect(location).toContain('/scholarships');
    expect(location).not.toContain('evil.example.com');
  });
});

describe('unaffected requests pass through untouched', () => {
  it('an open route with no session and no click id gets a plain pass-through', async () => {
    const res = await middleware(req('https://www.tundee.org/scholarships'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.cookies.get('_fbc')).toBeUndefined();
  });
});


describe('/auth trusts Supabase, not the cookie (15 Nov 2026)', () => {
  // On a phone: a sign-in cookie whose session was dead sent /auth straight on to
  // /scholarships, which (asking Supabase) showed the student signed out with a
  // link back to /auth. A loop with no way to sign in.
  it('a dead session on /auth is not redirected, and its cookie is cleared', async () => {
    sessionValue = { user: { id: 'u1' } };
    liveUser = null;
    const res = await middleware(req('https://www.tundee.org/auth?from=signup&next=%2Fscholarships%3Ffrom%3Dpreview'));
    expect(res.headers.get('location')).toBeNull();
    expect(signOutCalls).toEqual([{ scope: 'local' }]);
    expect(res.cookies.get('sb-test-auth-token')?.value).toBe('');
  });

  it('a live session on /auth is still sent to next', async () => {
    sessionValue = { user: { id: 'u1' } };
    const res = await middleware(req('https://www.tundee.org/auth?next=%2Ftracker'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/tracker');
    expect(signOutCalls).toEqual([]);
  });

  it('other routes do not pay for the extra check', async () => {
    sessionValue = { user: { id: 'u1' } };
    liveUser = null;
    await middleware(req('https://www.tundee.org/start'));
    expect(signOutCalls).toEqual([]);
  });

  it('a redirect keeps the session cookies refreshed on the way', async () => {
    sessionValue = { user: { id: 'u1' } };
    refreshCookies = [{ name: 'sb-test-auth-token', value: 'renewed' }];
    const res = await middleware(req('https://www.tundee.org/auth?next=%2Ftracker'));
    expect(res.headers.get('location')).not.toBeNull();
    expect(res.cookies.get('sb-test-auth-token')?.value).toBe('renewed');
  });

  it('the guard redirects keep them too', async () => {
    refreshCookies = [{ name: 'sb-test-auth-token', value: 'renewed' }];
    const res = await middleware(req('https://www.tundee.org/tracker'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/auth');
    expect(res.cookies.get('sb-test-auth-token')?.value).toBe('renewed');
  });
});
