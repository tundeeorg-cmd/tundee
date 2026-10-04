/**
 * GET /api/auth/line/start — begins LINE sign-in.
 *
 * Distinct from /api/line/connect, which links a LINE account to an already
 * signed-in user for the messaging bot. This route is public: it turns a LINE
 * identity into a TunDee session.
 *
 * LINE is a Supabase Auth provider, `custom:line` (lib/line/authMode.ts). This
 * route asks Supabase for the authorize URL; LINE returns to Supabase, which
 * returns to /auth/callback with a code, exactly like Google. It stays a server
 * route, rather than a signInWithOAuth call in the page, for three reasons: the
 * PDPA consent check below, the Android webview escape (which needs a URL
 * Chrome can open), and the no-JavaScript shell (which needs a plain link).
 *
 * ─── APP-TO-APP LOGIN ───────────────────────────────────────────────────────
 *
 * The point of LINE Login for this product is that the LINE app opens and the
 * student approves with one tap — never the email + password form, which most
 * Thai users cannot complete because they registered LINE with a phone number.
 *
 * That handoff is LINE's "auto login", and it needs a Universal Link (iOS) or
 * App Link (Android) to fire. Those are blocked inside third-party webviews, so
 * the /auth page escapes to Chrome before sending anyone here from one. Nothing
 * in this route can fix that; what this route can do is not make it worse:
 *
 *   • `disable_auto_login` is NEVER set on a first attempt. Setting it is what
 *     forces the password form, and it belongs only on the retry that
 *     /auth/callback starts after a failed attempt.
 *   • `initial_amr_display` is deliberately absent — `lineqr` would replace the
 *     app handoff with a QR code, which is useless on the phone showing it.
 *   • `ui_locales=th` so the consent screen is Thai regardless of device locale.
 *
 * Required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * The LINE channel credentials live in the Supabase provider config.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getLineBotPrompt } from '@/lib/line/env';
import { CONSENT_COOKIE, CONSENT_PARAM, CONSENT_COOKIE_MAX_AGE, CONSENT_VERSION, hasValidConsent } from '@/lib/consent';
import { PREVIEW_PARAM, PREVIEW_COOKIE, PREVIEW_COOKIE_MAX_AGE, decodePreviewInput } from '@/lib/preview/types';
import { INTAKE_PARAM, isIntakeId } from '@/lib/intake/pendingIntake';
import { LINE_PROVIDER, LINE_CALLBACK_FLAG, LINE_CALLBACK_RETRY_FLAG } from '@/lib/line/authMode';
import { inspectUserAgent } from '@/lib/browser/inAppBrowser';

/** Only same-origin paths may be used as a post-login destination. */
function safeNext(raw: string | null): string {
  if (!raw) return '/scholarships';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/scholarships';
  return raw;
}

/**
 * Cookies written on the way out.
 *
 * PREVIEW_COOKIE: a student who escaped the Facebook webview into Chrome lands
 * in a browser with an empty cookie jar, carrying their /start answers in the
 * URL. Writing it here is what stops Chrome re-asking their grade, GPA and
 * province after LINE hands them back.
 *
 * CONSENT_COOKIE: consent arriving as a query param means the no-JS form sent
 * it, so no cookie was ever written in the browser. Persist it here or
 * /auth/callback would see an unconsented signup and route the student through
 * the wizard it exists to skip. Not httpOnly: /auth/callback reads it
 * server-side, but the hydrated page also writes and reads this same cookie
 * from JavaScript.
 */
function persistGuestCookies(
  response: NextResponse,
  searchParams: URLSearchParams,
  consentParam: string | null,
  consentCookie: string | undefined,
): void {
  const previewParam = searchParams.get(PREVIEW_PARAM);
  if (previewParam && decodePreviewInput(previewParam)) {
    response.cookies.set(PREVIEW_COOKIE, previewParam, {
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   PREVIEW_COOKIE_MAX_AGE,
    });
  }
  if (!hasValidConsent(consentCookie) && hasValidConsent(consentParam)) {
    response.cookies.set(CONSENT_COOKIE, CONSENT_VERSION, {
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   CONSENT_COOKIE_MAX_AGE,
    });
  }
}

/**
 * Ask Supabase for the `custom:line` authorize URL.
 *
 * The /auth/callback URL carries next, the guest session, the parked answers
 * and the campaign — the same way the Google path does — plus the LINE markers
 * that callback uses to retry a failed auto login once.
 *
 * The PKCE verifier is written by the SSR client through `setAll`; collected
 * here and copied onto the redirect, because this route returns a response it
 * builds itself rather than one next/headers would decorate.
 */
