/**
 * POST /api/recommend
 *
 * Server-side recommendation endpoint. Fetches the student's profile and all
 * displayed scholarships, runs the three-stage pipeline, and returns ranked results.
 *
 * The fairness_mode is determined by the caller's experiment variant:
 *   variant = "control"   → fairness_mode = "off"  (base ranking)
 *   variant = "treatment" → fairness_mode = "on"   (fairness-aware re-ranking)
 *
 * Callers should log impressions after receiving the response (rank, score,
 * fairness_mode, variant are included per item).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient }     from '@/lib/supabase/server';
import { createClient }                   from '@supabase/supabase-js';
import { recommend }                      from '@/lib/recommender/recommend';
import type { RecommenderProfile, FairnessMode } from '@/lib/recommender/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedLimit = Math.min(Number(body.limit ?? 20), 50);

  // Fetch profiles row (grade_level, income_bracket, gpa, etc.)
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('province_id, income_bracket, gpa, grade_level, fields_of_interest, welfare_card')
    .eq('id', user.id)
    .maybeSingle();

  // Fetch student_profile (enriched protected attributes)
  const { data: studentProfile } = await supabase
    .from('student_profile')
    .select('region, area_type, household_income_band, intended_level, intended_field')
    .eq('user_id', user.id)
    .maybeSingle();

  // Fetch experiment variant from experiment_assignment
  const { data: experimentRow } = await supabase
    .from('experiment_assignment')
    .select('variant')
    .eq('user_id', user.id)
    .eq('experiment_key', 'ranking')
    .maybeSingle();

  const variant     = (experimentRow?.variant as string | null) ?? 'control';
  const fairnessMode: FairnessMode = variant === 'treatment' ? 'on' : 'off';

  // Build merged recommender profile (graceful defaults for incomplete profiles)
  const profile: RecommenderProfile = {
    user_id:               user.id,
    province_id:           profileRow?.province_id ?? '',
    income_bracket:        Number(profileRow?.income_bracket ?? 4),
    gpa:                   parseFloat(String(profileRow?.gpa ?? '3.0')),
    grade_level:           profileRow?.grade_level ?? '',
    fields_of_interest:    (profileRow?.fields_of_interest as string[] | null) ?? [],
    welfare_card:          Boolean(profileRow?.welfare_card),
    region:                studentProfile?.region ?? null,
    area_type:             (studentProfile?.area_type as 'urban' | 'peri_urban' | 'rural' | null) ?? null,
    household_income_band: studentProfile?.household_income_band ?? null,
    intended_level:        studentProfile?.intended_level ?? null,
    intended_field:        studentProfile?.intended_field ?? null,
  };

  // Fetch all currently displayable scholarships (service role bypasses RLS for full set)
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: scholarships, error: schError } = await db
    .from('td_scholarships')
    .select('*')
    .eq('is_displayed', true)
    .eq('status', 'Open');

  if (schError) {
    return NextResponse.json({ error: schError.message }, { status: 500 });
  }

  // Run the three-stage pipeline
  const result = recommend(
    scholarships ?? [],
    profile,
    { fairness_mode: fairnessMode, variant, limit: requestedLimit },
  );

  // Shape the response — strip the full scholarship blob to keep payload small;
  // include only fields the client needs to render + track
  const items = result.items.map(item => ({
    scholarship_id:   item.scholarship.scholarship_id,
    rank:             item.rank,
    raw_score:        item.raw_score,
    fairness_score:   item.fairness_score,
    final_score:      item.final_score,
    fairness_boosted: item.fairness_boosted,
    protected_group:  item.protected_group,
    reasons:          item.reasons,
    reasons_en:       item.reasons_en,
    explanation:      item.explanation,
    explanation_en:   item.explanation_en,
    // Minimal scholarship display fields
    scholarship_name: item.scholarship.scholarship_name,
    funder:           item.scholarship.funder,
    award_amount_thb: item.scholarship.award_amount_thb,
    deadline_date:    item.scholarship.deadline_date,
    application_link: item.scholarship.application_link,
  }));

  return NextResponse.json({
    items,
    fairness_mode:   result.fairness_mode,
    variant:         result.variant,
    candidate_count: result.candidate_count,
    protected_group: result.protected_group,
  });
}
