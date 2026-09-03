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

export function trackViewContent(input: { contentIds?: string[]; contentName?: string; numItems?: number }): void {
  send('view_search_results', {
    search_term: 'scholarship_preview',
    ...(input.numItems != null ? { num_items: input.numItems } : {}),
    ...(input.contentIds?.length ? { item_id: input.contentIds[0] } : {}),
    ...(input.contentName ? { content_name: input.contentName } : {}),
  });
}

/** Mirrors meta.trackLead — fires exactly once, when results are seen. */
export function trackLead(input: {
  value: number;
  browser?: { inWebview: boolean; app: string | null };
}): void {
  send('generate_lead', {
    content_category: 'start_form_completed',
    value:            input.value,
    ...(input.browser
      ? { in_app_browser: input.browser.inWebview, in_app_app: input.browser.app ?? 'none' }
      : {}),
  });
}

/** The visitor reached the login/signup screen. */
export function trackInitiateCheckout(): void {
  send('begin_checkout', { content_name: 'auth_page' });
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

/** The visitor tapped save/track on a scholarship. */
export function trackAddToWishlist(input: { scholarshipId: string }): void {
  send('add_to_wishlist', { item_id: input.scholarshipId });
}

/** The visitor clicked through to a funder's external application form. */
export function trackApplyClicked(input: { scholarshipId: string }): void {
  send('apply_clicked', { item_id: input.scholarshipId });
}

/** The onboarding wizard was finished — the account is a real, qualified lead. */
export function trackProfileCompleted(input: { gradeLevel: string; province: string }): void {
  send('profile_completed', { grade_level: input.gradeLevel, province: input.province });
}
