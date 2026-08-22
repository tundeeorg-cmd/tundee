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
import { isProductionEnvironment } from './meta';

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
}): void {
  track('Search', {
    content_type:    'scholarship_preview',
    education_level: input.educationLevel,
    gpa_band:        input.gpa_band,
    province:        input.province,
  });
}

export function trackViewContent(input: {
  contentIds: string[];
  contentName?: string;
  numItems?: number;
}): void {
  track('ViewContent', {
    content_type: 'scholarship',
    content_id:   input.contentIds[0],
    ...(input.contentName ? { content_name: input.contentName } : {}),
    ...(input.numItems != null ? { quantity: input.numItems } : {}),
  });
}

/** Pre-account intent — the visitor reached the signup gate. */
export function trackLead(input: { location: string }): void {
  track('SubmitForm', { content_type: 'signup_gate', content_name: input.location });
}

export function trackCompleteRegistration(input: { method: 'google' | 'line' | 'email' }): void {
  track('CompleteRegistration', { content_name: input.method });
}

export function trackSubmitApplication(input: { scholarshipId: string }): void {
  track('SubmitForm', { content_type: 'scholarship', content_id: input.scholarshipId });
}
