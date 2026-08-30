/**
 * POST /api/auth/password — the primary way into TunDee.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Nearly all paid traffic arrives inside the Facebook, Instagram or TikTok
 * in-app browser, and every previous sign-in method failed there:
 *
 *   Google      rejected outright as disallowed_useragent, on Google's domain,
 *               so the student never comes back and no error can be shown.
 *   LINE        cannot hand off to the LINE app from a webview, so it falls
 *               back to a password form most Thai users cannot complete —
 *               they signed up for LINE with a phone number.
 *   Magic link  forces the student out of the browser and into a mail app.
 *               They do not come back. 79 Lead events produced 10 accounts.
 *
 * Email + password is the only method that completes inside a webview, because
 * it never leaves the page. "Confirm email" is off in Supabase, so signUp
 * returns a live session immediately: no email is sent at signup, at all.
 *
 * ─── THIS ROUTE MUST NEVER BE ABLE TO LOCK ANYONE OUT ───────────────────────
 *
 * A returning user whose password fails is not turned away with an error. The
 * set-password email is sent automatically, right here, and the response says
 * so. That covers both people who mistyped and the 27 accounts created by the
 * magic-link flow, who never had a password and have no way of knowing it.
 *
 * ─── ENUMERATION ────────────────────────────────────────────────────────────
 *
 * With email confirmation off, Supabase answers signUp on a known address with
 * "User already registered", so this form necessarily discloses that an address
 * has an account — as every password login on the web does. The alternative is
 * a generic error that strands the 67 of 78 existing accounts that are not
 * LINE. Accepted deliberately. What is NOT disclosed is anything beyond that:
 * a wrong password and an unset password are answered identically.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { CONSENT_COOKIE, CONSENT_PARAM, CONSENT_COOKIE_MAX_AGE, CONSENT_VERSION, hasValidConsent } from '@/lib/consent';
import { PREVIEW_PARAM, PREVIEW_COOKIE, PREVIEW_COOKIE_MAX_AGE, decodePreviewInput } from '@/lib/preview/types';
import { resolveRedirect, safeNext, redirectWithConversion, applyConversionCookie } from '@/lib/auth/resolveRedirect';
import { findUserByEmail, providerOf } from '@/lib/auth/adminUsers';
import { sendSetPasswordEmail } from '@/lib/auth/recovery';
// Not re-exported: Next.js route modules may only export route handlers and
// the recognised config options.
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';

/**
 * Per-instance sliding window, keyed by address. Best-effort — serverless means
 * several instances — but enough to stop this being used to pump recovery mail
 * at a stranger, which is the only side effect here that reaches a third party.
 */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_LIMIT_MAX;
}

/** Error codes the client turns into Thai copy. See app/auth/AuthForm.tsx. */
type FailureCode =
  | 'consent_required'
  | 'invalid_email'
  | 'weak_password'
  | 'google_account'
  | 'line_account'
  | 'reset_sent'
  | 'rate_limited'
  | 'confirm_email'
  | 'signup_failed';

interface Parsed {
  email: string;
  password: string;
  consent: string;
  next: string;
  preview: string | null;
  utmCampaign: string | null;
  /** True when the no-JS <form> in AuthShell posted this. */
  noscript: boolean;
}

async function parse(request: NextRequest): Promise<Parsed> {
  const contentType = request.headers.get('content-type') ?? '';
  const isForm = contentType.includes('application/x-www-form-urlencoded');

  const get = isForm
    ? await request.formData().then(f => (k: string) => (f.get(k) ?? '').toString())
    : await request.json().then(
        (b: Record<string, unknown>) => (k: string) => (b?.[k] ?? '').toString(),
      ).catch(() => () => '');

  return {
    email:       get('email').trim().toLowerCase(),
    password:    get('password'),
    consent:     get(CONSENT_PARAM),
    next:        safeNext(get('next')),
    preview:     get(PREVIEW_PARAM) || null,
    utmCampaign: get('utm_campaign') || null,
    noscript:    get('noscript') === '1',
  };
}

/** Good enough to reject typos without rejecting valid unusual addresses. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type PendingCookie = { name: string; value: string; options: CookieOptions };

/**
 * A Supabase client whose session cookies are collected rather than written
 * through next/headers.
 *
 * The shared helper in lib/supabase/server.ts writes via `cookies()`, and Next
 * attaches those to whatever the handler returns. That is fine everywhere else
 * in the app. It is not something to leave implicit HERE: this is the route
 * that signs every new student in, it answers the hydrated client with JSON
 * rather than a redirect, and if the session cookies failed to attach the
 * account would be created server-side while the browser stayed logged out —
 * the worst possible failure, because it looks like success and is invisible in
 * logs. Collecting them and setting them on the response object makes it
 * explicit and identical for both response shapes.
 */
