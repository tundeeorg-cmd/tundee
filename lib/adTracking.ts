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

/** Build the signup URL, forwarding any captured ad params as query params. */
export function buildSignupHref(adParams: AdParams): string {
  const qs = new URLSearchParams({ from: 'signup' });
  Object.entries(adParams).forEach(([key, value]) => {
    if (value) qs.set(key, value);
  });
  return `/auth?${qs.toString()}`;
}

/** Fire the CTA-click conversion event on every configured channel. */
export function trackCTAClick(location: string) {
  if (typeof window === 'undefined') return;
  window.fbq?.('track', 'Lead');
  window.ttq?.track('ClickButton', { content_name: location });
  window.gtag?.('event', 'generate_lead', { link_id: location });
}

/** Fire the signup-complete conversion event once a profile is actually saved. */
export function trackSignupComplete() {
  if (typeof window === 'undefined') return;
  window.fbq?.('track', 'CompleteRegistration');
  window.ttq?.track('CompleteRegistration');
  window.gtag?.('event', 'sign_up');
}
