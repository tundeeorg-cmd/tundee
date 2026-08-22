/**
 * Handoff for the CompleteRegistration conversion.
 *
 * app/auth/callback is a server route: when it decides a visitor has supplied
 * enough on /start to skip the setup wizard, it writes the profile itself and
 * redirects straight to the results. No wizard means the wizard's pixel call
 * never runs — so before this existed, every signup arriving from a paid /start
 * click was invisible to Meta, TikTok and GA. That is the exact audience the ad
 * spend optimizes against.
 *
 * A server route cannot call a browser pixel, so it leaves this cookie instead
 * and components/SignupConversion.tsx fires the event on arrival and deletes
 * it. Deleting is what makes it fire exactly once — a refresh finds no cookie.
 *
 * Deliberately NOT httpOnly: the client has to read it. It carries no secret,
 * only which provider was used, and it is short-lived.
 */

export const SIGNUP_CONVERSION_COOKIE = 'tundee_signup_conversion';

/** Long enough to survive the redirect and a slow first paint, short enough not to linger. */
export const SIGNUP_CONVERSION_MAX_AGE_SECONDS = 300;

export type SignupConversionMethod = 'google' | 'line' | 'email';

export function isSignupConversionMethod(v: unknown): v is SignupConversionMethod {
  return v === 'google' || v === 'line' || v === 'email';
}

/** Reads the marker from a raw document.cookie string. Returns null when absent or junk. */
export function readSignupConversion(cookieString: string): SignupConversionMethod | null {
  const match = cookieString
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${SIGNUP_CONVERSION_COOKIE}=`));

  if (!match) return null;
  const value = decodeURIComponent(match.slice(SIGNUP_CONVERSION_COOKIE.length + 1));
  return isSignupConversionMethod(value) ? value : null;
}

/** The document.cookie assignment that expires the marker. */
export function expireSignupConversionCookie(): string {
  return `${SIGNUP_CONVERSION_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
}