function sessionClient(request: NextRequest, pending: PendingCookie[]) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => { pending.push(...list); },
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const input = await parse(request);

  /**
   * Both response shapes, so one implementation serves the hydrated client and
   * the no-JS form. The form path redirects back to /auth with the code in the
   * query string and the address echoed, because a student on a stalled 3G
   * connection who never received our JavaScript still has to be able to sign
   * in — that is the whole reason AuthShell exists.
   */
  const fail = (code: FailureCode, status = 400) => {
    if (input.noscript) {
      const back = new URL(`${siteUrl}/auth`);
      back.searchParams.set('error', code);
      back.searchParams.set('next', input.next);
      if (input.email) back.searchParams.set('email', input.email);
      return NextResponse.redirect(back, 303);
    }
    return NextResponse.json({ ok: false, error: code }, { status });
  };

  // ── Consent, enforced here and not only in the browser ────────────────────
  // The hydrated page posts it in the body; the no-JS shell posts a `required`
  // checkbox; either is accepted, as is a cookie set by an earlier attempt.
  // Neither present means the visitor never ticked the box — or never saw it,
  // having come straight to this URL — and this route writes a profile row for
  // a minor. It refuses.
  const consentCookie = request.cookies.get(CONSENT_COOKIE)?.value;
  if (!hasValidConsent(input.consent, consentCookie)) return fail('consent_required');

  if (!looksLikeEmail(input.email)) return fail('invalid_email');
  if (input.password.length < MIN_PASSWORD_LENGTH) return fail('weak_password');
  if (rateLimited(input.email)) return fail('rate_limited', 429);

  const sessionCookies: PendingCookie[] = [];
  const supabase = sessionClient(request, sessionCookies);

  // ── The new-account path: one request, one round trip, no email ───────────
  // signUp first because the new student from an ad is who this route is for.
  // A returning user pays an extra call; a new one pays nothing.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email:    input.email,
    password: input.password,
    options: {
      // Read back by signupMethodFrom so the conversion reports 'password'
      // rather than being lumped in with the retired magic-link accounts.
      data: { provider: 'password' },
    },
  });

  const alreadyRegistered =
    /already registered|already been registered/i.test(signUpError?.message ?? '') ||
    // The shape Supabase returns instead when email confirmation is ON. It is
    // OFF today, so this is defensive: flipping that switch in the dashboard
    // must not silently turn "you already have an account" into "signup
    // failed", which would strand every returning user at once.
    (signUpData?.user != null && signUpData.user.identities?.length === 0);

  if (!signUpError && !alreadyRegistered && signUpData.session) {
    return finish(request, supabase, sessionCookies, input, siteUrl, 'password');
  }

  // The account was created but Supabase withheld a session, which happens only
  // if "Confirm email" has been switched back on in the dashboard. Say what is
  // actually true — a new account awaiting confirmation — rather than falling
  // through to the returning-user path, which would tell a first-time student
  // that their address already had an account.
  if (!signUpError && !alreadyRegistered && !signUpData.session) {
    console.warn('[auth/password] signUp returned no session — is "Confirm email" enabled?');
    return fail('confirm_email');
  }

  if (!alreadyRegistered && signUpError) {
    console.error('[auth/password] signUp failed:', signUpError.status, signUpError.message);
    return fail('signup_failed', 500);
  }

  // ── The returning-user path ───────────────────────────────────────────────
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email:    input.email,
    password: input.password,
  });

  if (!signInError) return finish(request, supabase, sessionCookies, input, siteUrl, 'password');

  // The address has an account and this password does not open it. Name the
  // provider when it is one this form cannot serve, so the student is sent to a
  // button that works instead of retyping a password that never existed.
  const provider = await lookupProvider(input.email);
  if (provider === 'google') return fail('google_account');
  if (provider === 'line')   return fail('line_account');

  // Otherwise: either a wrong password or an account from the magic-link era
  // that never had one. We cannot tell the two apart — Supabase does not expose
  // encrypted_password through the admin API — and we do not need to. The same
  // email answers both, and sending it without making them find a "forgot
  // password" link first is the difference between a recovered account and an
  // abandoned one.
  await sendSetPasswordEmail(input.email, siteUrl, input.next);
  return fail('reset_sent');
}

/** Which provider owns this address, or null when we cannot tell. */
async function lookupProvider(email: string): Promise<'google' | 'line' | 'password' | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = await findUserByEmail(admin, email);
  return user ? providerOf(user) : null;
}

/**
 * Session established. Merge the guest session, then send the visitor on.
 *
 * The merge is the same one the OAuth callback runs — see
 * lib/auth/resolveRedirect.ts — so a student who answered three questions on
 * /start lands on their matched scholarships and is never asked again.
 *
 * Two response shapes for one outcome. The hydrated client gets JSON and
 * navigates itself, so it can keep its loading state and render errors inline;
 * the no-JS form gets a 303 the browser follows. The conversion marker and the
 * session cookies ride both.
 *
 * Consent and the /start answers are written back as cookies here because they
 * may have arrived only in the request body: someone who escaped a webview into
 * Chrome carries them in the URL and has no cookies at all in that browser.
 */
async function finish(
  request: NextRequest,
  supabase: ReturnType<typeof sessionClient>,
  sessionCookies: PendingCookie[],
  input: Parsed,
  siteUrl: string,
  method: 'password',
) {
  const resolved = await resolveRedirect(supabase, {
    next:           input.next,
    previewParam:   input.preview,
    consentParam:   input.consent,
    utmCampaign:    input.utmCampaign,
    methodOverride: method,
    userAgent:      request.headers.get('user-agent'),
  });

  const response = input.noscript
    ? redirectWithConversion(siteUrl, resolved)
    : applyConversionCookie(
        NextResponse.json({ ok: true, redirect: resolved.path }),
        resolved,
      );

  // The session itself, first and unconditionally. Everything below is
  // convenience; without these the student is not signed in.
  for (const { name, value, options } of sessionCookies) {
    response.cookies.set(name, value, options);
  }

  const cookieBase = {
    sameSite: 'lax' as const,
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
  };

  if (hasValidConsent(input.consent)) {
    response.cookies.set(CONSENT_COOKIE, CONSENT_VERSION, {
      ...cookieBase, maxAge: CONSENT_COOKIE_MAX_AGE,
    });
  }
  if (input.preview && decodePreviewInput(input.preview)) {
    response.cookies.set(PREVIEW_COOKIE, input.preview, {
      ...cookieBase, maxAge: PREVIEW_COOKIE_MAX_AGE,
    });
  }

  return response;
}
