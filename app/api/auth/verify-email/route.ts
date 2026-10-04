/**
 * Email verification, which exists only to serve email deadline reminders.
 *
 *   POST — the student opted into email reminders. Records the opt-in, and
 *          sends the verification mail if the address is not already verified.
 *          This is the ONLY place in the product that sends verification mail.
 *   GET  — they tapped the link. Marks the address verified.
 *
 * An account with no deliverable address — a LINE account, which has either no
 * email at all or a bridge-era placeholder — can add one here: POST with
 * `email`, and the link mailed to it (`?claim=…&email=…`) makes that address the
 * account email when tapped. See createClaimToken for why that is safe.
 *
 * Nothing else depends on a verified address: an unverified account signs in,
 * matches, tracks and applies exactly like any other. The single consequence of
 * not verifying is that we decline to send deadline mail to an address nobody
 * has proved they own, which is what keeps the sending domain from bouncing.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  createVerificationToken, verifyVerificationToken, createClaimToken, verifyClaimToken,
} from '@/lib/auth/emailVerification';
import { verifyEmailEmail, claimEmailEmail, AUTH_EMAIL_FROM } from '@/lib/email/authEmails';
import { isPlausibleEmail, normalizeEmail } from '@/lib/auth/otp';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { isSyntheticEmail } from '@/lib/line/syntheticEmail';

export async function POST(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let optIn = true;
  let requestedEmail: string | null = null;
  try {
    const body = await request.json();
    optIn = body?.optIn !== false;
    if (typeof body?.email === 'string') requestedEmail = body.email;
  } catch {
    // Absent body means "turn it on" — the only reason to POST here.
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .upsert({ id: user.id, email_reminders_opt_in: optIn, updated_at: new Date().toISOString() },
            { onConflict: 'id' });

  if (updateError) {
    console.error('[auth/verify-email] opt-in write failed:', updateError.message);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  if (!optIn) return NextResponse.json({ ok: true, optIn: false, verificationSent: false });

  // LINE accounts have no deliverable address: none at all through the
  // custom:line provider, an undeliverable @…invalid placeholder from the old
  // bridge. They can add one — the tracker asks, and posts it back here.
  if (!user.email || isSyntheticEmail(user.email)) {
    return claimAddress(user.id, requestedEmail, siteUrl);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email_verified_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.email_verified_at) {
    return NextResponse.json({ ok: true, optIn: true, verificationSent: false, verified: true });
  }

  const token = createVerificationToken(user.id, user.email);
  if (!token) return NextResponse.json({ ok: true, optIn: true, verificationSent: false });

  const url = `${siteUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const sent = await sendEmail(user.email, AUTH_EMAIL_FROM, verifyEmailEmail(url));

  return NextResponse.json({ ok: true, optIn: true, verificationSent: sent });
}

/**
 * Claim sends allowed per account per window. The address is chosen by the
 * student, so without a cap this would let anyone make TunDee mail strangers —
 * which is what gets a sending domain blocked. Per instance, like the password
 * route's limiter: a determined abuser across instances still meets the cap
 * many times over, and nobody legitimate needs more than a retry or two.
 */
const CLAIM_MAX = 3;
const CLAIM_WINDOW_MS = 60 * 60 * 1000;
const claimSends = new Map<string, number[]>();

function claimRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (claimSends.get(userId) ?? []).filter(t => now - t < CLAIM_WINDOW_MS);
  if (recent.length >= CLAIM_MAX) return true;
  recent.push(now);
  claimSends.set(userId, recent);
  return false;
}

/**
 * Mail a claim link to the address a LINE student typed.
 *
 * Deliberately does NOT say whether the address already belongs to another
 * account: answering that here would let any signed-in user test addresses for
 * TunDee membership. The link goes out either way, and the GET below tells the
 * inbox's owner — the only person entitled to know — if it is taken.
 */
