/**
 * The single Meta Pixel interface for the app.
 *
 * Every fbq call goes through here — no raw fbq() anywhere else — so consent
 * gating, event-id generation and Conversions API de-duplication can't be
 * bypassed by a call site.
 *
 * Each conversion event mints one event_id, passes it to the browser pixel as
 * `eventID`, and sends the same id to /api/meta/capi. When the CAPI token is
 * absent that endpoint is a silent no-op, so the browser pixel works today and
 * CAPI switches on later with no code change.
 */

import { hasAnalyticsConsent } from './consent';

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
    _fbq?: unknown;
  }
}

/** The six events this app sends. Anything else is a mistake, not a feature. */
export type MetaEventName =
  | 'PageView'
  | 'Search'
  | 'ViewContent'
  | 'Lead'
  | 'CompleteRegistration'
  | 'SubmitApplication';

/**
 * Events mirrored to the Conversions API. PageView/Search/ViewContent are
 * high-volume and low-value server-side; the three conversions are what ad
 * delivery optimizes against and what browser blockers most often drop.
 */
const CAPI_EVENTS: ReadonlySet<MetaEventName> = new Set<MetaEventName>([
  'Lead',
  'CompleteRegistration',
  'SubmitApplication',
]);

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Pixel ID. NEXT_PUBLIC_FB_PIXEL_ID is canonical; NEXT_PUBLIC_META_PIXEL_ID is
 * the name the codebase used before and is kept as a fallback so setting either
 * one works. No hardcoded default — an unset ID means no pixel, which is what
 * keeps preview deployments out of the dataset.
 *
 * Read from process.env directly rather than a variable: Next.js inlines
 * NEXT_PUBLIC_* at build time only for statically analysable references.
 */
export function getMetaPixelId(): string | undefined {
  return process.env.NEXT_PUBLIC_FB_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || undefined;
}

/**
 * True only in the real production deployment.
 *
 * NODE_ENV alone is not enough: Vercel builds preview deployments with
 * NODE_ENV=production, so every PR preview would report into the live dataset.
 * NEXT_PUBLIC_VERCEL_ENV distinguishes production from preview and is injected
 * automatically. NEXT_PUBLIC_META_PIXEL_DEBUG=1 forces it on for local QA
 * against Meta's Test Events tool.
 */
export function isProductionEnvironment(): boolean {
  if (process.env.NEXT_PUBLIC_META_PIXEL_DEBUG === '1') return true;

  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  if (vercelEnv) return vercelEnv === 'production';

  return process.env.NODE_ENV === 'production';
}

/** Whether the base pixel script should load at all. */
export function isPixelEnabled(): boolean {
  return Boolean(getMetaPixelId()) && isProductionEnvironment() && hasAnalyticsConsent();
}

// ─── Event ids ────────────────────────────────────────────────────────────────

/** One id per event occurrence, shared by the browser pixel and CAPI. */
function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

type EventParams = Record<string, unknown>;

function send(name: MetaEventName, params: EventParams = {}): void {
  if (typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return;

  const eventId = newEventId();

  window.fbq?.('track', name, params, { eventID: eventId });

  if (CAPI_EVENTS.has(name)) {
    void sendToCapi(name, eventId, params);
  }
}

/**
 * Mirrors a conversion to our server, which forwards it to Meta when a token is
 * configured. Fire-and-forget: analytics must never surface an error to a
 * student, and `keepalive` lets it survive the navigation an apply-click starts.
 *
 * No personal data crosses this boundary — the route reads the session itself
 * server-side and hashes the email there, so raw PII never travels through
 * client code.
 */
async function sendToCapi(eventName: MetaEventName, eventId: string, params: EventParams): Promise<void> {
  try {
    await fetch('/api/meta/capi', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify({
        eventName,
        eventId,
        eventSourceUrl: window.location.href,
        customData:     params,
      }),
      keepalive: true,
    });
  } catch {
    // Network failure, blocker, offline — nothing to do and nothing to report.
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Buckets a GPA before it leaves the browser. Meta gets the signal it needs for
 * audience building without us handing a precise academic record to an ad
 * platform.
 */
export function gpaBand(gpa: number): string {
  if (!Number.isFinite(gpa)) return 'unknown';
  if (gpa < 2.0) return 'below_2.00';
  if (gpa < 2.5) return '2.00_2.49';
  if (gpa < 3.0) return '2.50_2.99';
  if (gpa < 3.5) return '3.00_3.49';
  return '3.50_4.00';
}

/** Which one-tap method created the account, for the CompleteRegistration param. */
export function signupMethodFrom(
  appMetadataProvider?: string | null,
  userMetadataProvider?: string | null,
): 'google' | 'line' | 'email' {
  // The LINE bridge (app/api/auth/line/callback) marks its users in
  // user_metadata; Supabase itself reports them as email-provider accounts.
  if (userMetadataProvider === 'line') return 'line';
  if (appMetadataProvider === 'google') return 'google';
  return 'email';
}

// ─── Public event API ─────────────────────────────────────────────────────────

export function trackPageView(): void {
  send('PageView');
}

export function trackSearch(input: {
  educationLevel: string;
  gpa: number;
  province: string;
}): void {
  send('Search', {
    search_string:   'scholarship_match',
    content_category: 'scholarship_preview',
    education_level: input.educationLevel,
    gpa_band:        gpaBand(input.gpa),
    province:        input.province,
  });
}

export function trackViewContent(input: {
  contentIds: string[];
  contentName?: string;
  numItems?: number;
}): void {
  send('ViewContent', {
    content_type: 'scholarship',
    content_ids:  input.contentIds,
    ...(input.contentName ? { content_name: input.contentName } : {}),
    ...(input.numItems != null ? { num_items: input.numItems } : {}),
  });
}

/** Pre-account intent — the visitor reached the signup gate. */
export function trackLead(input: { location: string }): void {
  send('Lead', { content_category: 'signup_gate', content_name: input.location });
}

export function trackCompleteRegistration(input: { method: 'google' | 'line' | 'email' }): void {
  send('CompleteRegistration', { method: input.method, status: true });
}

export function trackSubmitApplication(input: { scholarshipId: string }): void {
  send('SubmitApplication', {
    content_type: 'scholarship',
    content_ids:  [input.scholarshipId],
  });
}
