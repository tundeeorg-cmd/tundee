/**
 * Handoff for the CompleteRegistration conversion.
 *
 * app/auth/callback and app/api/auth/password are server routes: when either
 * decides a visitor has supplied enough on /start to skip the setup wizard, it
 * writes the profile itself and redirects straight to the results. No wizard
 * means the wizard's pixel call never runs — so before this existed, every
 * signup arriving from a paid /start click was invisible to Meta, TikTok and
 * GA. That is the exact audience the ad spend optimizes against.
 *
 * A server route cannot call a browser pixel, so it leaves this cookie instead
 * and components/SignupConversion.tsx fires the event on arrival and deletes
 * it. Deleting is what makes it fire exactly once — a refresh finds no cookie.
 *
 * Deliberately NOT httpOnly: the client has to read it. It carries no secret,
 * only which provider was used and whether the browser was an embedded webview,
 * and it is short-lived.
 */

import type { InAppBrowserApp } from '@/lib/browser/inAppBrowser';

export const SIGNUP_CONVERSION_COOKIE = 'tundee_signup_conversion';

/** Long enough to survive the redirect and a slow first paint, short enough not to linger. */
export const SIGNUP_CONVERSION_MAX_AGE_SECONDS = 300;

/**
 * How the account was created.
 *
 * 'password' is the flow that replaced the magic link. 'email' is retained
 * because accounts created before that change report themselves that way and
 * a cookie written by the previous deploy may still be in flight — dropping it
 * would turn a real conversion into a silent no-op for up to five minutes.
 */
export type SignupConversionMethod = 'google' | 'line' | 'password' | 'email';

/** Everything the browser needs to attribute the conversion. */
export interface SignupConversion {
  method: SignupConversionMethod;
  /** Was the account created inside an embedded webview? */
  inWebview: boolean;
  /** Which host app, when one was identified. */
  app: InAppBrowserApp | null;
}

export function isSignupConversionMethod(v: unknown): v is SignupConversionMethod {
  return v === 'google' || v === 'line' || v === 'password' || v === 'email';
}

/**
 * Serialise as `method|webview|app` — e.g. `password|1|facebook`.
 *
 * A delimited string rather than JSON: this is a cookie value, and JSON means
 * quotes, braces and percent-encoding for three fields that are all short
 * enumerated tokens.
 */
export function encodeSignupConversion(c: SignupConversion): string {
  return `${c.method}|${c.inWebview ? '1' : '0'}|${c.app ?? ''}`;
}

/**
 * Reads the marker from a raw document.cookie string. Returns null when absent
 * or junk.
 *
 * Accepts the bare `method` form the previous version wrote, so a cookie set by
 * the old deploy still converts — it simply reports no webview context.
 */
export function readSignupConversion(cookieString: string): SignupConversion | null {
  const match = cookieString
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${SIGNUP_CONVERSION_COOKIE}=`));

  if (!match) return null;
  const raw = decodeURIComponent(match.slice(SIGNUP_CONVERSION_COOKIE.length + 1));
  const [method, webview, app] = raw.split('|');

  if (!isSignupConversionMethod(method)) return null;
  return {
    method,
    inWebview: webview === '1',
    app:       app ? (app as InAppBrowserApp) : null,
  };
}

/** The document.cookie assignment that expires the marker. */
export function expireSignupConversionCookie(): string {
  return `${SIGNUP_CONVERSION_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
}

/**
 * Is this callback the one that created the account?
 *
 * CompleteRegistration means "an account now exists", so it must fire once per
 * account, at the moment of creation — not when a profile is finished. Chaining
 * it to profile completion is what made the number meaningless: between 25 and
 * 30 Aug 2026, eight accounts were created and not one profile was completed, so
 * the ad platforms saw no conversions from real signups.
 *
 * Supabase stamps last_sign_in_at on every sign-in, so on the very first one it
 * sits within a second or two of created_at, and on every later one it does not.
 * That makes it a self-cleaning signal: no column to add, and no risk of an old
 * account re-reporting itself years later.
 *
 * The window trades two unequal errors. Too wide re-fires only if someone signs
 * in a second time within the window of creating the account; too narrow drops
 * real signups on a slow round-trip. A minute is far outside normal latency and
 * well inside "clicked the link twice", so it errs toward not duplicating.
 */
export const FIRST_SIGN_IN_WINDOW_MS = 60_000;

export function isFirstSignIn(
  createdAt: string | null | undefined,
  lastSignInAt: string | null | undefined,
  windowMs: number = FIRST_SIGN_IN_WINDOW_MS,
): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;

  // No last_sign_in_at means this is the first: nothing has stamped it yet.
  if (!lastSignInAt) return true;
  const signedIn = Date.parse(lastSignInAt);
  if (Number.isNaN(signedIn)) return true;

  return Math.abs(signedIn - created) < windowMs;
}
