/**
 * GET /api/health/research — is the experiment collecting what it should?
 *
 * Authorised with CRON_SECRET like the other health and cron routes.
 *
 * The first three checks are invariants: they must be zero, and a non-zero
 * value means the trial's data is compromised, not merely imperfect.
 *
 *   treated_without_randomization  impressions served with the fairness
 *       adjustment ON to a student whose ranking_variant is null. The ranking a
 *       student sees is decided by ranking_variant alone, so this can only
 *       happen if treatment was delivered to someone who was never randomized.
 *   variant_without_audit_fields   ranking_variant set but ranking_assigned_at or
 *       assignment_algorithm_version missing (a CHECK forbids it; this proves it).
 *   pilot_with_variant             cohort 'pilot' with a ranking_variant (a CHECK
 *       forbids it; this proves it).
 *
 * The rest are signals: arm balance within region_group, how many consented
 * students are complete but unrandomized, randomization_conflicts, and answer
 * rate by arm.
 *
 * NO-PEEKING (PART 2 step 8). This route reports how people were ASSIGNED and
 * whether they ANSWERED. It never reports an outcome — application rate, clicks,
 * awards — split by ranking_variant, and must not be extended to. Outcome by arm
 * is analysed in SQL, deliberately, at the pre-registered stopping point.
 *
 * A check that cannot run (a table the migration has not created yet) is reported
 * as { available: false, reason } — never as 0, which would read as "healthy".
 * Counts only: no ids, emails or provinces leave this route.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CURRENT_CONSENT_VERSION, isResearchConsented } from '@/lib/research/consentGate';

const PAGE = 1000;
const IN_CHUNK = 100;

/** Below this many randomized students in a stratum, a skewed split is noise. */
const MIN_N_FOR_BALANCE_ALERT = 30;
const BALANCE_TOLERANCE = 0.2;

type Unavailable = { available: false; reason: string };

interface ProfileRow {
  id: string;
  cohort: string | null;
  region_group: string | null;
  ranking_variant: string | null;
  ranking_assigned_at: string | null;
  assignment_algorithm_version: string | null;
  province: string | null;
  income_bracket: number | null;
  research_opt_in: boolean | null;
}

// Typed loosely: the admin client is untyped here and every row is narrowed below.
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function selectAll<T>(
  admin: Admin,
  table: string,
  columns: string,
): Promise<{ rows: T[] } | { error: string }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    rows.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE) return { rows };
  }
}

