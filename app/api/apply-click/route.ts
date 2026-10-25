/**
 * POST /api/apply-click — log an apply-link click (authenticated or anonymous).
 * Body: { scholarship_id: string }
 *
 * This table is the primary outcome of the trial (PREREG §6.1), so every row is
 * bound here, on the server, to the arm the student was in when they clicked:
 * the arm and its assignment time, the rank and fairness mode of the list they
 * clicked from (latest impression of this scholarship, within 24 h), and whether
 * the click counts towards the primary result. The client never supplies any of
 * it — a browser that can state its own arm can state a better one.
 * See lib/research/outcomeBinding.ts for the rule.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bindOutcome, type OutcomeBinding, type ProfileFacts, type ServedImpression } from '@/lib/research/outcomeBinding';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let body: { scholarship_id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { scholarship_id } = body;
  if (!scholarship_id) return NextResponse.json({ error: 'scholarship_id required' }, { status: 400 });

  const clickedAt = new Date();
  let profile: ProfileFacts | null = null;
  let impression: ServedImpression | null = null;
  let profileReadFailed = false;

  if (user) {
    // The service role, because the facts are read for the server's own use: the
    // student's row-level access to funnel_events is not what decides them.
    const admin = createAdminClient();
    if (!admin) {
      profileReadFailed = true;
      console.error('[apply-click] service role not configured — click recorded unbound');
    } else {
      const { data, error } = await admin
        .from('profiles')
        .select('ranking_variant, ranking_assigned_at, cohort')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        profileReadFailed = true;
        console.error('[apply-click] profile read failed — click recorded unbound:', error.message);
      } else {
        profile = (data as ProfileFacts | null) ?? null;
      }

      // Rank and mode are context, not the arm: a failure here costs the rank, not the
      // click and not the binding, and is logged rather than hidden.
      const { data: imp, error: impErr } = await admin
        .from('funnel_events')
        .select('occurred_at, context')
        .eq('user_id', user.id)
        .eq('scholarship_id', scholarship_id)
        .eq('event_type', 'impression')
        .lte('occurred_at', clickedAt.toISOString())
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (impErr) console.error('[apply-click] impression lookup failed — rank not recorded:', impErr.message);
      else impression = (imp as ServedImpression | null) ?? null;
    }
  }

  const binding: OutcomeBinding = bindOutcome({
    userId: user?.id ?? null,
    clickedAt,
    profile,
    profileReadFailed,
    impression,
  });

  const { error } = await supabase
    .from('apply_click')
    .insert({
      user_id: user?.id ?? null,
      scholarship_id,
      clicked_at: clickedAt.toISOString(),
      ...binding,
    });

  if (error) {
    console.error('[apply-click] insert failed:', error.code, error.message);
    return NextResponse.json({ error: 'apply_click_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
