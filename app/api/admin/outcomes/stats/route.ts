/**
 * GET /api/admin/outcomes/stats
 * Summary tiles for /admin → Awards: accounts, completed profiles, apply-clicks,
 * awarded count, total THB awarded, and award rate (awarded ÷ apply-clicks).
 *
 * Counts use head:true so no rows cross the wire; only the THB sum needs
 * actual values.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin/auth';
import { awardRate, profileCompletionRate, type AwardStats } from '@/lib/admin/awards';

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // `profiles` is NOT the signup count. A profile row is written only when onboarding
  // completes (app/profile/page.tsx) or the preview shortcut fills it in
  // (app/auth/callback/route.ts) — there is no trigger on auth.users. Counting profiles
  // and calling it "Signups" hid 32 of 62 accounts.
  const [profiles, accounts, clicks, awarded, amounts] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    // auth.users is not reachable through PostgREST, so the count comes from the GoTrue
    // admin API. perPage: 1 because only `total` is wanted — one user record crosses the
    // wire instead of all of them, which matters when the rows are minors' accounts.
    db.auth.admin.listUsers({ page: 1, perPage: 1 }),
    db.from('apply_click').select('id', { count: 'exact', head: true }),
    db.from('outcomes').select('id', { count: 'exact', head: true }).eq('status', 'awarded'),
    db.from('outcomes').select('amount_thb').eq('status', 'awarded').not('amount_thb', 'is', null),
  ]);

  const firstError = [profiles, accounts, clicks, awarded, amounts].find(r => r.error)?.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const totalThb = ((amounts.data ?? []) as { amount_thb: number | null }[])
    .reduce((sum, r) => sum + (r.amount_thb ?? 0), 0);

  const totalApplyClicks = clicks.count ?? 0;
  const totalAwarded     = awarded.count ?? 0;
  const totalProfiles    = profiles.count ?? 0;
  // `total` is part of GoTrue's pagination payload but is not on the typed surface.
  const totalAccounts    = Number((accounts.data as { total?: number } | null)?.total ?? 0);

  const stats: AwardStats = {
    total_accounts:          totalAccounts,
    total_profiles:          totalProfiles,
    profile_completion_rate: profileCompletionRate(totalProfiles, totalAccounts),
    total_apply_clicks:      totalApplyClicks,
    total_awarded:           totalAwarded,
    total_thb_awarded:       totalThb,
    award_rate:              awardRate(totalAwarded, totalApplyClicks),
  };

  return NextResponse.json(stats);
}
