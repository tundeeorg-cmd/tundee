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
 * ANONYMOUS PARTICIPANTS (v38). `?scope=anon` emits the visitors randomized on /start
 * who never signed in: one `participant` line each (arm, stratum, consent, the
 * covariates stored at assignment) plus their `impression` and `apply_click` lines,
 * under pseudo_anon_id = sha256(anon_id). Same consent gate (current wording). A
 * participant claimed by an account is emitted once, under the account, not here.
 * See lib/research/anonExport.ts and research/ANALYSIS-DATA-DICTIONARY.md.
 *
 * Requires: ADMIN_EMAILS env var (comma-separated) to gate access.
 */

export const runtime = 'nodejs';

import { isTeamAccount } from '@/lib/research/teamAccounts';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient }               from '@supabase/supabase-js';
import crypto                         from 'crypto';
import { CURRENT_CONSENT_VERSION, exportExclusion, type ExportExclusion } from '@/lib/research/consentGate';
import { bindOutcome, type ProfileFacts } from '@/lib/research/outcomeBinding';
import {
  buildAnonExport,
  type AnonClickExportRow, type AnonImpressionExportRow, type AnonParticipantRow,
} from '@/lib/research/anonExport';
import { ANON_COVARIATE_COLUMNS } from '@/lib/research/anonCovariates';
import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE = 1000;
const IN_CHUNK = 200;

/** Every row of a query, page by page; an error is returned, never a short result. */
async function readAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return { rows, error: null };
  }
}

async function exportAnonymous(db: SupabaseClient, by: string, since: string | null): Promise<NextResponse> {
  const participantCols = [
    'anon_id', 'ranking_variant', 'ranking_assigned_at', 'assignment_algorithm_version', 'stratum',
    'fairness_eligible', 'research_consent_version', 'research_consented_at', 'claimed_by',
    ...ANON_COVARIATE_COLUMNS,
  ].join(', ');
  const parts = await readAll<AnonParticipantRow>((from, to) => {
    let q = db.from('anon_assignments').select(participantCols).order('ranking_assigned_at', { ascending: true }).range(from, to);
    if (since) q = q.gte('ranking_assigned_at', since);
    return q;
  });
  if (parts.error) {
    console.error('[research/export] anon_assignments read failed:', parts.error);
    return NextResponse.json({ error: 'anon_assignments_read_failed' }, { status: 500 });
  }

  const ids = parts.rows.map(p => p.anon_id);
  const impressions: AnonImpressionExportRow[] = [];
  const clicks: AnonClickExportRow[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const imp = await readAll<AnonImpressionExportRow>((from, to) => db
      .from('anon_impressions')
      .select('anon_id, scholarship_id, rank, fairness_mode, variant, broadened, served_at')
      .in('anon_id', chunk).order('served_at', { ascending: true }).range(from, to));
    if (imp.error) {
      console.error('[research/export] anon_impressions read failed:', imp.error);
      return NextResponse.json({ error: 'anon_impressions_read_failed' }, { status: 500 });
    }
    impressions.push(...imp.rows);
    const clk = await readAll<AnonClickExportRow>((from, to) => db
      .from('apply_click')
      .select('anon_id, scholarship_id, clicked_at, ranking_variant, ranking_assigned_at, rank_position, was_personalized, served_fairness_mode, excluded_from_primary, binding_source')
      .in('anon_id', chunk).order('clicked_at', { ascending: true }).range(from, to));
    if (clk.error) {
      console.error('[research/export] apply_click read failed:', clk.error);
      return NextResponse.json({ error: 'apply_click_read_failed' }, { status: 500 });
    }
    clicks.push(...clk.rows);
  }

  const out = buildAnonExport({ participants: parts.rows, impressions, clicks, currentConsentVersion: CURRENT_CONSENT_VERSION });
  console.info('[research/export] served (anonymous)', {
    by, participants: out.participants, rows: out.lines.length, since, excluded: out.excluded,
  });

  return new NextResponse(out.lines.join('\n') + (out.lines.length ? '\n' : ''), {
    headers: {
      'Content-Type':        'application/x-ndjson',
      'Content-Disposition': `attachment; filename="tundee_research_anon_${new Date().toISOString().slice(0,10)}.ndjson"`,
      'X-Record-Count':      String(out.lines.length),
      'X-Participant-Count': String(out.participants),
      'X-Export-Basis':      'PDPA-2562-consent',
      'X-Consent-Version':   CURRENT_CONSENT_VERSION,
      'X-Arm-Source':        'anon_assignments.ranking_variant; clicks bound at click time (bindAnonOutcome)',
      'X-Excluded-Stale-Consent':     String(out.excluded.stale_consent_version),
      'X-Excluded-Claimed-By-Account': String(out.excluded.claimed_by_account),
      'X-Excluded-Test-Participant':   String(out.excluded.test_participant),
    },
  });
}

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

  if (searchParams.get('scope') === 'anon') return exportAnonymous(db, user.email ?? '', since);

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
  let teamAccountRows = 0;
  const exportable = (data ?? []).filter((row: Row) => {
    // The team's own accounts are testing, not participation (lib/research/teamAccounts.ts).
    if (isTeamAccount(row.user_id as string)) { teamAccountRows++; return false; }
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
    excluded: { ...excluded, team_account: teamAccountRows },
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
      'X-Excluded-Team-Account':         String(teamAccountRows),
    },
  });
}