async function claimAddress(userId: string, requested: string | null, siteUrl: string) {
  if (!requested) {
    return NextResponse.json({ ok: true, optIn: true, verificationSent: false, reason: 'no_address' });
  }
  const email = normalizeEmail(requested);
  if (!isPlausibleEmail(email) || isSyntheticEmail(email)) {
    return NextResponse.json({ ok: true, optIn: true, verificationSent: false, reason: 'invalid_email' });
  }
  if (claimRateLimited(userId)) {
    return NextResponse.json({ ok: true, optIn: true, verificationSent: false, reason: 'rate_limited' });
  }

  const token = createClaimToken(userId, email);
  if (!token) return NextResponse.json({ ok: true, optIn: true, verificationSent: false });

  const url = `${siteUrl}/api/auth/verify-email?claim=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  const sent = await sendEmail(email, AUTH_EMAIL_FROM, claimEmailEmail(url));
  return NextResponse.json({ ok: true, optIn: true, verificationSent: sent, address: email });
}

/**
 * They tapped a claim link: make the address their account email.
 *
 * No session needed, and usually there is none — the link opens in the mail
 * app's browser, not the Facebook webview the student signed in from. The
 * signed token names the account, and having received the mail proves the
 * address. Afterwards /auth offers that same address for an email sign-in code,
 * so the student can carry on in whichever browser they are in.
 */
async function completeClaim(token: string | null, rawEmail: string | null, siteUrl: string) {
  const failed = (code: string) => NextResponse.redirect(`${siteUrl}/auth?error=${code}`);
  const email = rawEmail ? normalizeEmail(rawEmail) : '';
  const result = verifyClaimToken(token, email);
  if (!email || !result.ok) {
    console.warn('[auth/verify-email] rejected claim token:', result.ok ? 'no email' : result.reason);
    return failed('claim_failed');
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('[auth/verify-email] claim: service role not configured');
    return failed('claim_failed');
  }

  const { data: found, error: lookupError } = await admin.auth.admin.getUserById(result.userId);
  if (lookupError || !found.user) return failed('claim_failed');

  // Only ever fill an empty or placeholder address. If the account gained a
  // real one since this link was sent, the link is stale; the same address
  // again is a harmless second tap.
  const current = found.user.email ?? '';
  if (current && !isSyntheticEmail(current) && current.toLowerCase() !== email) {
    return failed('claim_failed');
  }

  if (current.toLowerCase() !== email) {
    const { error: updateError } = await admin.auth.admin.updateUserById(result.userId, {
      email,
      email_confirm: true,
    });
    if (updateError) {
      const taken = updateError.code === 'email_exists' || /already been registered|already exists/i.test(updateError.message);
      if (!taken) console.error('[auth/verify-email] claim update failed:', updateError.message);
      return failed(taken ? 'email_taken' : 'claim_failed');
    }
  }

  const now = new Date().toISOString();
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: result.userId, email_verified_at: now, email_reminders_opt_in: true, updated_at: now },
            { onConflict: 'id' });
  if (profileError) console.error('[auth/verify-email] claim profile write failed:', profileError.message);

  const back = new URL(`${siteUrl}/auth`);
  back.searchParams.set('error', 'email_added');
  back.searchParams.set('email', email);
  back.searchParams.set('next', '/tracker');
  return NextResponse.redirect(back.toString());
}

export async function GET(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const claim = request.nextUrl.searchParams.get('claim');
  if (claim) return completeClaim(claim, request.nextUrl.searchParams.get('email'), siteUrl);

  const token = request.nextUrl.searchParams.get('token');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // The link may well be opened in a different browser from the one that asked
  // — a mail app's webview, most often. Sending them to sign in first is
  // correct and costs nothing: `next` brings them straight back here.
  if (!user?.email) {
    const back = `/auth?next=${encodeURIComponent(`/api/auth/verify-email?token=${token ?? ''}`)}`;
    return NextResponse.redirect(`${siteUrl}${back}`);
  }

  const result = verifyVerificationToken(token, user.email);
  if (!result.ok || result.userId !== user.id) {
    console.warn('[auth/verify-email] rejected token:', result.ok ? 'user mismatch' : result.reason);
    return NextResponse.redirect(`${siteUrl}/tracker?verify=failed`);
  }

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, email_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            { onConflict: 'id' });

  if (error) {
    console.error('[auth/verify-email] verified write failed:', error.message);
    return NextResponse.redirect(`${siteUrl}/tracker?verify=failed`);
  }

  return NextResponse.redirect(`${siteUrl}/tracker?verify=ok`);
}
