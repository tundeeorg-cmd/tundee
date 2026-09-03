/**
 * fbclid/ttclid capture into first-party cookies — see lib/tracking/clickIds.ts
 * for why this has to happen in middleware rather than the pixel script.
 */

import { describe, it, expect } from 'vitest';
import {
  buildFbcValue,
  trackingCookiesToSet,
  forwardQuery,
  FBC_COOKIE,
  TTCLID_COOKIE,
  CLICK_ID_COOKIE_DOMAIN,
  CLICK_ID_MAX_AGE_SECONDS,
} from '@/lib/tracking/clickIds';

describe('buildFbcValue', () => {
  it('matches the format the Conversions API documents: fb.1.<time>.<fbclid>', () => {
    expect(buildFbcValue('TESTCLICK123', 1750000000000)).toBe('fb.1.1750000000000.TESTCLICK123');
  });
});

describe('trackingCookiesToSet', () => {
  const now = 1750000000000;

  it('sets _fbc when fbclid is in the URL', () => {
    const url = new URL('https://www.tundee.org/start?fbclid=TESTCLICK123&utm_source=fb');
    const cookies = trackingCookiesToSet(url, now);

    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toEqual({
      name:  FBC_COOKIE,
      value: 'fb.1.1750000000000.TESTCLICK123',
      options: {
        domain:   CLICK_ID_COOKIE_DOMAIN,
        maxAge:   CLICK_ID_MAX_AGE_SECONDS,
        sameSite: 'lax',
        secure:   true,
        path:     '/',
      },
    });
  });

  it('sets _ttclid when ttclid is in the URL, holding the raw value', () => {
    const url = new URL('https://www.tundee.org/start?ttclid=TTCLICK456');
    const cookies = trackingCookiesToSet(url, now);

    expect(cookies).toEqual([{
      name:  TTCLID_COOKIE,
      value: 'TTCLICK456',
      options: {
        domain:   CLICK_ID_COOKIE_DOMAIN,
        maxAge:   CLICK_ID_MAX_AGE_SECONDS,
        sameSite: 'lax',
        secure:   true,
        path:     '/',
      },
    }]);
  });

  it('sets both cookies when both click ids are present', () => {
    const url = new URL('https://www.tundee.org/start?fbclid=A&ttclid=B');
    const cookies = trackingCookiesToSet(url, now);
    expect(cookies.map(c => c.name).sort()).toEqual([FBC_COOKIE, TTCLID_COOKIE].sort());
  });

  it('is a no-op — the common case — when neither click id is present', () => {
    const url = new URL('https://www.tundee.org/start?utm_source=fb');
    expect(trackingCookiesToSet(url, now)).toEqual([]);
  });

  it('the domain has a leading dot, so it reads on both tundee.org and www.tundee.org', () => {
    const url = new URL('https://www.tundee.org/start?fbclid=X');
    const [cookie] = trackingCookiesToSet(url, now);
    expect(cookie.options.domain).toBe('.tundee.org');
  });

  it('90-day max-age, matching Meta\'s own _fbc lifetime', () => {
    const url = new URL('https://www.tundee.org/start?fbclid=X');
    const [cookie] = trackingCookiesToSet(url, now);
    expect(cookie.options.maxAge).toBe(90 * 24 * 60 * 60);
  });
});

describe('forwardQuery', () => {
  it('copies params from the incoming URL onto the destination', () => {
    const incoming = new URL('https://www.tundee.org/tracker?fbclid=TESTCLICK123&utm_source=fb').searchParams;
    const destination = new URL('https://www.tundee.org/auth');
    forwardQuery(destination, incoming);

    expect(destination.searchParams.get('fbclid')).toBe('TESTCLICK123');
    expect(destination.searchParams.get('utm_source')).toBe('fb');
  });

  it('never overwrites a param the destination already set on purpose', () => {
    const incoming = new URL('https://www.tundee.org/tracker?from=elsewhere&fbclid=X').searchParams;
    const destination = new URL('https://www.tundee.org/auth?from=tracker');
    forwardQuery(destination, incoming);

    // The redirect's own `from=tracker` wins — the incoming `from` is dropped,
    // not merged over it.
    expect(destination.searchParams.get('from')).toBe('tracker');
    expect(destination.searchParams.get('fbclid')).toBe('X');
  });

  it('is a no-op when the incoming URL carries no query at all', () => {
    const incoming = new URL('https://www.tundee.org/tracker').searchParams;
    const destination = new URL('https://www.tundee.org/auth?from=tracker');
    forwardQuery(destination, incoming);
    expect(destination.searchParams.toString()).toBe('from=tracker');
  });
});
