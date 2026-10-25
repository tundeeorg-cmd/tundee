/**
 * v30 locks the research views to the service role; v31 adds the replacement export view
 * with the real arm.
 *
 * Neither can be run here, so what is proved is what can be: every view the plan names
 * is in the lock list, nothing but privileges is changed, the app's own reads still work
 * (they all use the service role), and the new view's rule for the arm is the same rule
 * the export route and apply_click use — evaluated here on the same cases.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { bindOutcome } from '@/lib/research/outcomeBinding';

const V30 = readFileSync('scripts/20261031_v30_lock_research_views.sql', 'utf8');
const V31 = readFileSync('scripts/20261031_v31_research_export_view.sql', 'utf8');
const code = (sql: string) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
/** Statements only: comments AND quoted text removed, so a COMMENT ON that *names* the legacy column is not a use of it. */
const statements = (sql: string) => code(sql).replace(/'(?:[^']|'')*'/g, "''");

describe('v30 — the lock', () => {
  const lockList = (V30.match(/ARRAY\[([\s\S]*?)\]\s*LOOP/)?.[1] ?? '').match(/'([a-z_]+)'/g)!.map((s) => s.replace(/'/g, ''));

  it('covers every research view the repository defines', () => {
    const defined = new Set<string>();
    for (const f of readdirSync('scripts').filter((n) => n.endsWith('.sql'))) {
      for (const m of readFileSync(`scripts/${f}`, 'utf8').matchAll(/^CREATE (?:OR REPLACE )?VIEW\s+(?:public\.)?([a-z_0-9]+)/gim)) defined.add(m[1]);
    }
    const research = [...defined].filter((n) => /^(research|v_research|v_event|v_funnel|v_recruitment|v_outcomes|v_admin_outcomes)/.test(n));
    expect(research.length).toBeGreaterThan(8);
    for (const view of research) expect(lockList, view).toContain(view);
  });

  it('also covers the replacement view, so it is locked from its first moment', () => {
    expect(lockList).toContain('research_export');
  });

  it('leaves the admin_* views alone: /admin reads them from the browser, with the user\'s session', () => {
    for (const v of ['admin_summary', 'admin_province_stats', 'admin_top_scholarships', 'admin_daily_signups', 'admin_daily_active']) {
      expect(lockList).not.toContain(v);
      expect(readFileSync('app/admin/page.tsx', 'utf8')).toContain(v);
    }
  });

  it('changes privileges only: no data, table, constraint or function is touched', () => {
    const c = code(V30);
    for (const bad of [/\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bTRUNCATE\b/i, /\bDROP\b/i, /\bALTER\b/i, /\bCREATE\b/i, /\bCONSTRAINT\b/i]) {
      expect(c).not.toMatch(bad);
    }
    expect(c).toMatch(/REVOKE ALL ON public\.%I FROM PUBLIC, anon, authenticated/);
    expect(c).toMatch(/GRANT SELECT ON public\.%I TO service_role/);
  });

  it('skips a view that does not exist instead of failing, and says so', () => {
    expect(V30).toContain('to_regclass');
    expect(V30).toContain('not present (skipped)');
  });

  it('every app read of a locked view is made with the service role', () => {
    for (const [file, view] of [
      ['app/api/admin/recruitment/route.ts', 'v_recruitment_progress'],
      ['app/api/admin/outcomes/route.ts', 'v_admin_outcomes'],
      ['app/api/admin/outcomes/export/route.ts', 'v_admin_outcomes'],
    ] as const) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).toContain(view);
      expect(src, file).toContain('SUPABASE_SERVICE_ROLE_KEY');
    }
    expect(readFileSync('app/api/health/research/route.ts', 'utf8')).toContain('createAdminClient');
  });
});

describe('v31 — research_export', () => {
  it('is service-role only from the moment it exists', () => {
    expect(code(V31)).toMatch(/REVOKE ALL ON public\.research_export FROM PUBLIC, anon, authenticated/);
    expect(code(V31)).toMatch(/GRANT SELECT ON public\.research_export TO service_role/);
    expect(code(V31)).toContain('security_invoker = true');
  });

  it('uses the shared consent test and never the legacy table or column', () => {
    const c = statements(V31);
    expect(c).toContain('public.research_export_allowed(');
    expect(c).not.toMatch(/experiment_assignment|experiment_variant|ab_arm/);
    expect(c).not.toMatch(/consent_research\s*=\s*TRUE/i);
  });

  it('stores nothing and changes no table', () => {
    for (const bad of [/\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bTRUNCATE\b/i, /\bALTER\s+TABLE\b/i]) expect(code(V31)).not.toMatch(bad);
  });

  it('marks the old view deprecated instead of dropping what something may still read', () => {
    expect(code(V31)).toContain("COMMENT ON VIEW public.v_research_export IS");
    expect(code(V31)).not.toMatch(/DROP VIEW public\.v_research_export/i);
  });

  // The CASE in the view, evaluated here, against bindOutcome() on the same cases.
  const sqlArm = (p: { cohort: string | null; ranking_variant: string | null; ranking_assigned_at: string | null } | null, at: string) => {
    const counts = !!p && p.cohort !== 'pilot' && (p.ranking_variant === 'baseline' || p.ranking_variant === 'fairness_adjusted')
      && p.ranking_assigned_at !== null && Date.parse(at) >= Date.parse(p.ranking_assigned_at);
    return { ranking_variant: counts ? p!.ranking_variant : null, excluded_from_primary: !counts };
  };
  const ASSIGNED = '2026-10-01T00:00:00Z';
  const cases: Array<[string, { cohort: string | null; ranking_variant: string | null; ranking_assigned_at: string | null } | null, string]> = [
    ['after assignment',       { cohort: 'main',  ranking_variant: 'fairness_adjusted', ranking_assigned_at: ASSIGNED }, '2026-10-20T00:00:00Z'],
    ['at the assignment',      { cohort: 'main',  ranking_variant: 'baseline',          ranking_assigned_at: ASSIGNED }, ASSIGNED],
    ['before the assignment',  { cohort: 'main',  ranking_variant: 'baseline',          ranking_assigned_at: ASSIGNED }, '2026-09-20T00:00:00Z'],
    ['never randomized',       { cohort: 'main',  ranking_variant: null,                ranking_assigned_at: null },     '2026-10-20T00:00:00Z'],
    ['pilot',                  { cohort: 'pilot', ranking_variant: null,                ranking_assigned_at: null },     '2026-10-20T00:00:00Z'],
    ['no profile row',         null,                                                                                     '2026-10-20T00:00:00Z'],
    ['cohort null, randomized',{ cohort: null,    ranking_variant: 'baseline',          ranking_assigned_at: ASSIGNED }, '2026-10-20T00:00:00Z'],
  ];

  it.each(cases)('the arm rule agrees with the export route and apply_click: %s', (_n, profile, at) => {
    const ts = bindOutcome({ userId: 'u', clickedAt: new Date(at), profile: profile as never, impression: null });
    const sql = sqlArm(profile, at);
    expect(sql.ranking_variant).toBe(ts.ranking_variant);
    expect(sql.excluded_from_primary).toBe(ts.excluded_from_primary);
  });

  it('the SQL spells the rule the same way', () => {
    const c = code(V31);
    expect(c).toContain("p.cohort IS DISTINCT FROM 'pilot'");
    expect(c).toContain("p.ranking_variant IN ('baseline', 'fairness_adjusted')");
    expect(c).toContain('fe.occurred_at >= p.ranking_assigned_at');
  });
});
