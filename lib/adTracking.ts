'use client';

// Small tracking helper for the /start ad-landing page. Pixel IDs are read
// from env vars; any missing ID makes the corresponding call a silent no-op
// so this never throws when a channel's pixel isn't configured yet.

export type AdParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  src?: string;
};

const SESSION_KEY = 'tundee_ad_params';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
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
  if (typeof window === 'undefined') return;
  window.fbq?.('track', 'Lead');
  window.ttq?.track('ClickButton', { content_name: location });
  window.gtag?.('event', 'generate_lead', { link_id: location });
}

/**
 * Fire the "visitor reached real matched results before signing up" event.
 * This is the mid-funnel signal to optimize ad delivery against, ahead of the
 * sparser CompleteRegistration event.
 */
export function trackPreviewResults(matchCount: number) {
  if (typeof window === 'undefined') return;
  window.fbq?.('track', 'Search', { content_category: 'scholarship_preview', num_items: matchCount });
  window.fbq?.('track', 'ViewContent', { content_category: 'scholarship_preview', num_items: matchCount });
  window.ttq?.track('Search', { content_type: 'scholarship_preview', quantity: matchCount });
  window.gtag?.('event', 'view_search_results', { search_term: 'scholarship_preview', num_items: matchCount });
}

/** Fire the signup-complete conversion event once a profile is actually saved. */
export function trackSignupComplete() {
  if (typeof window === 'undefined') return;
  window.fbq?.('track', 'CompleteRegistration');
  window.ttq?.track('CompleteRegistration');
  window.gtag?.('event', 'sign_up');
}
