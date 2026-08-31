/**
 * GET /api/auth/line/start — begins one-tap LINE *login*.
 *
 * Distinct from /api/line/connect, which links a LINE account to an already
 * signed-in user for the messaging bot. This route is public: it turns a LINE
 * identity into a TunDee session (see ./callback).
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
 *     forces the password form, and it belongs only on the documented retry.
 *   • `initial_amr_display` is deliberately absent — `lineqr` would replace the
 *     app handoff with a QR code, which is useless on the phone showing it.
 *   • `ui_locales=th` so the consent screen is Thai regardless of device locale.
 *
 * Required env vars:
 *   LINE_LOGIN_CHANNEL_ID
 *   LINE_AUTH_REDIRECT_URI
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { getLineAuthRedirectUri, getLineBotPrompt } from '@/lib/line/redirectUri';
import { CONSENT_COOKIE, CONSENT_PARAM, CONSENT_COOKIE_MAX_AGE, CONSENT_VERSION, hasValidConsent } from '@/lib/consent';
import { PREVIEW_PARAM, PREVIEW_COOKIE, PREVIEW_COOKIE_MAX_AGE, decodePreviewInput } from '@/lib/preview/types';
import { INTAKE_PARAM, isIntakeId } from '@/lib/intake/pendingIntake';
import {
  LINE_AUTH_STATE_COOKIE,
  LINE_AUTH_NEXT_COOKIE,
  LINE_AUTH_NONCE_COOKIE,
  LINE_AUTH_VERIFIER_COOKIE,
  LINE_AUTH_PREVIEW_COOKIE,
  LINE_AUTH_UTM_COOKIE,
  LINE_AUTH_INTAKE_COOKIE,
  LINE_AUTH_RETRY_COOKIE,
  LINE_AUTH_COOKIE_MAX_AGE,
} from '@/lib/line/authCookies';

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';

/** Only same-origin paths may be used as a post-login destination. */
function safeNext(raw: string | null): string {
  if (!raw) return '/scholarships';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/scholarships';
  return raw;
}

/** PKCE S256: base64url(SHA-256(verifier)). */
function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export async function GET(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const { searchParams } = new URL(request.url);
  const next = safeNext(searchParams.get('next'));

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    console.error('[auth/line/start] LINE_LOGIN_CHANNEL_ID is not set');
    return NextResponse.redirect(`${siteUrl}/auth?error=line_not_configured`);
  }

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

  let redirectUri: string;
  try {
    redirectUri = getLineAuthRedirectUri();
  } catch (e) {
    console.error('[auth/line/start] redirect_uri misconfigured:', e);
    return NextResponse.redirect(`${siteUrl}/auth?error=line_not_configured`);
  }

  const state    = randomBytes(24).toString('base64url');
  const nonce    = randomBytes(24).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');

  /**
   * The documented retry after an auto-login failure.
   *
   * ./callback bounces the student back here with ?retry=1 when the state that
   * came back does not match the one we sent — which LINE documents as the
   * symptom of auto login having failed part-way. Retrying with auto login
   * disabled is LINE's own prescribed remedy. It is the ONLY circumstance in
   * which this parameter is set: sending it on a first attempt would guarantee
   * the password form for everyone.
   *
   * The flag is written to a cookie as well, because the callback cannot see
   * this request's query string — LINE returns to the exact Callback URL
   * registered in its console. Without that cookie a second failure would
   * bounce back here and retry forever.
   */
  const isRetry = searchParams.get('retry') === '1';

  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', channelId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);
  // `email` is requested but only granted once the channel's Email address
  // permission is approved; the callback handles its absence.
  authorizeUrl.searchParams.set('scope', 'openid profile email');
  // Binds the id_token to this request. Checked in ./callback.
  authorizeUrl.searchParams.set('nonce', nonce);
  // The consent screen follows the device locale otherwise, which for a Thai
  // student on an English-locale handset means an English permissions screen.
  authorizeUrl.searchParams.set('ui_locales', 'th');
  authorizeUrl.searchParams.set('code_challenge', challengeFor(verifier));
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('bot_prompt', getLineBotPrompt());
  if (isRetry) authorizeUrl.searchParams.set('disable_auto_login', 'true');

  const response = NextResponse.redirect(authorizeUrl.toString());

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   LINE_AUTH_COOKIE_MAX_AGE,
  };
  response.cookies.set(LINE_AUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(LINE_AUTH_NEXT_COOKIE, next, cookieOptions);
  response.cookies.set(LINE_AUTH_NONCE_COOKIE, nonce, cookieOptions);
  response.cookies.set(LINE_AUTH_VERIFIER_COOKIE, verifier, cookieOptions);
  // Written on both branches: an absent cookie must mean "no retry attempted",
  // never "a stale cookie from the previous attempt is still lying around".
  response.cookies.set(LINE_AUTH_RETRY_COOKIE, isRetry ? '1' : '0', cookieOptions);

  /*
   * The guest session and the campaign, parked for the callback.
   *
   * Both may arrive here as query params rather than cookies, and that is the
   * case that matters: a student who escaped the Facebook webview into Chrome
   * lands in a browser with an empty cookie jar, carrying their /start answers
   * in the URL. Writing PREVIEW_COOKIE here is what stops Chrome re-asking
   * their grade, GPA and province after LINE hands them back.
   */
  const previewParam = searchParams.get(PREVIEW_PARAM);
  if (previewParam && decodePreviewInput(previewParam)) {
    response.cookies.set(LINE_AUTH_PREVIEW_COOKIE, previewParam, cookieOptions);
    response.cookies.set(PREVIEW_COOKIE, previewParam, {
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   PREVIEW_COOKIE_MAX_AGE,
    });
  }

  // utm_campaign becomes recruitment_source (PREREG §5.4) at the profile merge.
  // The LINE path dropped it entirely before this: the callback builds its own
  // handoff URL, so a param left on THIS request simply never arrived, and every
  // LINE signup was recorded as 'organic' no matter which ad paid for it.
  const utmCampaign = searchParams.get('utm_campaign');
  // Parked /start answers. Kept alongside the preview cookie, not instead of
  // it: the preview is the fast path within one browser, this is the one that
  // still works when the student got here after a browser switch.
  const intakeParam = searchParams.get(INTAKE_PARAM);
  if (isIntakeId(intakeParam)) {
    response.cookies.set(LINE_AUTH_INTAKE_COOKIE, intakeParam, cookieOptions);
  }

  if (utmCampaign) {
    response.cookies.set(LINE_AUTH_UTM_COOKIE, utmCampaign, cookieOptions);
  }

  // Consent arriving as a query param means the no-JS form sent it, so no cookie was
  // ever written in the browser. Persist it here or /auth/callback would see an
  // unconsented signup and route the student through the wizard it exists to skip.
  // Not httpOnly: /auth/callback reads it server-side, but the hydrated page also
  // writes and reads this same cookie from JavaScript.
  if (!hasValidConsent(consentCookie) && hasValidConsent(consentParam)) {
    response.cookies.set(CONSENT_COOKIE, CONSENT_VERSION, {
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   CONSENT_COOKIE_MAX_AGE,
    });
  }

  return response;
}
