/**
 * Email verification, which exists only to serve email deadline reminders.
 *
 *   POST — the student opted into email reminders. Records the opt-in, and
 *          sends the verification mail if the address is not already verified.
 *          This is the ONLY place in the product that sends verification mail.
 *   GET  — they tapped the link. Marks the address verified.
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
import { createVerificationToken, verifyVerificationToken } from '@/lib/auth/emailVerification';
import { verifyEmailEmail, AUTH_EMAIL_FROM } from '@/lib/email/authEmails';
import { sendEmail } from '@/lib/email/send';
import { isSyntheticEmail } from '@/lib/line/syntheticEmail';

export async function POST(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let optIn = true;
  try {
    const body = await request.json();
    optIn = body?.optIn !== false;
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

  // LINE accounts carry a synthetic @…invalid address until LINE grants the
  // channel its Email address permission. Mailing it would bounce against a
  // domain that cannot exist, so this reports honestly instead of pretending.
  if (!user.email || isSyntheticEmail(user.email)) {
    return NextResponse.json({ ok: true, optIn: true, verificationSent: false, reason: 'no_address' });
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

export async function GET(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
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
