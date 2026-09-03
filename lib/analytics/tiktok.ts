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
 * Event names sent to TikTok. Unlike Meta, TikTok's SDK takes any string in
 * ttq.track() — standard and custom names go through the same call, so this
 * union just documents which ones this app actually sends.
 */
export type TikTokEventName =
  | 'Search'
  | 'ViewContent'
  | 'SubmitForm'
  | 'InitiateCheckout'
  | 'CompleteRegistration'
  | 'AddToWishlist'
  | 'ProfileCompleted'
  | 'ApplyClicked';

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

/** Mirrors meta.trackViewContent's two call shapes — see the note there. */
export function trackViewContent(input: {
  contentIds?: string[];
  contentName?: string;
  numItems?: number;
  browser?: BrowserContext;
}): void {
  track('ViewContent', {
    ...(input.contentIds?.length ? { content_type: 'scholarship', content_id: input.contentIds[0] } : {}),
    ...(input.contentName ? { content_name: input.contentName } : {}),
    ...(input.numItems != null ? { quantity: input.numItems } : {}),
    ...browserParams(input.browser),
  });
}

/** Mirrors meta.trackLead — see the note there on why this fires exactly once, here only. */
export function trackLead(input: { value: number; browser?: BrowserContext }): void {
  track('SubmitForm', {
    content_type:     'start_form_completed',
    value:            input.value,
    ...browserParams(input.browser),
  });
}

/** The visitor reached the login/signup screen. */
export function trackInitiateCheckout(input?: { browser?: BrowserContext }): void {
  track('InitiateCheckout', {
    content_type: 'auth_page',
    ...browserParams(input?.browser),
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

/** The visitor tapped save/track on a scholarship. */
export function trackAddToWishlist(input: { scholarshipId: string }): void {
  track('AddToWishlist', { content_type: 'scholarship', content_id: input.scholarshipId });
}

/** The visitor clicked through to a funder's external application form. */
export function trackApplyClicked(input: { scholarshipId: string }): void {
  track('ApplyClicked', { content_id: input.scholarshipId });
}

/** The onboarding wizard was finished — the account is a real, qualified lead. */
export function trackProfileCompleted(input: { gradeLevel: string; province: string }): void {
  track('ProfileCompleted', { grade_level: input.gradeLevel, province: input.province });
}
