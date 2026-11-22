/**
 * GET /api/cron/signup-alert — email the admins when ads bring visitors and
 * nobody signs up.
 *
 * Runs daily from vercel.json (02:00 UTC = 09:00 Bangkok); Vercel Hobby allows
 * a cron once a day at most. Looks back WINDOW_HOURS, and alerts only when
 * there were at least MIN_LANDING_VIEWS landing views and zero new accounts.
 * The email says which part of the funnel stopped (lib/auth/signupAlert.ts),
 * so an outage and a conversion problem are not mistaken for each other.
 *
 * Authorised with CRON_SECRET like every other cron. `?dry=1` returns the
 * verdict without sending anything. Counts only: no ids or emails are read
 * into the response or the alert.
 *
 * Env: CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, and a recipient
 * (SIGNUP_ALERT_EMAIL, else NEXT_PUBLIC_ADMIN_EMAIL / ADMIN_EMAILS).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { AUTH_EMAIL_FROM } from '@/lib/email/authEmails';
import {
  WINDOW_HOURS, diagnoseSignups, buildSignupAlertEmail, signupAlertRecipients, isLineAccount,
  type SignupCounts,
} from '@/lib/auth/signupAlert';

/** The sender already verified in Resend for tundee.org. */
const FROM = AUTH_EMAIL_FROM;
const PER_PAGE = 200;
const MAX_PAGES = 50;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('[signup-alert] service role not configured');
    return NextResponse.json({ error: 'Missing SUPABASE env vars' }, { status: 500 });
  }

  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

  // New accounts. listUsers has no created_at filter, so page through: the
  // whole table is a few hundred rows.
  // LINE accounts are counted by name, so a day of LINE-only sign-ups is visibly
  // sign-ups (and never mistaken for "nobody signed up").
  let accountsListed = 0;
  let lineAccounts = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error('[signup-alert] listUsers failed:', error.message);
      return NextResponse.json({ error: 'listUsers failed' }, { status: 500 });
    }
    for (const u of data.users) {
      if (new Date(u.created_at) < since) continue;
      accountsListed++;
      if (isLineAccount(u as Parameters<typeof isLineAccount>[0])) lineAccounts++;
    }
    if (data.users.length < PER_PAGE) break;
  }

  const count = async (eventType: string, step?: 'send' | 'verify') => {
    let q = admin
      .from('funnel_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', eventType)
      .gte('occurred_at', since.toISOString());
    if (step) q = q.eq('context->>step', step);
    const { count: n, error } = await q;
    if (error) throw new Error(`${eventType}: ${error.message}`);
    return n ?? 0;
  };

  let counts: SignupCounts;
  try {
    const [landingViews, signupStarted, otpSent, otpVerified, sendFailures, verifyFailures, signupCompleted] =
      await Promise.all([
        count('landing_view'),
        count('signup_started'),
        count('otp_sent'),
        count('otp_verified'),
        count('otp_failed', 'send'),
        count('otp_failed', 'verify'),
        // Every method, LINE included (lib/adTracking trackSignupComplete).
        count('signup_completed'),
      ]);
    counts = {
      // Either source is enough to count an account; neither is trusted to be complete alone.
      newAccounts: Math.max(accountsListed, signupCompleted),
      lineAccounts, signupCompleted,
      landingViews, signupStarted, otpSent, otpVerified, sendFailures, verifyFailures,
    };
  } catch (e) {
    console.error('[signup-alert] funnel count failed:', e);
    return NextResponse.json({ error: 'funnel count failed' }, { status: 500 });
  }

  const diagnosis = diagnoseSignups(counts);
  const body = { window_hours: WINDOW_HOURS, counts, diagnosis, alert: diagnosis !== 'ok' };

  if (diagnosis === 'ok') return NextResponse.json({ ...body, notified: 0 });

  console.error('[signup-alert] ALERT', diagnosis, JSON.stringify(counts));
  if (request.nextUrl.searchParams.get('dry') === '1') {
    return NextResponse.json({ ...body, notified: 0, dry_run: true });
  }

  const to = signupAlertRecipients();
  if (!to.length) console.error('[signup-alert] no recipient: set SIGNUP_ALERT_EMAIL');
  const email = buildSignupAlertEmail(counts, diagnosis);
  const sent = await Promise.all(to.map(addr => sendEmail(addr, FROM, email)));
  const notified = sent.filter(Boolean).length;
  if (notified < to.length) console.error(`[signup-alert] sent ${notified} of ${to.length}`);

  // A silent alarm is the failure this route exists to prevent: if no email
  // went out, say so with a 500 so Vercel's cron view shows it red.
  return NextResponse.json({ ...body, notified }, { status: notified > 0 ? 200 : 500 });
}
