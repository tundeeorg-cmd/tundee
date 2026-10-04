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
 * TWO MODES (lib/line/authMode.ts, env LINE_AUTH_MODE)
 *
 *   supabase  Supabase builds the authorize URL for its `custom:line` provider;
 *             LINE returns to Supabase, which returns to /auth/callback with a
 *             code. LINE's own parameters ride along as queryParams.
 *   bridge    This route builds LINE's authorize URL itself and LINE returns to
 *             ./callback (the original flow, and the default).
 *
 * The consent check and the guest-session cookies are shared by both.
 *
 * Required env vars:
 *   supabase  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   bridge    LINE_LOGIN_CHANNEL_ID, LINE_AUTH_REDIRECT_URI
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { createServerClient } from '@supabase/ssr';
import { getLineAuthRedirectUri, getLineBotPrompt, getLineLoginChannelId } from '@/lib/line/env';
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
import { getLineAuthMode, LINE_PROVIDER, LINE_CALLBACK_FLAG, LINE_CALLBACK_RETRY_FLAG } from '@/lib/line/authMode';

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

/**
 * Cookies both modes write on the way out.
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
 * Supabase mode: ask Supabase for the `custom:line` authorize URL.
 *
 * The /auth/callback URL carries everything the bridge used to park in its own
 * cookies — next, the guest session, the parked answers, the campaign — the
 * same way the Google path does, plus the LINE markers that callback uses to
 * retry a failed auto login once.
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

  // Same LINE parameters, and the same reasoning, as the bridge below:
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

  if (getLineAuthMode() === 'supabase') {
    const response = await startWithSupabase(siteUrl, next, request, searchParams);
    persistGuestCookies(response, searchParams, consentParam, consentCookie);
    return response;
  }

  /*
   * Both LINE values, read together.
   *
   * lib/line/env throws with the variable name and the console page it comes
   * from — which is what instrumentation.ts surfaces at boot. By the time a
   * request reaches here that check has already passed, so this catch is for
   * the deployment that somehow got past it. It degrades to the email path
   * rather than 500ing: the student still has a way in, and the log line names
   * the variable for whoever reads it.
   */
  let channelId: string;
  let redirectUri: string;
  try {
    channelId   = getLineLoginChannelId();
    redirectUri = getLineAuthRedirectUri();
  } catch (e) {
    console.error('[auth/line/start] LINE env misconfigured:', e);
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
  // No `email`: the Email address permission is not being applied for (the
  // Supabase provider can never receive one), and asking would show students a
  // consent line for data we do not use.
  authorizeUrl.searchParams.set('scope', 'openid profile');
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
   * The guest session and the campaign, parked for ./callback, which builds
   * its own handoff URL and so cannot see this request's query string.
   */
  const previewParam = searchParams.get(PREVIEW_PARAM);
  if (previewParam && decodePreviewInput(previewParam)) {
    response.cookies.set(LINE_AUTH_PREVIEW_COOKIE, previewParam, cookieOptions);
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

  persistGuestCookies(response, searchParams, consentParam, consentCookie);
  return response;
}
