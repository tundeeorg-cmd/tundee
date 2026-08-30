/**
 * The single GA4 interface for the app.
 *
 * The base gtag script lives in components/GoogleAnalytics.tsx and is gated on
 * the same cookie consent as the ad pixels. Like the pixel adapters, every
 * gtag call goes through here.
 *
 * GA4's config snippet fires one page_view at init and nothing afterwards, so
 * client-side navigation needs an explicit page_view exactly as the pixels do.
 */

import { hasAnalyticsConsent } from './consent';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function send(name: string, params: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return;
  window.gtag?.('event', name, params);
}

export function trackPageView(): void {
  if (typeof window === 'undefined') return;
  send('page_view', {
    page_path:     window.location.pathname + window.location.search,
    page_location: window.location.href,
  });
}

export function trackSearch(input: {
  educationLevel: string;
  gpa_band: string;
  province: string;
}): void {
  send('search', {
    search_term:     'scholarship_match',
    education_level: input.educationLevel,
    gpa_band:        input.gpa_band,
    province:        input.province,
  });
}

export function trackViewContent(input: { contentIds: string[]; numItems?: number }): void {
  send('view_search_results', {
    search_term: 'scholarship_preview',
    ...(input.numItems != null ? { num_items: input.numItems } : {}),
    ...(input.contentIds.length ? { item_id: input.contentIds[0] } : {}),
  });
}

export function trackLead(input: {
  location: string;
  browser?: { inWebview: boolean; app: string | null };
}): void {
  send('generate_lead', {
    link_id: input.location,
    ...(input.browser
      ? { in_app_browser: input.browser.inWebview, in_app_app: input.browser.app ?? 'none' }
      : {}),
  });
}

/** GA4's nearest equivalent of the gate tap. */
export function trackInitiateCheckout(input: { location: string; numItems?: number }): void {
  send('begin_checkout', {
    link_id: input.location,
    ...(input.numItems !== undefined ? { num_items: input.numItems } : {}),
  });
}

export function trackCompleteRegistration(input: {
  method: string;
  browser?: { inWebview: boolean; app: string | null };
}): void {
  send('sign_up', {
    method:      input.method,
    auth_method: input.method,
    ...(input.browser
      ? { in_app_browser: input.browser.inWebview, in_app_app: input.browser.app ?? 'none' }
      : {}),
  });
}

export function trackSubmitApplication(input: { scholarshipId: string }): void {
  send('submit_application', { item_id: input.scholarshipId });
}
