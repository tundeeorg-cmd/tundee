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
 *
 * THREE CASES
 *   signed in                    bound to profiles (bindOutcome), as before.
 *   not signed in, tundee_anon   bound to anon_assignments (bindAnonOutcome), with the
 *     cookie of a randomized     rank from anon_impressions, anon_id on the row
 *     visitor                    (v38). If that assignment was already claimed by an
 *                                account, the account's arm and user_id are used —
 *                                the account wins, as at the merge.
 *   anyone else                  kept, never in the primary result.
 *
 * Every site page calls this through lib/analytics/applyClick (the /start results,
 * the scholarship page, the tracker), so a funder click from a browser with an
 * anonymous assignment counts wherever it happens.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  bindAnonOutcome, bindOutcome,
  type AnonFacts, type OutcomeBinding, type ProfileFacts, type ServedImpression,
} from '@/lib/research/outcomeBinding';
import { anonRandomizationEnabled, anonLogTag } from '@/lib/research/anonAssignment';
import { anonIdFromRequest } from '@/lib/research/anonRequest';
import { isMissingColumn } from '@/lib/research/anonStore';
import { latestAnonImpression } from '@/lib/research/anonImpressions';
import { CURRENT_CONSENT_VERSION } from '@/lib/research/consentGate';

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function readProfile(admin: Admin, userId: string): Promise<{ profile: ProfileFacts | null; failed: boolean }> {
  const { data, error } = await admin
    .from('profiles')
    .select('ranking_variant, ranking_assigned_at, cohort')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[apply-click] profile read failed — click recorded unbound:', error.message);
    return { profile: null, failed: true };
  }
  return { profile: (data as ProfileFacts | null) ?? null, failed: false };
}

async function latestProfileImpression(admin: Admin, userId: string, scholarshipId: string, clickedAt: Date): Promise<ServedImpression | null> {
  // Rank and mode are context, not the arm: a failure here costs the rank, not the
  // click and not the binding, and is logged rather than hidden.
  const { data: imp, error: impErr } = await admin
    .from('funnel_events')
    .select('occurred_at, context')
    .eq('user_id', userId)
    .eq('scholarship_id', scholarshipId)
    .eq('event_type', 'impression')
    .lte('occurred_at', clickedAt.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (impErr) {
    console.error('[apply-click] impression lookup failed — rank not recorded:', impErr.message);
    return null;
  }
  return (imp as ServedImpression | null) ?? null;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let body: { scholarship_id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { scholarship_id } = body;
  if (!scholarship_id || typeof scholarship_id !== 'string') {
    return NextResponse.json({ error: 'scholarship_id required' }, { status: 400 });
  }

  const clickedAt = new Date();
  let binding: OutcomeBinding;
  let userId: string | null = user?.id ?? null;
  let anonId: string | null = null;

  // The service role, because the facts are read for the server's own use: the
  // student's row-level access to funnel_events is not what decides them.
  const admin = createAdminClient();

  if (user) {
    let profile: ProfileFacts | null = null;
    let profileReadFailed = false;
    let impression: ServedImpression | null = null;
    if (!admin) {
      profileReadFailed = true;
      console.error('[apply-click] service role not configured — click recorded unbound');
    } else {
      ({ profile, failed: profileReadFailed } = await readProfile(admin, user.id));
      impression = await latestProfileImpression(admin, user.id, scholarship_id, clickedAt);
    }
    binding = bindOutcome({ userId: user.id, clickedAt, profile, profileReadFailed, impression });
  } else {
    const cookieAnon = anonRandomizationEnabled() ? anonIdFromRequest(request) : null;

    if (cookieAnon && admin) {
      const { data, error } = await admin
        .from('anon_assignments')
        .select('ranking_variant, ranking_assigned_at, research_consent_version, research_consented_at, claimed_by')
        .eq('anon_id', cookieAnon)
        .maybeSingle();
      const anon = (data as (AnonFacts & { claimed_by: string | null }) | null) ?? null;

      if (error) {
        console.error('[apply-click] anonymous assignment read failed — click recorded unbound:', error.message);
        binding = bindAnonOutcome({ clickedAt, anon: null, anonReadFailed: true, impression: null, currentConsentVersion: CURRENT_CONSENT_VERSION });
      } else if (!anon) {
        // A cookie with no assignment (cleared table, another environment): not a participant.
        binding = bindOutcome({ userId: null, clickedAt, profile: null, impression: null });
      } else {
        anonId = cookieAnon;
        const impression = await latestAnonImpression(admin, cookieAnon, scholarship_id, clickedAt);
        if (anon.claimed_by) {
          // Merged into an account and now signed out: the account's arm wins, as at the merge.
          userId = anon.claimed_by;
          const { profile, failed } = await readProfile(admin, anon.claimed_by);
          binding = bindOutcome({ userId: anon.claimed_by, clickedAt, profile, profileReadFailed: failed, impression });
        } else {
          binding = bindAnonOutcome({ clickedAt, anon, impression, currentConsentVersion: CURRENT_CONSENT_VERSION });
        }
      }
    } else {
      if (cookieAnon && !admin) console.error('[apply-click] service role not configured — anonymous click recorded unbound');
      binding = bindOutcome({ userId: null, clickedAt, profile: null, impression: null });
    }
  }

  const row = {
    user_id: userId,
    scholarship_id,
    clicked_at: clickedAt.toISOString(),
    ...binding,
  };

  // anon_id may only be written by the service role (trigger in v38_2); every other
  // row keeps the user's own client, exactly as before.
  let error: { code?: string; message: string } | null;
  if (anonId && admin) {
    ({ error } = await admin.from('apply_click').insert({ ...row, anon_id: anonId }));
    if (error && isMissingColumn(error)) {
      console.error('[apply-click] apply_click.anon_id missing — run scripts/20261122_v38_2; click stored without it', { anon: anonLogTag(anonId) });
      ({ error } = await admin.from('apply_click').insert(row));
    }
  } else {
    ({ error } = await supabase.from('apply_click').insert(row));
  }

  if (error) {
    console.error('[apply-click] insert failed:', error.code, error.message);
    return NextResponse.json({ error: 'apply_click_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
