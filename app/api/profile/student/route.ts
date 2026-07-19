/**
 * GET  /api/profile/student  — fetch own student_profile
 * POST /api/profile/student  — upsert own student_profile (including consent)
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const CURRENT_CONSENT_VERSION = '2026-01-v1';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('student_profile')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Validate consent — required before storing sensitive fields
  const consentResearch = body.consent_research === true;

  // Derive age to check if guardian consent is needed
  const birthYear = typeof body.birth_year === 'number' ? body.birth_year : null;
  const currentYear = new Date().getFullYear();
  const isMinor = birthYear !== null && (currentYear - birthYear) < 18;
  if (isMinor && !body.guardian_consent) {
    return NextResponse.json(
      { error: 'guardian_consent required for users under 18' },
      { status: 422 },
    );
  }

  const payload: Record<string, unknown> = {
    user_id:              user.id,
    province:             body.province             ?? null,
    area_type:            body.area_type            ?? null,
    household_income_band: body.household_income_band ?? null,
    welfare_card:         body.welfare_card         ?? null,
    school_type:          body.school_type          ?? null,
    first_generation:     body.first_generation     ?? null,
    gender:               body.gender               ?? null,
    birth_year:           birthYear,
    gpa:                  body.gpa                  ?? null,
    intended_level:       body.intended_level       ?? null,
    intended_field:       body.intended_field       ?? null,
    language_pref:        body.language_pref        ?? 'th',
    guardian_consent:     isMinor ? (body.guardian_consent ?? null) : null,
    // Consent fields — only update if user is actively consenting
    ...(consentResearch ? {
      consent_research: true,
      consent_version:  CURRENT_CONSENT_VERSION,
      consent_at:       new Date().toISOString(),
    } : {}),
    // Support explicit opt-out
    ...(body.consent_research === false ? { consent_research: false } : {}),
  };

  const { data, error } = await supabase
    .from('student_profile')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
