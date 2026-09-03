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

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: sessionValue } }),
    },
  }),
}));

import { middleware } from '@/middleware';

function req(url: string) {
  return new NextRequest(url);
}

beforeEach(() => {
  sessionValue = null;
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
