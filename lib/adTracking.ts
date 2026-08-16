'use client';

// Ad-channel tracking for the /start funnel.
//
// Meta events are delegated to lib/analytics/meta.ts — the one place that calls
// fbq — so consent gating, event ids and CAPI de-duplication apply everywhere.
// TikTok and GA calls stay here and are gated on the same consent state.

import { hasAnalyticsConsent } from './analytics/consent';
import {
  trackLead,
  trackViewContent,
  trackSearch,
  trackCompleteRegistration,
} from './analytics/meta';

export type AdParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  src?: string;
};

const SESSION_KEY = 'tundee_ad_params';

declare global {
  interface Window {
    ttq?: { track: (...args: unknown[]) => void };
    gtag?: (...args: unknown[]) => void;
  }
}

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

/** Fire the CTA-click conversion event on every configured channel. */
export function trackCTAClick(location: string) {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
  trackLead({ location });
  window.ttq?.track('ClickButton', { content_name: location });
  window.gtag?.('event', 'generate_lead', { link_id: location });
}

/**
 * Fire the search event when a visitor submits the /start match form.
 * Separate from the results render below: Search is the intent, ViewContent is
 * the payoff, and Meta needs both to model the funnel.
 */
export function trackPreviewSearch(input: { educationLevel: string; gpa: number; province: string }) {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
  trackSearch(input);
  window.ttq?.track('Search', { content_type: 'scholarship_preview' });
  window.gtag?.('event', 'search', { search_term: 'scholarship_match' });
}

/**
 * Fire the "visitor reached real matched results before signing up" event.
 * This is the mid-funnel signal to optimize ad delivery against, ahead of the
 * sparser CompleteRegistration event.
 */
export function trackPreviewResults(matchCount: number, scholarshipIds: string[] = []) {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
  trackViewContent({ contentIds: scholarshipIds, numItems: matchCount });
  window.ttq?.track('ViewContent', { content_type: 'scholarship_preview', quantity: matchCount });
  window.gtag?.('event', 'view_search_results', { search_term: 'scholarship_preview', num_items: matchCount });
}

/** Fire the signup-complete conversion event once a profile is actually saved. */
export function trackSignupComplete(method: 'google' | 'line' | 'email' = 'email') {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
  trackCompleteRegistration({ method });
  window.ttq?.track('CompleteRegistration');
  window.gtag?.('event', 'sign_up', { method });
}
