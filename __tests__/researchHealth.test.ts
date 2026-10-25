/**
 * /api/health/research — the invariants must read zero on healthy data and must
 * fire on exactly the failures they exist for. A check that cannot run is
 * reported as unavailable, never as 0.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { CURRENT_CONSENT_VERSION } from '@/lib/research/consentGate';

type Rows = Record<string, unknown>[];
interface World {
  profiles: Rows;
  student_profile: Rows;
  funnelTreated: { rows: Rows; count: number };
  conflicts: { count: number } | { error: { code: string; message: string } };
  attrition: { rows: Rows } | { error: { code: string; message: string } };
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
          default: throw new Error(`unexpected table ${table}`);
        }
      };
      for (const m of ['select', 'eq', 'filter', 'in', 'limit']) q[m] = () => q;
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
  };
});

describe('/api/health/research', () => {
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
    for (const outcome of ['apply_click', 'click_apply', 'application_submitted', 'award_reported', 'applications', 'outcomes']) {
      expect(src, outcome).not.toContain(`'${outcome}'`);
    }
  });
});
