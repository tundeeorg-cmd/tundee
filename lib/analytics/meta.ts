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
  | 'InitiateCheckout'
  | 'CompleteRegistration'
  | 'SubmitApplication';

/** How an account was created. 'email' is the retired magic-link flow. */
export type SignupMethod = 'google' | 'line' | 'password' | 'email';

/**
 * Which browser the event happened in.
 *
 * Attached to every funnel event, not just the conversion, because the question
 * it answers is a RATIO: what share of webview visitors who reach the gate go on
 * to create an account, versus real-browser visitors. Tagging only the
 * conversion would give a numerator with no denominator.
 */
export interface BrowserContext {
  inWebview: boolean;
  app: string | null;
}

/** Flattened onto every event's params under stable, greppable names. */
export function browserParams(ctx?: BrowserContext): Record<string, unknown> {
  if (!ctx) return {};
  return {
    in_app_browser: ctx.inWebview,
    in_app_app:     ctx.app ?? 'none',
  };
}

/**
 * Events mirrored to the Conversions API. PageView/Search/ViewContent are
 * high-volume and low-value server-side; the three conversions are what ad
 * delivery optimizes against and what browser blockers most often drop.
 */
const CAPI_EVENTS: ReadonlySet<MetaEventName> = new Set<MetaEventName>([
  'InitiateCheckout',
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
 * Second pixel, owned by the ad agency. Fires alongside the primary one rather
 * than replacing it: fbq('init') is called once per pixel and every later
 * fbq('track', ...) is delivered to all initialised pixels, so the agency sees
 * the same events without any extra call sites.
 *
 * Independently optional — unset means only the primary pixel loads.
 */
export function getAgencyPixelId(): string | undefined {
  return process.env.NEXT_PUBLIC_FB_PIXEL_ID_AGENCY || undefined;
}

/**
 * Every configured pixel, primary first, de-duplicated.
 *
 * The de-dup matters: initialising the same id twice makes Meta count every
 * event on that dataset twice, and setting both env vars to the same value is
 * an easy mistake to make while an agency is being onboarded.
 */
export function getMetaPixelIds(): string[] {
  const ids = [getMetaPixelId(), getAgencyPixelId()].filter(
    (id): id is string => Boolean(id && id.trim()),
  );
  return Array.from(new Set(ids.map(id => id.trim())));
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

/** Whether the base pixel script should load at all — true if ANY pixel is configured. */
export function isPixelEnabled(): boolean {
  return getMetaPixelIds().length > 0 && isProductionEnvironment() && hasAnalyticsConsent();
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

/** Which method created the account, for the CompleteRegistration param. */
export function signupMethodFrom(
  appMetadataProvider?: string | null,
  userMetadataProvider?: string | null,
): SignupMethod {
  // The LINE bridge (app/api/auth/line/callback) marks its users in
  // user_metadata; Supabase itself reports them as email-provider accounts.
  // The password route marks its own the same way, for the same reason.
  if (userMetadataProvider === 'line') return 'line';
  if (appMetadataProvider === 'google') return 'google';
  if (userMetadataProvider === 'password') return 'password';
  // Email one-time code — the passwordless path, and now the default way an
  // email account is created. Also covers the older magic-link accounts, which
  // still exist and still sign in.
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
  browser?: BrowserContext;
}): void {
  send('Search', {
    search_string:   'scholarship_match',
    content_category: 'scholarship_preview',
    education_level: input.educationLevel,
    gpa_band:        gpaBand(input.gpa),
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
  send('ViewContent', {
    content_type: 'scholarship',
    content_ids:  input.contentIds,
    ...(input.contentName ? { content_name: input.contentName } : {}),
    ...(input.numItems != null ? { num_items: input.numItems } : {}),
    ...browserParams(input.browser),
  });
}

/** Pre-account intent — the visitor reached the signup gate. */
export function trackLead(input: { location: string; browser?: BrowserContext }): void {
  send('Lead', {
    content_category: 'signup_gate',
    content_name:     input.location,
    ...browserParams(input.browser),
  });
}

/**
 * The visitor tapped the signup gate under their preview results.
 *
 * Fired alongside Lead rather than instead of it. Lead is what the existing ad sets
 * have been optimising against since launch, and swapping the event would reset that
 * learning; InitiateCheckout adds the funnel step Meta reports on separately. The two
 * carry different eventIDs, so CAPI dedup treats them as the distinct events they are.
 */
export function trackInitiateCheckout(input: {
  location: string;
  numItems?: number;
  browser?: BrowserContext;
}): void {
  send('InitiateCheckout', {
    content_category: 'signup_gate',
    content_name:     input.location,
    ...(input.numItems !== undefined ? { num_items: input.numItems } : {}),
    ...browserParams(input.browser),
  });
}

/**
 * `method` and `auth_method` carry the same value. `method` is the name the
 * existing ad-set rules and saved reports already reference; `auth_method` is
 * the unambiguous one to build new breakdowns on. Dropping `method` would break
 * reports that are live right now.
 */
export function trackCompleteRegistration(input: {
  method: SignupMethod;
  browser?: BrowserContext;
}): void {
  send('CompleteRegistration', {
    method:      input.method,
    auth_method: input.method,
    status:      true,
    ...browserParams(input.browser),
  });
}

export function trackSubmitApplication(input: { scholarshipId: string }): void {
  send('SubmitApplication', {
    content_type: 'scholarship',
    content_ids:  [input.scholarshipId],
  });
}
