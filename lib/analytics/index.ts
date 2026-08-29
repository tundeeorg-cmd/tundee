/**
 * The one analytics surface for the whole app.
 *
 * Each function fires ONE logical event to every configured platform, mapped to
 * that platform's nearest standard event:
 *
 *   pageView()               fbq PageView             ttq page()              ga page_view
 *   search()                 fbq Search               ttq Search              ga search
 *   viewContent()            fbq ViewContent          ttq ViewContent         ga view_search_results
 *   lead()                   fbq Lead                 ttq SubmitForm          ga generate_lead
 *   initiateCheckout()       fbq InitiateCheckout     ttq InitiateCheckout    ga begin_checkout
 *   completeRegistration()   fbq CompleteRegistration ttq CompleteRegistration ga sign_up
 *   submitApplication()      fbq SubmitApplication    ttq SubmitForm          ga submit_application
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

export { gpaBand, signupMethodFrom } from './meta';
export type SignupMethod = 'google' | 'line' | 'email';

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

  meta.trackSearch(input);
  tiktok.trackSearch({ educationLevel: input.educationLevel, gpa_band: band, province: input.province });
  ga.trackSearch({ educationLevel: input.educationLevel, gpa_band: band, province: input.province });
}

/** Real matched results rendered, or a scholarship detail page opened. */
export function viewContent(input: {
  contentIds: string[];
  contentName?: string;
  numItems?: number;
}): void {
  if (!allowed()) return;
  meta.trackViewContent(input);
  tiktok.trackViewContent(input);
  ga.trackViewContent(input);
}

/** Pre-account intent — the visitor reached the signup gate. */
export function lead(input: { location: string }): void {
  if (!allowed()) return;
  meta.trackLead(input);
  tiktok.trackLead(input);
  ga.trackLead(input);
}

/**
 * The visitor tapped the signup gate beneath their preview results.
 *
 * Fires alongside lead(), not instead of it: Lead is the event the live ad sets have
 * been optimising against, and replacing it would discard that learning. This adds the
 * mid-funnel step the platforms report separately.
 */
export function initiateCheckout(input: { location: string; numItems?: number }): void {
  if (!allowed()) return;
  meta.trackInitiateCheckout(input);
  tiktok.trackInitiateCheckout(input);
  ga.trackInitiateCheckout(input);
}

/** A real, completed signup. Never fire this optimistically. */
export function completeRegistration(method: SignupMethod): void {
  if (!allowed()) return;
  meta.trackCompleteRegistration({ method });
  tiktok.trackCompleteRegistration({ method });
  ga.trackCompleteRegistration({ method });
}

/** The visitor clicked through to a funder's external application form. */
export function submitApplication(input: { scholarshipId: string }): void {
  if (!allowed()) return;
  meta.trackSubmitApplication(input);
  tiktok.trackSubmitApplication(input);
  ga.trackSubmitApplication(input);
}