/** Postgres 42P01 / PostgREST PGRST205: the table or view does not exist (yet). */
function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? ''));
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('[research/health] service role not configured');
    return NextResponse.json({ error: 'Missing SUPABASE env vars' }, { status: 500 });
  }

  const fail = (what: string, message: string) => {
    console.error(`[research/health] ${what} failed:`, message);
    return NextResponse.json({ error: `${what} failed` }, { status: 500 });
  };

  // ── Profiles ───────────────────────────────────────────────────────────────
  const profilesRes = await selectAll<ProfileRow>(
    admin, 'profiles',
    'id, cohort, region_group, ranking_variant, ranking_assigned_at, assignment_algorithm_version, province, income_bracket, research_opt_in',
  );
  if ('error' in profilesRes) return fail('profiles read', profilesRes.error);
  const profiles = profilesRes.rows;

  const complete = (p: ProfileRow) => !!p.province && p.income_bracket != null;
  const variantWithoutAudit = profiles.filter(
    p => p.ranking_variant && (!p.ranking_assigned_at || !p.assignment_algorithm_version),
  ).length;
  const pilotWithVariant = profiles.filter(p => p.cohort === 'pilot' && p.ranking_variant).length;

  // Arm balance within region_group — assignment counts, not outcomes.
  const balance: Record<string, { baseline: number; fairness_adjusted: number; n: number; share_adjusted: number | null }> = {};
  for (const p of profiles) {
    if (!p.ranking_variant) continue;
    const key = p.region_group ?? 'unknown';
    const b = (balance[key] ??= { baseline: 0, fairness_adjusted: 0, n: 0, share_adjusted: null });
    if (p.ranking_variant === 'baseline') b.baseline++;
    else if (p.ranking_variant === 'fairness_adjusted') b.fairness_adjusted++;
    b.n++;
  }
  for (const b of Object.values(balance)) b.share_adjusted = b.n ? Number((b.fairness_adjusted / b.n).toFixed(3)) : null;

  // ── Consent, to count who SHOULD have been randomized ─────────────────────
  const spRes = await selectAll<{ user_id: string; consent_research: boolean | null; consent_version: string | null }>(
    admin, 'student_profile', 'user_id, consent_research, consent_version',
  );
  if ('error' in spRes) return fail('student_profile read', spRes.error);
  const consented = new Set(
    spRes.rows
      .filter(r => isResearchConsented({ consent_research: r.consent_research ?? false, consent_version: r.consent_version ?? '' }))
      .map(r => r.user_id),
  );

  // Where re-consent stands. Informational, not an alert: until students re-consent
  // these are expected to be non-zero, and the export excludes them meanwhile.
  const hasStudentProfile = new Set(spRes.rows.map(r => r.user_id));
  const consentStatus = {
    current_version: CURRENT_CONSENT_VERSION,
    consent_to_current_wording: consented.size,
    consent_to_superseded_wording: spRes.rows.filter(
      r => r.consent_research === true && !isResearchConsented({ consent_research: true, consent_version: r.consent_version ?? '' }),
    ).length,
    ticked_but_no_student_profile_row: profiles.filter(p => p.research_opt_in === true && !hasStudentProfile.has(p.id)).length,
  };

  const mainUnrandomized = profiles.filter(p => p.cohort === 'main' && complete(p) && !p.ranking_variant);
  const consentedUnrandomized = mainUnrandomized.filter(p => consented.has(p.id)).length;

  // ── Treatment delivered without randomization ─────────────────────────────
  const unrandomizedIds = profiles.filter(p => !p.ranking_variant).map(p => p.id);
  let treatedImpressions = 0;
  const treatedUsers = new Set<string>();
  for (let i = 0; i < unrandomizedIds.length; i += IN_CHUNK) {
    const { data, count, error } = await admin
      .from('funnel_events')
      .select('user_id', { count: 'exact' })
      .eq('event_type', 'impression')
      .filter('context->>fairness_mode', 'eq', 'on')
      .in('user_id', unrandomizedIds.slice(i, i + IN_CHUNK))
      .limit(PAGE);
    if (error) return fail('funnel_events read', error.message);
    treatedImpressions += count ?? 0;
    for (const r of (data ?? []) as { user_id: string | null }[]) if (r.user_id) treatedUsers.add(r.user_id);
  }

  // ── randomization_conflicts (exists after scripts/20261026_v24) ───────────
  let conflicts: { available: true; rows: number } | Unavailable;
  {
    const { count, error } = await admin.from('randomization_conflicts').select('id', { count: 'exact', head: true });
    if (error) {
      if (!isMissingRelation(error)) return fail('randomization_conflicts read', error.message);
      conflicts = { available: false, reason: 'table not created yet (scripts/20261026_v24)' };
    } else {
      conflicts = { available: true, rows: count ?? 0 };
    }
  }

  // ── Answer rate by arm (research_attrition, same migration) ───────────────
  let answerRate: { available: true; by_arm: Record<string, { shown: number; answered: number; rate: number | null }> } | Unavailable;
  {
    const { data, error } = await admin.from('research_attrition').select('ranking_variant, shown, answered');
    if (error) {
      if (!isMissingRelation(error)) return fail('research_attrition read', error.message);
      answerRate = { available: false, reason: 'view not created yet (scripts/20261026_v24)' };
    } else {
      const by_arm: Record<string, { shown: number; answered: number; rate: number | null }> = {};
      for (const r of (data ?? []) as { ranking_variant: string | null; shown: number; answered: number }[]) {
        const key = r.ranking_variant ?? 'unrandomized';
        const a = (by_arm[key] ??= { shown: 0, answered: 0, rate: null });
        a.shown += Number(r.shown);
        a.answered += Number(r.answered);
      }
      for (const a of Object.values(by_arm)) a.rate = a.shown ? Number((a.answered / a.shown).toFixed(3)) : null;
      answerRate = { available: true, by_arm };
    }
  }

  // ── Alerts: invariants first, then signals ─────────────────────────────────
  const alerts: string[] = [];
  if (treatedImpressions > 0) alerts.push('treated_without_randomization');
  if (variantWithoutAudit > 0) alerts.push('variant_without_audit_fields');
  if (pilotWithVariant > 0) alerts.push('pilot_with_variant');
  for (const [region, b] of Object.entries(balance)) {
    if (b.n >= MIN_N_FOR_BALANCE_ALERT && b.share_adjusted != null && Math.abs(b.share_adjusted - 0.5) > BALANCE_TOLERANCE) {
      alerts.push(`arm_imbalance:${region}`);
    }
  }
  if (consentedUnrandomized > 0) alerts.push('consented_complete_but_unrandomized');

  if (alerts.length) console.error('[research/health] ALERT', alerts.join(','));

  return NextResponse.json({
    invariants: {
      treated_without_randomization: { impressions: treatedImpressions, students: treatedUsers.size, expected: 0 },
      variant_without_audit_fields: { rows: variantWithoutAudit, expected: 0 },
      pilot_with_variant: { rows: pilotWithVariant, expected: 0 },
    },
    arm_balance_by_region_group: balance,
    main_complete_unrandomized: {
      total: mainUnrandomized.length,
      with_current_research_consent: consentedUnrandomized,
      note: 'total includes students who skipped the wizard before 26 Oct 2026 and are never randomized retroactively; the consented count is the one that should fall to 0',
    },
    research_consent: consentStatus,
    randomization_conflicts: conflicts,
    answer_rate_by_arm: answerRate,
    alerts,
    ok: alerts.length === 0,
  });
}
