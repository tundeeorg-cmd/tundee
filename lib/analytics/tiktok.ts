/**
 * The single TikTok Pixel interface for the app.
 *
 * Mirrors lib/analytics/meta.ts: every ttq call goes through here, so consent
 * gating can't be bypassed by a call site. The base script lives in
 * components/AdPixels.tsx and stays dormant until NEXT_PUBLIC_TIKTOK_PIXEL_ID
 * is set — so every function here is a no-op until the pixel exists, by design.
 *
 * Do not call window.ttq directly anywhere else.
 */

import { hasAnalyticsConsent } from './consent';
import { isProductionEnvironment, browserParams, type BrowserContext, type SignupMethod } from './meta';

declare global {
  interface Window {
    ttq?: {
      page: (...args: unknown[]) => void;
      track: (event: string, params?: Record<string, unknown>) => void;
      identify?: (...args: unknown[]) => void;
      instance?: (...args: unknown[]) => void;
    };
    TiktokAnalyticsObject?: string;
  }
}

/**
 * TikTok's standard event names. Its vocabulary is smaller than Meta's, so two
 * distinct logical events (reaching the signup gate, clicking an apply link)
 * both map to SubmitForm — they stay distinguishable by their params.
 */
export type TikTokEventName =
  | 'Search'
  | 'ViewContent'
  | 'SubmitForm'
  | 'InitiateCheckout'
  | 'CompleteRegistration';

export function getTikTokPixelId(): string | undefined {
  return process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || undefined;
}

/** Whether the base pixel script should load at all. */
export function isTikTokPixelEnabled(): boolean {
  return Boolean(getTikTokPixelId()) && isProductionEnvironment() && hasAnalyticsConsent();
}

function track(name: TikTokEventName, params: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return;
  window.ttq?.track(name, params);
}

// ─── Public event API ─────────────────────────────────────────────────────────

/**
 * TikTok's Pageview is `ttq.page()`, not `ttq.track('Pageview')` — the queue
 * exposes it as its own method and the events endpoint expects it that way.
 */
export function trackPageView(): void {
  if (typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return;
  window.ttq?.page();
}

export function trackSearch(input: {
  educationLevel: string;
  gpa_band: string;
  province: string;
  browser?: BrowserContext;
}): void {
  track('Search', {
    content_type:    'scholarship_preview',
    education_level: input.educationLevel,
    gpa_band:        input.gpa_band,
    province:        input.province,
    ...browserParams(input.browser),
  });
}

export function trackViewContent(input: {
  contentIds: string[];
  contentName?: string;
  numItems?: number;
  browser?: BrowserContext;
}): void {
  track('ViewContent', {
    content_type: 'scholarship',
    content_id:   input.contentIds[0],
    ...(input.contentName ? { content_name: input.contentName } : {}),
    ...(input.numItems != null ? { quantity: input.numItems } : {}),
    ...browserParams(input.browser),
  });
}

/** Pre-account intent — the visitor reached the signup gate. */
export function trackLead(input: { location: string; browser?: BrowserContext }): void {
  track('SubmitForm', {
    content_type: 'signup_gate',
    content_name: input.location,
    ...browserParams(input.browser),
  });
}

/** Gate CTA. Mirrors meta.trackInitiateCheckout — see the note there on why both fire. */
export function trackInitiateCheckout(input: {
  location: string;
  numItems?: number;
  browser?: BrowserContext;
}): void {
  track('InitiateCheckout', {
    content_type: 'product',
    description:  input.location,
    ...(input.numItems !== undefined ? { quantity: input.numItems } : {}),
    ...browserParams(input.browser),
  });
}

export function trackCompleteRegistration(input: {
  method: SignupMethod;
  browser?: BrowserContext;
}): void {
  track('CompleteRegistration', {
    content_name: input.method,
    auth_method:  input.method,
    ...browserParams(input.browser),
  });
}

export function trackSubmitApplication(input: { scholarshipId: string }): void {
  track('SubmitForm', { content_type: 'scholarship', content_id: input.scholarshipId });
}
