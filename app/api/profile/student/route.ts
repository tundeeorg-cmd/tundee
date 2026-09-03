/**
 * GET  /api/profile/student  — fetch own student_profile
 * POST /api/profile/student  — upsert own student_profile (including consent)
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  isMinor, BIRTH_YEAR_MIN, BIRTH_YEAR_MAX,
} from '@/lib/studentProfile';

// Imported, not redeclared. This file previously defined its own
// '2026-01-v1' while lib/research/consentGate.ts gated on '2026-07-v1', so
// consent written here could never satisfy isResearchConsented() — every
// consenting user would have been silently excluded from the research dataset.
import { CURRENT_CONSENT_VERSION } from '@/lib/research/consentGate';

/** Where the consent decision was captured (PREREG §12.4). */
const CONSENT_METHODS = ['signup_inline', 'profile_settings', 'line_optin'] as const;
type ConsentMethod = (typeof CONSENT_METHODS)[number];

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('student_profile')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[GET /api/profile/student] Postgres error:', error.code, error.message);
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // ── Validation (defense in depth — the DB CHECK constraints are authoritative,
  //    but a 422 with a clear message beats a raw Postgres error) ─────────────
  const birthYear = typeof body.birth_year === 'number' ? body.birth_year : null;
  if (birthYear !== null && (birthYear < BIRTH_YEAR_MIN || birthYear > BIRTH_YEAR_MAX)) {
    return NextResponse.json({ error: `birth_year must be between ${BIRTH_YEAR_MIN} and ${BIRTH_YEAR_MAX}` }, { status: 422 });
  }
  const gpa = typeof body.gpa === 'number' ? body.gpa : null;
  if (gpa !== null && (gpa < 0 || gpa > 4)) {
    return NextResponse.json({ error: 'gpa must be between 0 and 4' }, { status: 422 });
  }
  const monthlyIncome = typeof body.monthly_income_thb === 'number' ? body.monthly_income_thb : null;
  if (monthlyIncome !== null && monthlyIncome < 0) {
    return NextResponse.json({ error: 'monthly_income_thb must be ≥ 0' }, { status: 422 });
  }
  const householdSize = typeof body.household_size === 'number' ? body.household_size : null;
  if (householdSize !== null && (householdSize < 1 || householdSize > 30)) {
    return NextResponse.json({ error: 'household_size must be between 1 and 30' }, { status: 422 });
  }
  const classRankPct = typeof body.class_rank_pct === 'number' ? body.class_rank_pct : null;
  if (classRankPct !== null && (classRankPct < 0 || classRankPct > 100)) {
    return NextResponse.json({ error: 'class_rank_pct must be between 0 and 100' }, { status: 422 });
  }

  // ── Consent gating — ONLY gates consent_research itself. A minor without
  //    guardian consent can still save every other field; they just cannot
  //    turn research consent on. ────────────────────────────────────────────
  const minor = isMinor(birthYear);
  const consentResearch = body.consent_research === true;
  const guardianConsent = body.guardian_consent === true;
  if (minor && consentResearch && !guardianConsent) {
    return NextResponse.json(
      { error: 'guardian_consent is required before research consent can be enabled for users under 18' },
      { status: 422 },
    );
  }

  // Only stamp consent_at/consent_version when the consent decision actually
  // changes — this is the study's audit trail, not a "last edited" timestamp.
  //
  // The audit columns are selected too, not just the decision. They have to be
  // carried into the payload even when nothing changed; see below.
  const { data: existing, error: existingError } = await supabase
    .from('student_profile')
    .select('consent_research, consent_version, consent_at, consent_method')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existingError) {
    console.error('[POST /api/profile/student] pre-check Postgres error:', existingError.code, existingError.message);
  }
  const consentChanged = !existing || existing.consent_research !== consentResearch;

  // Validated against the closed set rather than trusted as free text; the
  // column's CHECK constraint would reject anything else anyway.
  const consentMethod: ConsentMethod =
    CONSENT_METHODS.includes(body.consent_method as ConsentMethod)
      ? (body.consent_method as ConsentMethod)
      : 'profile_settings';

  /**
   * The consent columns, always present in the payload when consent is on.
   *
   * student_profile_consent_auditable_check is:
   *
   *   CHECK (consent_research = FALSE
   *          OR (consent_version IS NOT NULL AND consent_at IS NOT NULL))
   *
   * The previous version omitted the audit columns entirely whenever the
   * decision had not changed, which made every repeat save by an already-
   * consenting student fail with 23514. A student who consented on 30 Aug and
   * finished the wizard again on 3 Sep hit it — the profile itself saved, then
   * this route 500'd, and because the caller treats that as non-fatal the
   * failure was invisible until client logging arrived.
   *
   * Either mechanism produces it and this covers both: Postgres evaluating the
   * CHECK against the proposed row before ON CONFLICT picks the update path,
   * or a legacy row carrying consent_research = true with null audit columns
   * from before v17 added them.
   *
   * Carrying the stored values forward rather than re-stamping keeps the audit
   * trail honest — consent_at still means "when they decided", not "when they
   * last pressed save". A stamp only happens when the decision actually
   * changed, or when consent is on and the trail is missing, which is the one
   * case where writing nothing would be both illegal and untrue.
   */
  const carriedVersion = typeof existing?.consent_version === 'string' ? existing.consent_version : null;
  const carriedAt      = typeof existing?.consent_at      === 'string' ? existing.consent_at      : null;
  const carriedMethod  = typeof existing?.consent_method  === 'string' ? existing.consent_method  : null;

  const mustStamp = consentChanged || (consentResearch && (!carriedVersion || !carriedAt));

  const consentColumns = mustStamp
    ? {
        consent_version: CURRENT_CONSENT_VERSION,
        consent_at:      new Date().toISOString(),
        consent_method:  consentMethod,
      }
    : {
        consent_version: carriedVersion,
        consent_at:      carriedAt,
        consent_method:  carriedMethod,
      };

  const preferredTypes = Array.isArray(body.preferred_scholarship_types)
    ? (body.preferred_scholarship_types as unknown[]).filter((v): v is string => typeof v === 'string')
    : null;

  const payload: Record<string, unknown> = {
    user_id:                     user.id,
    province:                    body.province             || null,
    area_type:                   body.area_type            || null,
    household_income_band:       body.household_income_band || null,
    welfare_card:                body.welfare_card         ?? false,
    school_type:                 body.school_type          || null,
    school_province:             body.school_province      || null,
    first_generation:            body.first_generation     ?? null,
    parent_education:            body.parent_education     || null,
    household_size:              householdSize,
    monthly_income_thb:          monthlyIncome,
    class_rank_pct:              classRankPct,
    disability_status:           body.disability_status    || null,
    gender:                      body.gender               || null,
    birth_year:                  birthYear,
    gpa,
    intended_level:              body.intended_level       || null,
    intended_field:              body.intended_field       || null,
    preferred_scholarship_types: preferredTypes,
    language_pref:               body.language_pref        || 'th',
    guardian_consent:            guardianConsent,
    consent_research:            consentResearch,
    ...consentColumns,
  };

  let { data, error } = await supabase
    .from('student_profile')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  // preferred_scholarship_types migration (scripts/20260719_v7_*.sql) may not
  // be applied yet on some environments — degrade gracefully instead of
  // blocking the whole save.
  if (error?.code === '42703') {
    delete payload.preferred_scholarship_types;
    ({ data, error } = await supabase
      .from('student_profile')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single());
  }

  if (error) {
    console.error('[POST /api/profile/student] Postgres error:', error.code, error.message);
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}
