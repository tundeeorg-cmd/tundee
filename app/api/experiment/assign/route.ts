/**
 * POST /api/experiment/assign — randomize a user into a ranking arm.
 *
 * Implements §4 of research/PREREGISTRATION.md (commit 4a3cc5b).
 *
 * Called once, at profile completion. Server-side because RANDOMIZATION_SALT
 * must never reach the browser: anyone holding the salt can compute every
 * user's arm. The previous implementation assigned client-side on the
 * /scholarships page, which is both the wrong moment and the wrong place.
 *
 * Idempotent by construction, at three layers:
 *   1. this route refuses to act when ranking_variant is already set
 *   2. the write is conditional on ranking_variant IS NULL
 *   3. trg_freeze_ranking_variant raises on any attempt to change it
 *
 * Pilot users (cohort = 'pilot') are never assigned. Assignment after
 * enrolment is not random assignment (§9.1), and a CHECK constraint refuses
 * the write regardless of what this route does.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ASSIGNMENT_ALGORITHM_VERSION,
  computeFairnessEligible,
  computeRankingVariant,
  randomizationSalt,
  recruitmentSourceFrom,
  stratumKey,
} from '@/lib/research/assignment';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  // utm_campaign is carried by the client from the landing page. It is
  // validated server-side against the closed set (§5.4) — an unrecognised or
  // absent value becomes 'organic', never a free-text passthrough.
  let utmCampaign: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.utm_campaign === 'string') utmCampaign = body.utm_campaign;
  } catch {
    // No body is fine: recruitment_source resolves to 'organic'.
  }

  const { data: profile, error: readErr } = await supabase
    .from('profiles')
    .select('id, province, income_bracket, cohort, ranking_variant, recruitment_source')
    .eq('id', user.id)
    .maybeSingle();

  if (readErr) {
    console.error('[assign] profile read failed:', readErr.message);
    return NextResponse.json({ error: 'profile_read_failed' }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });
  }

  // ── Already assigned — return it, do not recompute ────────────────────────
  if (profile.ranking_variant) {
    return NextResponse.json({
      ranking_variant: profile.ranking_variant,
      already_assigned: true,
    });
  }

  // ── Pilot cohort is never randomized (§9.1) ───────────────────────────────
  if (profile.cohort === 'pilot') {
    return NextResponse.json({
      ranking_variant: null,
      cohort: 'pilot',
      reason: 'pilot_cohort_not_randomized',
    });
  }

  // ── Randomization requires the stratum, so the profile must be complete ───
  if (!profile.province || profile.income_bracket == null) {
    return NextResponse.json(
      { error: 'profile_incomplete', missing: { province: !profile.province,
        income_bracket: profile.income_bracket == null } },
      { status: 409 },
    );
  }

  let variant: string;
  try {
    variant = computeRankingVariant(
      user.id,
      stratumKey(profile.province, profile.income_bracket),
      randomizationSalt(),
    );
  } catch (err) {
    // A missing or weak salt must stop assignment loudly. Assigning with a
    // default would silently produce a non-reproducible arm.
    console.error('[assign] salt unavailable:', (err as Error).message);
    return NextResponse.json({ error: 'randomization_unavailable' }, { status: 503 });
  }

  // Eligibility is a property of the person and is recorded for BOTH arms
  // (§5.5). A baseline-arm user who is eligible still receives an unmodified
  // ranking; the flag is what makes that comparison analysable.
  const fairnessEligible = computeFairnessEligible(
    profile.province,
    profile.income_bracket,
  );

  const update: Record<string, unknown> = {
    ranking_variant:              variant,
    ranking_assigned_at:          new Date().toISOString(),
    assignment_algorithm_version: ASSIGNMENT_ALGORITHM_VERSION,
    fairness_eligible:            fairnessEligible,
  };

  // Only stamp recruitment_source on first assignment, so a later visit with a
  // different UTM cannot rewrite how the user was originally reached.
  if (!profile.recruitment_source) {
    update.recruitment_source = recruitmentSourceFrom(utmCampaign);
  }

  const { error: writeErr } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .is('ranking_variant', null);   // lost race → no-op, never an overwrite

  if (writeErr) {
    console.error('[assign] write failed:', writeErr.code, writeErr.message);
    return NextResponse.json({ error: 'assignment_write_failed' }, { status: 500 });
  }

  return NextResponse.json({
    ranking_variant:   variant,
    fairness_eligible: fairnessEligible,
    already_assigned:  false,
  });
}
