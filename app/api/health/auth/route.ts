/**
 * GET /api/health/auth — did the people who signed up this week actually get in?
 *
 * LINE sign-in was broken for three weeks (6–20 Oct 2026): an auth user was
 * created and never given a session, and nothing said so. Vercel's Hobby plan
 * keeps runtime logs for about half an hour, so a log line cannot be the alarm.
 * This counts the consequence instead — accounts created in the window that
 * never signed in — and can be polled by anything that holds CRON_SECRET.
 *
 * Counts only. No ids, emails or names leave this route.
 *
 *   created     auth users created in the last 7 days
 *   signed_in   of those, how many have a last_sign_in_at
 *   with_profile of those, how many have a public.profiles row
 *   alert       true when a provider has 3+ new accounts and none has signed in,
 *               or any new account has no profile
 *
 * LINE accounts that never signed in are the thing this exists for, so they are
 * also reported separately and across all time (line_never_signed_in_total).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { providerOf } from '@/lib/auth/adminUsers';

const WINDOW_DAYS = 7;
const PER_PAGE = 200;
const MAX_PAGES = 50;

type Provider = 'google' | 'line' | 'password';
interface Bucket { created: number; signed_in: number; with_profile: number }

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('[auth/health] service role not configured');
    return NextResponse.json({ error: 'Missing SUPABASE env vars' }, { status: 500 });
  }

  const since = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recent: { id: string; provider: Provider; signedIn: boolean }[] = [];
  let lineNeverSignedIn = 0;
  let total = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error('[auth/health] listUsers failed:', error.message);
      return NextResponse.json({ error: 'listUsers failed' }, { status: 500 });
    }
    for (const u of data.users) {
      total++;
      const provider = providerOf(u);
      if (provider === 'line' && !u.last_sign_in_at) lineNeverSignedIn++;
      if (new Date(u.created_at).getTime() >= since) {
        recent.push({ id: u.id, provider, signedIn: !!u.last_sign_in_at });
      }
    }
    if (data.users.length < PER_PAGE) break;
    if (page === MAX_PAGES) console.warn(`[auth/health] stopped after ${MAX_PAGES} pages; counts are partial`);
  }

  const withProfile = new Set<string>();
  const ids = recent.map(r => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from('profiles').select('id').in('id', ids.slice(i, i + 200));
    if (error) {
      console.error('[auth/health] profiles query failed:', error.message);
      return NextResponse.json({ error: 'profiles query failed' }, { status: 500 });
    }
    for (const row of data ?? []) withProfile.add(row.id as string);
  }

  const by_provider: Record<Provider, Bucket> = {
    google:   { created: 0, signed_in: 0, with_profile: 0 },
    line:     { created: 0, signed_in: 0, with_profile: 0 },
    password: { created: 0, signed_in: 0, with_profile: 0 },
  };
  for (const r of recent) {
    const b = by_provider[r.provider];
    b.created++;
    if (r.signedIn) b.signed_in++;
    if (withProfile.has(r.id)) b.with_profile++;
  }

  const alert =
    Object.values(by_provider).some(b => b.created >= 3 && b.signed_in === 0) ||
    Object.values(by_provider).some(b => b.with_profile < b.created);

  if (alert) console.error('[auth/health] ALERT', JSON.stringify(by_provider));

  return NextResponse.json({
    window_days: WINDOW_DAYS,
    total_users: total,
    by_provider,
    line_never_signed_in_total: lineNeverSignedIn,
    alert,
  });
}
