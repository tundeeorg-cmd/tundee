/**
 * GET /api/admin/analytics — everything the admin dashboard's Analytics tab shows.
 *
 * These reads used to be made from the BROWSER with the signed-in user's session. That
 * had two costs. The admin_* views were therefore readable by every signed-in user and,
 * because views run with their owner's rights, by anyone holding the public anon key —
 * they could not be locked without breaking the page. And the profile and research
 * counts below went through row-level security, so an admin could be shown figures for
 * their own row only.
 *
 * Now the server reads them with the service role, after checking the caller is the
 * admin (NEXT_PUBLIC_ADMIN_EMAIL, as every other admin route does), and the views are
 * locked to the service role by scripts/20261031_v32_lock_admin_views.sql.
 *
 * Counts and aggregates, and the twenty newest sign-ups (name, province, GPA, welfare
 * card) the page has always listed. Nothing is split by ranking_variant or ab_arm:
 * PREREG §8 forbids outcome-by-arm interfaces before the stopping point.
 *
 * A read that fails is reported in `errors`, never turned into a quiet zero.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Result<T> = { data: T | null; error: { message: string } | null; count?: number | null };

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!adminEmail || user.email !== adminEmail) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createAdminClient();
  if (!db) {
    console.error('[admin/analytics] service role not configured');
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  const errors: string[] = [];
  const take = <T>(label: string, res: Result<T>): T | null => {
    if (res.error) {
      console.error(`[admin/analytics] ${label} failed:`, res.error.message);
      errors.push(label);
      return null;
    }
    return res.data;
  };

  const [summary, signups, active, top, provinces, recent] = await Promise.all([
    db.from('admin_summary').select('*').maybeSingle(),
    db.from('admin_daily_signups').select('*'),
    db.from('admin_daily_active').select('*'),
    db.from('admin_top_scholarships').select('*').limit(10),
    db.from('admin_province_stats').select('*').limit(15),
    db.from('profiles')
      .select('id, display_name, province, gpa, welfare_card, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const [events, outcomes, prior, recruit] = await Promise.all([
    db.from('user_events').select('*', { count: 'exact', head: true }),
    db.from('recommendations').select('*', { count: 'exact', head: true }).eq('led_to_application', true),
    db.from('profiles').select('*', { count: 'exact', head: true }).not('prior_scholarship_knowledge', 'is', null),
    db.from('profiles').select('recruitment_source').not('recruitment_source', 'is', null),
  ]);

  for (const [label, r] of [['events', events], ['outcomes', outcomes], ['prior_knowledge', prior], ['recruitment', recruit]] as const) {
    if (r.error) { console.error(`[admin/analytics] ${label} failed:`, r.error.message); errors.push(label); }
  }

  const sourceMap = new Map<string, number>();
  for (const row of (recruit.data ?? []) as { recruitment_source: string | null }[]) {
    const src = row.recruitment_source || 'unknown';
    sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
  }

  return NextResponse.json({
    summary:   take('summary', summary as Result<Record<string, number>>),
    signups:   take('signups', signups as Result<unknown[]>) ?? [],
    active:    take('active', active as Result<unknown[]>) ?? [],
    top:       take('top', top as Result<unknown[]>) ?? [],
    provinces: take('provinces', provinces as Result<unknown[]>) ?? [],
    recent:    take('recent', recent as Result<unknown[]>) ?? [],
    research: {
      events:       events.count ?? 0,
      outcomes:     outcomes.count ?? 0,
      priorKnowledge: prior.count ?? 0,
      recruitmentSources: Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
    },
    errors,
  });
}
