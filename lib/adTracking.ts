'use client';

/**
 * Ad-channel helpers for the /start funnel.
 *
 * These are thin, funnel-named wrappers over lib/analytics — they exist so call
 * sites read in the language of the funnel ("preview results rendered") rather
 * than the language of the ad platforms ("ViewContent"). All the platform
 * mapping, consent gating and fan-out lives in lib/analytics/index.ts.
 *
 * This file used to call window.ttq and window.gtag directly. It no longer
 * calls any platform SDK: those raw calls were why apply-link clicks reached
 * Meta but never TikTok, and why two of the six events never reached TikTok at
 * all. Add nothing here that talks to a platform directly.
 */

import * as analytics from './analytics';
import { logFunnelEvent } from './research/funnel';
import type { SignupConversion } from './analytics/signupConversion';

export type AdParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  src?: string;
};

const SESSION_KEY = 'tundee_ad_params';

/** Stash captured UTM/src params for the current session (best-effort). */
export function persistAdParams(params: AdParams) {
  if (typeof window === 'undefined') return;
  if (!Object.values(params).some(Boolean)) return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(params));
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — fail silently
  }
}

/**
 * Read back the stashed ad params. Nothing read them before this — they were
 * only ever forwarded on the signup href — so utm_campaign was lost by the time
 * the profile was saved.
 *
 * PREREG §5.4 needs utm_campaign at profile completion to derive
 * recruitment_source, so /profile/setup reads it here.
 *
 * Best-effort by nature: sessionStorage is tab-scoped, so an email magic link
 * opened in a different browser arrives with nothing and resolves to 'organic'.
 */
export function readAdParams(): AdParams {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as AdParams;
  } catch {
    return {};
  }
}

/**
 * Build the signup URL, forwarding any captured ad params as query params.
 *
 * `next` is the post-login destination — pass it so a visitor who matched on
 * /start lands back on their full results instead of a generic dashboard.
 */
export function buildSignupHref(adParams: AdParams, next?: string): string {
  const qs = new URLSearchParams({ from: 'signup' });
  Object.entries(adParams).forEach(([key, value]) => {
    if (value) qs.set(key, value);
  });
  if (next) qs.set('next', next);
  return `/auth?${qs.toString()}`;
}

/** The visitor reached the signup gate. */
export function trackCTAClick(location: string) {
  analytics.lead({ location });
}

/**
 * The signup gate under the /start preview results.
 *
 * Distinct from trackCTAClick because this tap means something the other CTAs do not:
 * the visitor has already seen real matched scholarships and is choosing to unlock the
 * rest. It fires Lead *and* InitiateCheckout — Lead to keep the existing ad-set
 * optimisation intact, InitiateCheckout because that is the funnel step the platforms
 * report on. `matchCount` travels with it so drop-off can be read against how much was
 * actually behind the gate.
 */
export function trackGateCTA(location: string, matchCount: number) {
  analytics.lead({ location });
  analytics.initiateCheckout({ location, numItems: matchCount });
}

/**
 * The visitor submitted the /start match form.
 * Separate from the results render below: Search is the intent, ViewContent is
 * the payoff, and the platforms need both to model the funnel.
 */
export function trackPreviewSearch(input: { educationLevel: string; gpa: number; province: string }) {
  analytics.search(input);
}

/**
 * The visitor reached real matched results before signing up. This is the
 * mid-funnel signal to optimize ad delivery against, ahead of the sparser
 * CompleteRegistration event.
 */
export function trackPreviewResults(matchCount: number, scholarshipIds: string[] = []) {
  analytics.viewContent({ contentIds: scholarshipIds, numItems: matchCount });
}

/**
 * An account was created.
 *
 * One call site: components/SignupConversion.tsx, firing on the marker cookie
 * that app/auth/callback leaves whenever that request created the account. The
 * wizard used to fire this too, which tied the ad platforms' conversion number
 * to finishing onboarding rather than to signing up — so eight real signups
 * between 25 and 30 Aug 2026 reported nothing at all, because not one of them
 * finished the wizard. Onboarding now reports profile_completed instead.
 *
 * Once per account: the cookie is written only on a first sign-in, and deleted
 * as it is read.
 */
export function trackSignupComplete(conversion: SignupConversion) {
  const { method, inWebview, app } = conversion;
  analytics.completeRegistration(method, { inWebview, app });

  // signup_completed rides along here rather than being wired separately at
  // both call sites. The two paths above are already mutually exclusive and
  // already cover every route into an account, so hanging the funnel event off
  // the same call makes it impossible for the two signals to drift apart or
  // for one path to be forgotten.
  //
  // The webview context is logged too, so the conversion rate by browser can be
  // computed from our own tables and not only from the ad platforms' — which
  // report it behind a sampling and attribution model we do not control.
  logFunnelEvent({
    eventType: 'signup_completed',
    context: { method, auth_method: method, in_app_browser: inWebview, in_app_app: app },
  });
}
