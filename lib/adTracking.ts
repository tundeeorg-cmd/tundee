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
 * A signup actually completed.
 *
 * Fired from two places, which between them cover every route into an account:
 *   • components/SignupConversion.tsx — when the auth callback wrote the
 *     profile itself and skipped the wizard (the /start → signup path)
 *   • app/profile/setup — when the visitor completed the wizard
 * They are mutually exclusive by construction, so there is no double-count.
 */
export function trackSignupComplete(method: 'google' | 'line' | 'email' = 'email') {
  analytics.completeRegistration(method);
}