async function startWithSupabase(
  siteUrl: string,
  next: string,
  request: NextRequest,
  searchParams: URLSearchParams,
): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error('[auth/line/start] Supabase env missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return NextResponse.redirect(`${siteUrl}/auth?error=line_not_configured`);
  }

  const isRetry = searchParams.get('retry') === '1';

  const callback = new URL(`${siteUrl}/auth/callback`);
  callback.searchParams.set('next', next);
  callback.searchParams.set(CONSENT_PARAM, CONSENT_VERSION);
  callback.searchParams.set(LINE_CALLBACK_FLAG, '1');
  if (isRetry) callback.searchParams.set(LINE_CALLBACK_RETRY_FLAG, '1');
  const previewParam = searchParams.get(PREVIEW_PARAM);
  if (previewParam && decodePreviewInput(previewParam)) callback.searchParams.set(PREVIEW_PARAM, previewParam);
  const intakeParam = searchParams.get(INTAKE_PARAM);
  if (isIntakeId(intakeParam)) callback.searchParams.set(INTAKE_PARAM, intakeParam);
  const utmCampaign = searchParams.get('utm_campaign');
  if (utmCampaign) callback.searchParams.set('utm_campaign', utmCampaign);

  const pending: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => { pending.push(...cookies); },
    },
  });

  // ui_locales for a Thai consent screen, bot_prompt for the reminder bot,
  // disable_auto_login only on the one retry. Scopes come from the provider's
  // dashboard config (openid, profile) — never email, which userinfo cannot
  // return anyway.
  const queryParams: Record<string, string> = {
    ui_locales: 'th',
    bot_prompt: getLineBotPrompt(),
  };
  if (isRetry) queryParams.disable_auto_login = 'true';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: LINE_PROVIDER,
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true, queryParams },
  });
  if (error || !data?.url) {
    console.error('[auth/line/start] signInWithOAuth failed:', error?.message ?? 'no url');
    return NextResponse.redirect(`${siteUrl}/auth?error=line_not_configured`);
  }

  const response = NextResponse.redirect(data.url);
  for (const { name, value, options } of pending) response.cookies.set(name, value, options);
  return response;
}

export async function GET(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const { searchParams } = new URL(request.url);
  const next = safeNext(searchParams.get('next'));

  /*
   * PDPA consent, enforced here rather than only in the browser.
   *
   * The hydrated page sets the consent cookie before navigating here; the no-JS shell
   * submits it as a query param from a form whose checkbox is `required`. Either is
   * accepted. Neither present means the visitor never ticked the box — or never saw it,
   * because they came straight to this URL — and this route starts an OAuth flow whose
   * callback writes a profile row for a minor. It refuses.
   */
  const consentParam  = searchParams.get(CONSENT_PARAM);
  const consentCookie = request.cookies.get(CONSENT_COOKIE)?.value;
  if (!hasValidConsent(consentParam, consentCookie)) {
    const back = new URL(`${siteUrl}/auth`);
    back.searchParams.set('error', 'consent_required');
    back.searchParams.set('next', next);
    return NextResponse.redirect(back);
  }

  /*
   * An iPhone browser LINE cannot open its app from — Chrome and the other
   * non-Safari browsers, and the Facebook/Instagram/TikTok webviews. Starting
   * LINE there lands on LINE's own email + password form and then a QR code
   * that cannot be scanned from the same phone (production, 2026-10-04).
   *
   * The /auth page already shows "open in Safari" instead of coming here — but
   * only once its JavaScript has run. A tap before hydration, a cached copy of
   * an older page, the no-JS shell or a typed URL all arrive here directly, so
   * this route makes the same check and sends them back to that help, with
   * their answers and campaign in the URL for the copied link to carry.
   */
  const iab = inspectUserAgent(request.headers.get('user-agent'));
  if (iab.platform === 'ios' && iab.lineAppToAppBlocked) {
    const back = new URL(`${siteUrl}/auth`);
    back.searchParams.set('error', 'line_open_in_safari');
    back.searchParams.set('next', next);
    const previewParam = searchParams.get(PREVIEW_PARAM);
    if (previewParam && decodePreviewInput(previewParam)) back.searchParams.set(PREVIEW_PARAM, previewParam);
    const intakeParam = searchParams.get(INTAKE_PARAM);
    if (isIntakeId(intakeParam)) back.searchParams.set(INTAKE_PARAM, intakeParam);
    const utmCampaign = searchParams.get('utm_campaign');
    if (utmCampaign) back.searchParams.set('utm_campaign', utmCampaign);
    console.info('[auth/line/start] iOS browser cannot open the LINE app — sent to the Safari help:', iab.app ?? 'non-Safari browser');
    const response = NextResponse.redirect(back);
    persistGuestCookies(response, searchParams, consentParam, consentCookie);
    return response;
  }

  const response = await startWithSupabase(siteUrl, next, request, searchParams);
  persistGuestCookies(response, searchParams, consentParam, consentCookie);
  return response;
}
