/**
 * The one analytics surface for the whole app.
 *
 * Each function fires ONE logical event to every configured platform, mapped to
 * that platform's nearest standard (or, where none exists, custom) event, at
 * exactly the touchpoint named on the left — the attribution fix this module
 * is part of moved lead() and initiateCheckout() to new touchpoints, so the
 * old call sites (the /start CTA click) no longer fire either:
 *
 *   pageView()               fbq PageView             ttq page()              ga page_view
 *   search()                 fbq Search               ttq Search              ga search
 *   viewContent(start_page)  fbq ViewContent          ttq ViewContent         ga view_search_results     — arriving at /start
 *   viewContent(scholarship) fbq ViewContent          ttq ViewContent         ga view_search_results     — opening a scholarship
 *   lead()                   fbq Lead                 ttq SubmitForm          ga generate_lead           — 3-question form answered, results seen (once/session)
 *   initiateCheckout()       fbq InitiateCheckout     ttq InitiateCheckout    ga begin_checkout          — arriving at /auth
 *   completeRegistration()   fbq CompleteRegistration ttq CompleteRegistration ga sign_up
 *   profileCompleted()       fbq trackCustom ProfileCompleted ttq ProfileCompleted ga profile_completed  — onboarding wizard finished
 *   addToWishlist()          fbq AddToWishlist        ttq AddToWishlist       ga add_to_wishlist         — save/track tapped
 *   applyClicked()           fbq trackCustom ApplyClicked ttq ApplyClicked    ga apply_clicked           — funder link clicked
 *
 * Import from '@/lib/analytics' — never from './meta', './tiktok' or './ga'
 * directly, and never call window.fbq / window.ttq / window.gtag anywhere. A
 * call site that reaches for one platform is how an event silently stops
 * reaching the others, which is exactly the bug this module exists to prevent.
 *
 * Every platform is independently dormant: Meta needs NEXT_PUBLIC_FB_PIXEL_ID,
 * TikTok needs NEXT_PUBLIC_TIKTOK_PIXEL_ID, GA needs NEXT_PUBLIC_GA_ID. An
 * unset ID means that platform's base script never loads, so its calls here are
 * harmless no-ops.
 */

import * as meta from './meta';
import * as tiktok from './tiktok';
import * as ga from './ga';
import { hasAnalyticsConsent } from './consent';
import { detectInAppBrowser } from '@/lib/browser/inAppBrowser';

export { gpaBand, signupMethodFrom } from './meta';
export type { BrowserContext } from './meta';
export type SignupMethod = 'google' | 'line' | 'password' | 'email_otp';

/**
 * Which browser this event is happening in, resolved once per call.
 *
 * Every funnel event carries it. The question the ad data has to answer is a
 * ratio — of the visitors who reach the signup gate inside a Facebook webview,
 * what share create an account, versus visitors in a real browser — and a flag
 * on the conversion alone gives a numerator with no denominator.
 *
 * Computed here rather than passed in by call sites: it is a property of the
 * environment, not of the event, and a call site that forgets it is how a
 * breakdown silently goes half-empty.
 */
function browserContext(): meta.BrowserContext {
  const iab = detectInAppBrowser();
  return { inWebview: iab.isInApp, app: iab.app };
}

/**
 * One consent check for the whole fan-out. The adapters re-check individually —
 * defence in depth, since they're also reachable from tests.
 */
function allowed(): boolean {
  return typeof window !== 'undefined' && hasAnalyticsConsent();
}

/** Fired on first load by each base script, and on every client-side route change. */
export function pageView(): void {
  if (!allowed()) return;
  meta.trackPageView();
  tiktok.trackPageView();
  ga.trackPageView();
}

/** The visitor submitted the /start match form. Intent, not payoff. */
export function search(input: {
  educationLevel: string;
  gpa: number;
  province: string;
}): void {
  if (!allowed()) return;
  // Bucket the GPA once, here, so no platform ever receives a precise academic
  // record — see gpaBand in ./meta.
  const band = meta.gpaBand(input.gpa);
  const browser = browserContext();

  meta.trackSearch({ ...input, browser });
  tiktok.trackSearch({ educationLevel: input.educationLevel, gpa_band: band, province: input.province, browser });
  ga.trackSearch({ educationLevel: input.educationLevel, gpa_band: band, province: input.province });
}

/**
 * Arriving at /start ('start_page'), matched results rendered, or a
 * scholarship detail page opened — content_ids is present only for the last
 * two, see the note on meta.trackViewContent.
 */
export function viewContent(input: {
  contentIds?: string[];
  contentName?: string;
  numItems?: number;
}): void {
  if (!allowed()) return;
  const browser = browserContext();
  meta.trackViewContent({ ...input, browser });
  tiktok.trackViewContent({ ...input, browser });
  ga.trackViewContent(input);
}

/**
 * The visitor answered the 3-question form and saw real matched scholarships.
 * This is the event ad delivery optimizes against — call it exactly once per
 * session (lib/adTracking.ts's trackFormResultsSeen guards this) and from
 * nowhere else. `value` is the match count, for lead-value reporting.
 */
export function lead(input: { value: number }): void {
  if (!allowed()) return;
  const browser = browserContext();
  meta.trackLead({ ...input, browser });
  tiktok.trackLead({ ...input, browser });
  ga.trackLead({ ...input, browser });
}

/** The visitor reached the login/signup screen. */
export function initiateCheckout(): void {
  if (!allowed()) return;
  const browser = browserContext();
  meta.trackInitiateCheckout({ browser });
  tiktok.trackInitiateCheckout({ browser });
  ga.trackInitiateCheckout();
}

/**
 * A real, completed signup. Never fire this optimistically.
 *
 * `browser` is passed in rather than sniffed here, because the account may have
 * been created in a DIFFERENT browser from the one now firing the pixel — a
 * visitor who escaped a webview into Chrome converts in Chrome, and recording
 * "not a webview" would hide the very path this change exists to measure. The
 * server route that created the account records the browser it saw and hands it
 * back through the conversion cookie.
 */
export function completeRegistration(method: SignupMethod, browser?: meta.BrowserContext): void {
  if (!allowed()) return;
  const ctx = browser ?? browserContext();
  meta.trackCompleteRegistration({ method, browser: ctx });
  tiktok.trackCompleteRegistration({ method, browser: ctx });
  ga.trackCompleteRegistration({ method, browser: ctx });
}

/** The visitor tapped save/track on a scholarship. */
export function addToWishlist(input: { scholarshipId: string }): void {
  if (!allowed()) return;
  meta.trackAddToWishlist(input);
  tiktok.trackAddToWishlist(input);
  ga.trackAddToWishlist(input);
}

/** The visitor clicked through to a funder's external application form. */
export function applyClicked(input: { scholarshipId: string }): void {
  if (!allowed()) return;
  meta.trackApplyClicked(input);
  tiktok.trackApplyClicked(input);
  ga.trackApplyClicked(input);
}

/** The onboarding wizard was finished — the account is a real, qualified lead. */
export function profileCompleted(input: { gradeLevel: string; province: string }): void {
  if (!allowed()) return;
  meta.trackProfileCompleted(input);
  tiktok.trackProfileCompleted(input);
  ga.trackProfileCompleted(input);
}
