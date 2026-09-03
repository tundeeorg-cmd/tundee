/**
 * Ad click-id capture: fbclid/ttclid -> first-party cookies, written at the
 * very first hop — before the Meta/TikTok pixel loads, before the
 * cookie-consent banner is even shown, before any client JS runs at all.
 *
 * WHY THIS RUNS IN MIDDLEWARE, NOT THE PIXEL SCRIPT
 * ──────────────────────────────────────────────────
 * Meta's fbevents.js normally captures fbclid into _fbc itself, but only if
 * it is still in window.location.href the moment the script loads. On this
 * site that script does not load until the visitor taps "ยอมรับ" on the
 * cookie banner (components/CookieConsent.tsx) — and by the time that
 * happens, client-side navigation may already have carried the visitor to a
 * route where fbclid is no longer in the URL bar. Middleware runs on the
 * very first request, consent decision or not, so the click id is captured
 * before that race can lose it. (Sending it onward to Meta — the CAPI call in
 * app/api/meta/capi/route.ts — still requires consent; this module only
 * captures the id into a first-party cookie so it is there if consent comes
 * later in the same visit.)
 *
 * COOKIE FORMAT
 * ─────────────
 * _fbc follows the format Meta's Conversions API documents:
 * fb.<subdomain-index>.<click-time-ms>.<fbclid>. There is no equivalent
 * published spec for TikTok's ttclid — _ttclid here just holds the raw
 * value, which is what the TikTok Events API accepts directly.
 */

export const FBC_COOKIE = '_fbc';
export const TTCLID_COOKIE = '_ttclid';

/** Leading dot so the cookie is readable from both tundee.org and www.tundee.org. */
export const CLICK_ID_COOKIE_DOMAIN = '.tundee.org';

/** 90 days — matches the lifetime Meta documents for its own _fbc cookie. */
export const CLICK_ID_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export interface CookieToSet {
  name: string;
  value: string;
  options: {
    domain: string;
    maxAge: number;
    sameSite: 'lax';
    secure: true;
    path: '/';
  };
}

function cookieOptions(): CookieToSet['options'] {
  return {
    domain:   CLICK_ID_COOKIE_DOMAIN,
    maxAge:   CLICK_ID_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure:   true,
    path:     '/',
  };
}

/** Meta's own _fbc format: fb.1.<click-time-ms>.<fbclid>. */
export function buildFbcValue(fbclid: string, clickTimeMs: number): string {
  return `fb.1.${clickTimeMs}.${fbclid}`;
}

/**
 * Cookies to set for this request, given its URL and the current time. Empty
 * when neither fbclid nor ttclid is present — the common case for every
 * request that isn't a fresh ad click, where this must stay a no-op.
 */
export function trackingCookiesToSet(url: URL, nowMs: number): CookieToSet[] {
  const cookies: CookieToSet[] = [];

  const fbclid = url.searchParams.get('fbclid');
  if (fbclid) {
    cookies.push({ name: FBC_COOKIE, value: buildFbcValue(fbclid, nowMs), options: cookieOptions() });
  }

  const ttclid = url.searchParams.get('ttclid');
  if (ttclid) {
    cookies.push({ name: TTCLID_COOKIE, value: ttclid, options: cookieOptions() });
  }

  return cookies;
}

/**
 * Copies every param from `incoming` onto `destination` that isn't already
 * explicitly set there — so an app-level redirect (an unauthenticated visitor
 * bounced from /tracker to /auth, say) never drops fbclid, utm_source, or
 * anything else the visitor arrived with. A key the destination already sets
 * on purpose (e.g. `from=tracker`) is left alone rather than overwritten.
 */
export function forwardQuery(destination: URL, incoming: URLSearchParams): URL {
  incoming.forEach((value, key) => {
    if (!destination.searchParams.has(key)) destination.searchParams.set(key, value);
  });
  return destination;
}
