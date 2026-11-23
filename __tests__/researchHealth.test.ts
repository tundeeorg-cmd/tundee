/**
 * /api/health/research — the invariants must read zero on healthy data and must
 * fire on exactly the failures they exist for. A check that cannot run is
 * reported as unavailable, never as 0.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { CURRENT_CONSENT_VERSION } from '@/lib/research/consentGate';

type Rows = Record<string, unknown>[];
interface World {
  profiles: Rows;
  student_profile: Rows;
  funnelTreated: { rows: Rows; count: number };
  conflicts: { count: number } | { error: { code: string; message: string } };
  attrition: { rows: Rows } | { error: { code: string; message: string } };
  // v38: anonymous participants.
  anonAssignments: { rows: Rows } | { error: { code: string; message: string } };
  anonImpressions: { rows: Rows } | { error: { code: string; message: string } };
  anonClicks: { count: number } | { error: { code: string; message: string } };
}
let world: World;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      const done = (): unknown => {
        switch (table) {
          case 'profiles':        return { data: world.profiles, error: null };
          case 'student_profile': return { data: world.student_profile, error: null };
          case 'funnel_events':   return { data: world.funnelTreated.rows, count: world.funnelTreated.count, error: null };
          case 'randomization_conflicts':
            return 'error' in world.conflicts ? { error: world.conflicts.error } : { count: world.conflicts.count, error: null };
          case 'research_attrition':
            return 'error' in world.attrition ? { error: world.attrition.error } : { data: world.attrition.rows, error: null };
          case 'anon_assignments':
            return 'error' in world.anonAssignments ? { error: world.anonAssignments.error } : { data: world.anonAssignments.rows, error: null };
          case 'anon_impressions':
            return 'error' in world.anonImpressions ? { error: world.anonImpressions.error } : { data: world.anonImpressions.rows, error: null };
          case 'apply_click':
            return 'error' in world.anonClicks ? { error: world.anonClicks.error } : { count: world.anonClicks.count, error: null };
          default: throw new Error(`unexpected table ${table}`);
        }
      };
      for (const m of ['select', 'eq', 'filter', 'in', 'limit', 'gte', 'not']) q[m] = () => q;
      q.range = () => Promise.resolve(done());
      // Awaiting the chain itself (funnel_events, conflicts, attrition) resolves too.
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(done()).then(resolve);
      return q;
    },
  }),
}));

import { GET } from '@/app/api/health/research/route';

const get = async (auth: string | null = 'Bearer s3cret') =>
  GET(new NextRequest('http://localhost/api/health/research', { headers: auth ? { authorization: auth } : {} }));

const profile = (over: Record<string, unknown> = {}) => ({
  id: `u-${Math.random()}`, cohort: 'main', region_group: 'northeast',
  ranking_variant: 'baseline', ranking_assigned_at: '2026-10-01T00:00:00Z',
  assignment_algorithm_version: 'v2', province: 'ขอนแก่น', income_bracket: 2, ...over,
});

const MISSING = { error: { code: '42P01', message: 'relation does not exist' } };

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret';
  world = {
    profiles: [profile(), profile({ ranking_variant: 'fairness_adjusted' })],
    student_profile: [],
    funnelTreated: { rows: [], count: 0 },
    conflicts: MISSING,
    attrition: MISSING,
    anonAssignments: { rows: [] },
    anonImpressions: { rows: [] },
    anonClicks: { count: 0 },
  };
});

describe('/api/health/research', () => {
  it('leaves the team\'s own accounts out of arm balance and says how many', async () => {
    world.profiles.push(profile({ id: 'efe69840-0552-4456-a643-726e4f0027ad', ranking_variant: 'fairness_adjusted' }));
    const body = await (await get()).json();
    expect(body.team_accounts_excluded).toBe(1);
    expect(body.arm_balance_by_region_group.northeast).toMatchObject({ baseline: 1, fairness_adjusted: 1, n: 2 });
  });

  it('counts randomization conflicts without the team\'s accounts', () => {
    const src = readFileSync('app/api/health/research/route.ts', 'utf8');
    expect(src).toMatch(/from\('randomization_conflicts'\)[\s\S]{0,120}\.not\('user_id', 'in', teamAccountInList\(\)\)/);
  });

  it('refuses a request without the secret', async () => {
    expect((await get(null)).status).toBe(401);
    expect((await get('Bearer nope')).status).toBe(401);
  });

  it('is ok when every invariant is zero', async () => {
    const body = await (await get()).json();
    expect(body.ok).toBe(true);
    expect(body.invariants.treated_without_randomization.impressions).toBe(0);
    expect(body.invariants.variant_without_audit_fields.rows).toBe(0);
    expect(body.invariants.pilot_with_variant.rows).toBe(0);
  });

  it('alerts when treatment was served to someone who was never randomized', async () => {
    world.profiles.push(profile({ ranking_variant: null, ranking_assigned_at: null, assignment_algorithm_version: null }));
    world.funnelTreated = { rows: [{ user_id: 'u-x' }], count: 3 };
    const body = await (await get()).json();
    expect(body.ok).toBe(false);
    expect(body.alerts).toContain('treated_without_randomization');
    expect(body.invariants.treated_without_randomization).toMatchObject({ impressions: 3, students: 1 });
  });

  it('alerts on a variant with no audit fields, and on a pilot with a variant', async () => {
    world.profiles.push(profile({ ranking_assigned_at: null }));
    world.profiles.push(profile({ cohort: 'pilot' }));
    const body = await (await get()).json();
    expect(body.alerts).toEqual(expect.arrayContaining(['variant_without_audit_fields', 'pilot_with_variant']));
  });

  it('reports a missing table as unavailable, never as zero', async () => {
    const body = await (await get()).json();
    expect(body.randomization_conflicts).toEqual({ available: false, reason: expect.stringContaining('v24') });
    expect(body.answer_rate_by_arm.available).toBe(false);
  });

  it('reports counts when the v24 objects exist', async () => {
    world.conflicts = { count: 2 };
    world.attrition = { rows: [
      { ranking_variant: 'baseline', shown: 10, answered: 8 },
      { ranking_variant: null, shown: 4, answered: 1 },
    ] };
    const body = await (await get()).json();
    expect(body.randomization_conflicts).toEqual({ available: true, rows: 2 });
    expect(body.answer_rate_by_arm.by_arm.baseline.rate).toBe(0.8);
    expect(body.answer_rate_by_arm.by_arm.unrandomized.rate).toBe(0.25);
  });

  it('counts consented, complete, unrandomized students separately from the legacy ones', async () => {
    const consentedId = 'u-consented';
    world.profiles.push(profile({ id: consentedId, ranking_variant: null, ranking_assigned_at: null, assignment_algorithm_version: null }));
    world.profiles.push(profile({ ranking_variant: null, ranking_assigned_at: null, assignment_algorithm_version: null }));
    world.student_profile = [{ user_id: consentedId, consent_research: true, consent_version: CURRENT_CONSENT_VERSION }];
    const body = await (await get()).json();
    expect(body.main_complete_unrandomized).toMatchObject({ total: 2, with_current_research_consent: 1 });
    expect(body.alerts).toContain('consented_complete_but_unrandomized');
  });

  it('flags arm imbalance only when a stratum is large enough to mean something', async () => {
    world.profiles = Array.from({ length: 40 }, () => profile({ ranking_variant: 'fairness_adjusted' }));
    expect((await (await get()).json()).alerts).toContain('arm_imbalance:northeast');
    world.profiles = Array.from({ length: 5 }, () => profile({ ranking_variant: 'fairness_adjusted' }));
    expect((await (await get()).json()).alerts).not.toContain('arm_imbalance:northeast');
  });

  it('reports where re-consent stands: current wording, superseded wording, ticked with no record', async () => {
    world.profiles.push(profile({ id: 'ticked-no-row', research_opt_in: true }));
    world.student_profile = [
      { user_id: 'a', consent_research: true, consent_version: CURRENT_CONSENT_VERSION },
      { user_id: 'b', consent_research: true, consent_version: '2026-01-v1' },
      { user_id: 'c', consent_research: false, consent_version: CURRENT_CONSENT_VERSION },
    ];
    const body = await (await get()).json();
    expect(body.research_consent).toEqual({
      current_version: CURRENT_CONSENT_VERSION,
      consent_to_current_wording: 1,
      consent_to_superseded_wording: 1,
      ticked_but_no_student_profile_row: 1,
    });
    expect(body.alerts).not.toContain('research_consent');   // informational, never an alert
  });

  it('returns counts only: no ids or provinces', async () => {
    const text = await (await get()).text();
    expect(text).not.toContain('u-');
    expect(text).not.toContain('ขอนแก่น');
  });
});

describe('no-peeking (PART 2 step 8)', () => {
  it('the route never reads an outcome table or splits outcomes by arm', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/api/health/research/route.ts', 'utf8');
    for (const outcome of ['click_apply', 'application_submitted', 'award_reported', 'applications', 'outcomes']) {
      expect(src, outcome).not.toContain(`'${outcome}'`);
    }
  });

  it('v38: apply_click is touched once, for a head-only TOTAL of anonymous clicks — no rows, no arm', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/api/health/research/route.ts', 'utf8');
    expect(src.split("'apply_click'")).toHaveLength(2);
    const query = src.slice(src.indexOf(".from('apply_click')"), src.indexOf(".from('apply_click')") + 200);
    expect(query).toContain("select('id', { count: 'exact', head: true })");
    expect(query).not.toMatch(/ranking_variant|served_fairness_mode|excluded_from_primary/);
  });
});

describe('v38: anonymous participants', () => {
  const A = (id: string, over: Record<string, unknown> = {}) => ({
    anon_id: id, level: 'uni', region_group: 'northeast', income_bracket: 2, recruitment_source: 'isaan_2026', ...over,
  });

  it('the zero case: no assignments in 24 h is healthy, with no shares and no alert', async () => {
    const body = await (await get()).json();
    expect(body.anonymous_participants).toEqual({
      available: true, window_hours: 24, assignments: 0,
      with_covariates_share: null, with_impression_share: null, apply_clicks: 0, alerts: [],
    });
    expect(body.ok).toBe(true);
  });

  it('reports assignments, covariate and impression shares, and the click total', async () => {
    world.anonAssignments = { rows: [A('a1'), A('a2'), A('a3'), A('a4', { level: null })] };
    world.anonImpressions = { rows: [{ anon_id: 'a1' }, { anon_id: 'a1' }, { anon_id: 'a2' }, { anon_id: 'a3' }, { anon_id: 'a4' }] };
    world.anonClicks = { count: 3 };
    const body = await (await get()).json();
    expect(body.anonymous_participants).toMatchObject({
      available: true, assignments: 4, with_covariates_share: 0.75, with_impression_share: 1, apply_clicks: 3,
    });
    expect(body.alerts).toContain('anon_covariates_missing');
  });

  it('alerts when randomized visitors are not being recorded as shown anything', async () => {
    world.anonAssignments = { rows: Array.from({ length: 10 }, (_, i) => A(`a${i}`)) };
    world.anonImpressions = { rows: [{ anon_id: 'a0' }] };
    const body = await (await get()).json();
    expect(body.anonymous_participants.with_impression_share).toBe(0.1);
    expect(body.alerts).toContain('anon_impressions_missing');
  });

  it('before the v38 migrations it says unavailable, never zero', async () => {
    world.anonAssignments = { error: { code: '42703', message: 'column anon_assignments.level does not exist' } };
    let body = await (await get()).json();
    expect(body.anonymous_participants.available).toBe(false);
    world.anonAssignments = { rows: [A('a1')] };
    world.anonImpressions = MISSING;
    body = await (await get()).json();
    expect(body.anonymous_participants.available).toBe(false);
  });
});
