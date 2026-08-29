/**
 * POST /api/auth/email-link — send the Thai sign-in email ourselves.
 *
 * Replaces the client's supabase.auth.signInWithOtp() for the email path, so
 * the copy lives in version control (lib/email/authEmails.ts) and can be
 * reviewed in a PR instead of pasted into a dashboard.
 *
 * ─── THIS ROUTE MUST NEVER BE ABLE TO LOCK ANYONE OUT ───────────────────────
 *
 * It is the only way into an account by email. Every failure mode therefore
 * returns `fallback: true` rather than an error, and the client falls back to
 * signInWithOtp — which still works, still sends, and merely sends the English
 * dashboard template. A degraded language is recoverable; a login page that
 * cannot send mail is not.
 *
 * Cases that fall back: RESEND_API_KEY unset, service-role key unset,
 * generateLink failing, Resend returning non-2xx, or any unexpected throw.
 *
 * ─── Enumeration ────────────────────────────────────────────────────────────
 *
 * The response is identical whether or not an account exists. Supabase's own
 * endpoint behaves this way and losing it would turn the login form into an
 * "is this person a TunDee user?" oracle — a real concern when the users are
 * minors and the answer is disclosed to anyone who can type an address.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { magicLinkEmail, AUTH_EMAIL_FROM } from '@/lib/email/authEmails';
import type { Language } from '@/lib/types';

const RESEND_API = 'https://api.resend.com/emails';

/**
 * Per-instance sliding window. Best-effort — serverless means several
 * instances — but enough to blunt someone pumping mail through a public
 * endpoint. Supabase applied its own limit on the path this replaces, so
 * shipping without any would be a regression.
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

/** Same shape for every outcome, so nothing leaks through the response. */
const OK = NextResponse.json({ ok: true, fallback: false });
const FALLBACK = (reason: string) =>
  NextResponse.json({ ok: false, fallback: true, reason });

export async function POST(request: NextRequest) {
  let email = '';
  let redirectTo = '';
  let lang: Language = 'th';

  try {
    const body = await request.json();
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    redirectTo = typeof body?.redirectTo === 'string' ? body.redirectTo : '';
    if (body?.lang === 'en' || body?.lang === 'th') lang = body.lang;
  } catch {
    return FALLBACK('bad_body');
  }

  if (!email || !email.includes('@') || email.length > 320) {
    // Shape validation only — never "no such user".
    return NextResponse.json({ ok: false, fallback: false, error: 'invalid_email' }, { status: 400 });
  }

  // redirectTo is echoed into an email people click. Restrict it to our own
  // origin so this endpoint cannot be used to send TunDee-branded mail
  // pointing anywhere an attacker chooses.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.tundee.org';
  if (redirectTo && !redirectTo.startsWith(`${siteUrl}/`)) {
    console.warn('[auth/email-link] off-origin redirectTo rejected');
    return FALLBACK('bad_redirect');
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(`${ip}|${email}`)) {
    // Silent success: telling a scraper it hit a limit is itself a signal.
    return OK;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!url || !serviceKey || !resendKey) {
    // Expected on any environment without the keys — the client will use
    // signInWithOtp and the user still receives a (English) link.
    return FALLBACK('not_configured');
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    let link = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });

    // magiclink only works for an existing user. Create one first, mirroring
    // what signInWithOtp({ shouldCreateUser: true }) did — and email_confirm
    // matches this project's mailer_autoconfirm: true, so behaviour is
    // unchanged for new signups.
    if (link.error) {
      const created = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (created.error) {
        console.error('[auth/email-link] createUser failed:', created.error.message);
        return FALLBACK('create_failed');
      }
      link = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: redirectTo ? { redirectTo } : undefined,
      });
    }

    const hashedToken = link.data?.properties?.hashed_token;
    if (link.error || !hashedToken) {
      console.error('[auth/email-link] generateLink failed:', link.error?.message);
      return FALLBACK('generate_failed');
    }

    // Deliberately NOT properties.action_link. That points at Supabase's
    // /auth/v1/verify, which returns the session in the URL FRAGMENT — and a
    // fragment is never sent to the server, so our /auth/callback route
    // handler receives an empty query string and cannot sign anyone in.
    //
    // Linking straight to our own callback with token_hash avoids that, and
    // avoids PKCE's other trap: `code` requires a code_verifier stored by the
    // browser that requested the link, but magic links are routinely opened in
    // a DIFFERENT browser. verifyOtp with a token_hash needs nothing from the
    // originating device, so the link works wherever it is opened.
    const target = redirectTo || `${siteUrl}/auth/callback`;
    const joiner = target.includes('?') ? '&' : '?';
    const signInUrl =
      `${target}${joiner}token_hash=${encodeURIComponent(hashedToken)}&type=magiclink`;

    const { subject, html, text } = magicLinkEmail(signInUrl, lang);

    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({ from: AUTH_EMAIL_FROM, to: [email], subject, html, text }),
    });

    if (!res.ok) {
      console.error('[auth/email-link] resend failed:', res.status, (await res.text()).slice(0, 200));
      return FALLBACK('send_failed');
    }

    return OK;
  } catch (err) {
    console.error('[auth/email-link] unexpected:', err);
    return FALLBACK('unexpected');
  }
}
