/**
 * GET /api/admin/outcomes/stats
 * Summary tiles for /admin → Awards: signups, apply-clicks, awarded count,
 * total THB awarded, and award rate (awarded ÷ apply-clicks).
 *
 * Counts use head:true so no rows cross the wire; only the THB sum needs
 * actual values.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin/auth';
import { awardRate, type AwardStats } from '@/lib/admin/awards';

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [signups, clicks, awarded, amounts] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('apply_click').select('id', { count: 'exact', head: true }),
    db.from('outcomes').select('id', { count: 'exact', head: true }).eq('status', 'awarded'),
    db.from('outcomes').select('amount_thb').eq('status', 'awarded').not('amount_thb', 'is', null),
  ]);

  const firstError = [signups, clicks, awarded, amounts].find(r => r.error)?.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const totalThb = ((amounts.data ?? []) as { amount_thb: number | null }[])
    .reduce((sum, r) => sum + (r.amount_thb ?? 0), 0);

  const totalApplyClicks = clicks.count ?? 0;
  const totalAwarded     = awarded.count ?? 0;

  const stats: AwardStats = {
    total_signups:      signups.count ?? 0,
    total_apply_clicks: totalApplyClicks,
    total_awarded:      totalAwarded,
    total_thb_awarded:  totalThb,
    award_rate:         awardRate(totalAwarded, totalApplyClicks),
  };

  return NextResponse.json(stats);
}
