/**
 * GET /api/research/export
 * Admin-only NDJSON export of pseudonymised funnel_events + student_profile data.
 *
 * PDPA compliance:
 *   - Only students whose consent is to the CURRENT wording (CURRENT_CONSENT_VERSION),
 *     and, for a minor whose birth_year is known, whose guardian also consented —
 *     exportExclusion() in lib/research/consentGate.ts, the one test shared by every
 *     gate. `consent_research = TRUE` alone is not enough: that let through students
 *     who agreed to superseded wording.
 *   - user_id replaced by stable SHA-256 hash (pseudonymous_id)
 *   - No PII: no name, email, phone, LINE id
 *   - Reads funnel_events and student_profile directly; it does NOT use the SQL
 *     views (v_research_export and friends), which still gate on consent_research
 *     alone — see the note in research/PROPOSAL-2026-10-minors-and-consent.md.
 *   - Every excluded row is COUNTED by reason in the X-Excluded-* response headers,
 *     so an export that quietly shrinks is visible.
 *
 * THE ARM. Each row carries the arm the student was in AT THE TIME of the event, from
 * profiles.ranking_variant (the randomization, PREREG §5.6) — never from the legacy
 * experiment_assignment table, which is pilot-era, was driven by a different hash and
 * agreed with the real assignment only at chance. The rule is the one apply_click uses
 * (lib/research/outcomeBinding.ts): an event at or after ranking_assigned_at by a
 * randomized main-cohort student carries the arm; every other event — before the
 * assignment, never randomized, pilot — has ranking_variant null and
 * excluded_from_primary true. Nothing is dropped.
 *
 * This is an extract an administrator downloads on purpose. It computes and shows no
 * rate, but it makes arm-level analysis possible, so PREREG §8 applies to whoever
 * opens it: no outcome analysis by arm before the registered stopping point. Each
 * request that is served is logged ([research/export]) so the extract is a decision on
 * the record, not a habit.
 *
 * Requires: ADMIN_EMAILS env var (comma-separated) to gate access.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient }               from '@supabase/supabase-js';
import crypto                         from 'crypto';
import { CURRENT_CONSENT_VERSION, exportExclusion, type ExportExclusion } from '@/lib/research/consentGate';
import { bindOutcome, type ProfileFacts } from '@/lib/research/outcomeBinding';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean);

function pseudonymise(userId: string): string {
  return crypto.createHash('sha256').update(userId).digest('hex');
}

export async function GET(request: NextRequest) {
  // Auth check
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since');    // ISO date, optional
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10000', 10), 50_000);

  // Service role to bypass RLS (view already enforces consent filter)
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let query = db
    .from('funnel_events')
    .select(`
      user_id,
      session_id,
      scholarship_id,
      event_type,
      context,
      occurred_at,
      student_profile!user_id (
        region, area_type, household_income_band, welfare_card,
        school_type, first_generation, birth_year, gpa,
        intended_level, intended_field, consent_research, consent_version, guardian_consent
      )
    `)
    .not('user_id', 'is', null)
    .order('occurred_at', { ascending: true })
    .limit(limit);

  if (since) query = query.gte('occurred_at', since);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter to students whose consent covers this export, and pseudonymise.
  type Row = typeof data extends (infer R)[] | null ? R : never;
  type Sp = Parameters<typeof exportExclusion>[0];
  const excluded: Record<ExportExclusion, number> = {
    no_student_profile: 0, no_research_consent: 0, stale_consent_version: 0, minor_without_guardian: 0,
  };
  const exportable = (data ?? []).filter((row: Row) => {
    const why = exportExclusion(row.student_profile as unknown as Sp);
    if (why) { excluded[why]++; return false; }
    return true;
  });

  // The arm lives on profiles. Read only for the students that are actually exported;
  // a failure is an error, never an export with the arm column quietly empty.
  const ids = Array.from(new Set(exportable.map((r: Row) => r.user_id as string)));
  const profiles = new Map<string, ProfileFacts & {
    assignment_algorithm_version: string | null; fairness_eligible: boolean | null;
    region_group: string | null; income_bracket: number | null;
  }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows, error: pErr } = await db
      .from('profiles')
      .select('id, cohort, ranking_variant, ranking_assigned_at, assignment_algorithm_version, fairness_eligible, region_group, income_bracket')
      .in('id', ids.slice(i, i + 200));
    if (pErr) {
      console.error('[research/export] profiles read failed:', pErr.message);
      return NextResponse.json({ error: 'profiles_read_failed' }, { status: 500 });
    }
    for (const p of (rows ?? []) as unknown as Array<{ id: string } & ProfileFacts & {
      assignment_algorithm_version: string | null; fairness_eligible: boolean | null;
      region_group: string | null; income_bracket: number | null;
    }>) profiles.set(p.id, p);
  }

  const lines = exportable
    .map((row: Row) => {
      const sp = row.student_profile as unknown as Record<string, unknown> | null;
      const profile = profiles.get(row.user_id as string) ?? null;
      const arm = bindOutcome({
        userId: row.user_id as string,
        clickedAt: new Date(row.occurred_at as string),
        profile,
        impression: null,
      });

      return JSON.stringify({
        pseudo_user_id:        pseudonymise(row.user_id as string),
        session_id:            row.session_id,
        scholarship_id:        row.scholarship_id,
        event_type:            row.event_type,
        context:               row.context,
        occurred_at:           row.occurred_at,
        // Protected attributes — no PII
        region:                sp?.region ?? null,
        area_type:             sp?.area_type ?? null,
        household_income_band: sp?.household_income_band ?? null,
        welfare_card:          sp?.welfare_card ?? null,
        school_type:           sp?.school_type ?? null,
        first_generation:      sp?.first_generation ?? null,
        birth_year:            sp?.birth_year ?? null,
        gpa:                   sp?.gpa ?? null,
        intended_level:        sp?.intended_level ?? null,
        intended_field:        sp?.intended_field ?? null,
        // The arm AT THE TIME OF THE EVENT (see the header comment), and what it rests on.
        ranking_variant:       arm.ranking_variant,
        ranking_assigned_at:   arm.ranking_assigned_at,
        excluded_from_primary: arm.excluded_from_primary,
        cohort:                profile?.cohort ?? null,
        assignment_algorithm_version: profile?.assignment_algorithm_version ?? null,
        fairness_eligible:     profile?.fairness_eligible ?? null,
        region_group:          profile?.region_group ?? null,
        income_bracket:        profile?.income_bracket ?? null,
      });
    });

  console.info('[research/export] served', {
    by: user.email, rows: lines.length, since: since ?? null,
    excluded: excluded,
  });

  // Stream as NDJSON (easy to parse with pandas: pd.read_json(..., lines=True))
  return new NextResponse(lines.join('\n') + '\n', {
    headers: {
      'Content-Type':        'application/x-ndjson',
      'Content-Disposition': `attachment; filename="tundee_research_${new Date().toISOString().slice(0,10)}.ndjson"`,
      'X-Record-Count':      String(lines.length),
      'X-Export-Basis':      'PDPA-2562-consent',
      'X-Consent-Version':   CURRENT_CONSENT_VERSION,
      'X-Arm-Source':        'profiles.ranking_variant as of the event; null before assignment',
      'X-Excluded-No-Student-Profile':   String(excluded.no_student_profile),
      'X-Excluded-No-Consent':           String(excluded.no_research_consent),
      'X-Excluded-Stale-Consent':        String(excluded.stale_consent_version),
      'X-Excluded-Minor-No-Guardian':    String(excluded.minor_without_guardian),
    },
  });
}
