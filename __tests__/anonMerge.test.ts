/**
 * Merging an anonymous assignment into the account that signs in — the executor,
 * against an in-memory stand-in for the database. The rule is tested on its own in
 * anonRandomization.test.ts; this proves the ORDER of writes (consent before arm,
 * claim before arm) and what is and is not left behind when something fails.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mergeAnonAssignment } from '@/lib/research/anonStore';

type Row = Record<string, unknown>;
interface Db { anon_assignments: Row[]; profiles: Row[]; student_profile: Row[]; randomization_conflicts: Row[] }
const KEY: Record<string, string> = { anon_assignments: 'anon_id', profiles: 'id', student_profile: 'user_id' };

function fakeAdmin(db: Db, ops: string[], failOn: Record<string, string> = {}) {
  return {
    from(table: keyof Db) {
      const filters: [string, unknown][] = [];
      const nulls: string[] = [];
      let mode: 'select' | 'update' = 'select';
      let patch: Row = {};
      const matches = () => db[table].filter((r) =>
        filters.every(([c, v]) => r[c] === v) && nulls.every((c) => r[c] == null));
      const run = () => {
        const op = `${mode}:${table}`;
        if (failOn[op]) return { data: null, error: { message: failOn[op] } };
        const hit = matches();
        if (mode === 'update') { ops.push(op); hit.forEach((r) => Object.assign(r, patch)); }
        return { data: hit.map((r) => ({ ...r })), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
        is: (c: string) => { nulls.push(c); return q; },
        update: (p: Row) => { mode = 'update'; patch = p; return q; },
        maybeSingle: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error }; },
        then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
        insert: async (row: Row) => {
          const op = `insert:${table}`;
          if (failOn[op]) return { error: { message: failOn[op] } };
          ops.push(op); db[table].push({ ...row }); return { error: null };
        },
        upsert: async (row: Row, opts: { onConflict: string }) => {
          const op = `upsert:${table}`;
          if (failOn[op]) return { error: { message: failOn[op] } };
          ops.push(op);
          const k = opts.onConflict;
          const existing = db[table].find((r) => r[k] === row[k]);
          if (existing) Object.assign(existing, row); else db[table].push({ ...row });
          return { error: null };
        },
      };
      return q;
    },
  } as never;
}

const ANON = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const anonRow = (arm: string, extra: Row = {}): Row => ({
  anon_id: ANON, ranking_variant: arm, ranking_assigned_at: '2026-10-20T09:00:00Z',
  assignment_algorithm_version: 'v2-hmac-stratified-2026-08', stratum: 'northeast|2', fairness_eligible: true,
  research_consent_version: '2026-07-v1', research_consented_at: '2026-10-20T09:00:00Z', claimed_by: null, ...extra,
});

let db: Db;
let ops: string[];
beforeEach(() => {
  ops = [];
  db = { anon_assignments: [anonRow('fairness_adjusted')], profiles: [{ id: 'u1', cohort: 'main', ranking_variant: null }], student_profile: [], randomization_conflicts: [] };
});

const merge = (failOn?: Record<string, string>) =>
  mergeAnonAssignment(fakeAdmin(db, ops, failOn), { anonId: ANON, userId: 'u1' });

describe('lift', () => {
  it('writes the consent, then claims, then writes the arm — in that order', async () => {
    expect(await merge()).toEqual({ outcome: 'lift' });
    expect(ops).toEqual(['upsert:student_profile', 'update:anon_assignments', 'update:profiles']);
  });

  it('puts the ORIGINAL assignment time and version on the profile, not the time of sign-in', async () => {
    await merge();
    expect(db.profiles[0]).toMatchObject({
      ranking_variant: 'fairness_adjusted', ranking_assigned_at: '2026-10-20T09:00:00Z',
      assignment_algorithm_version: 'v2-hmac-stratified-2026-08', fairness_eligible: true,
    });
  });

  it('records the consent the visitor gave, with its version and time and where it was given', async () => {
    await merge();
    expect(db.student_profile[0]).toMatchObject({
      user_id: 'u1', consent_research: true, consent_version: '2026-07-v1',
      consent_at: '2026-10-20T09:00:00Z', consent_method: 'signup_inline',
    });
  });

  it('claims the anonymous row for this account', async () => {
    await merge();
    expect(db.anon_assignments[0].claimed_by).toBe('u1');
  });

  it('keeps an existing research consent instead of overwriting it', async () => {
    db.student_profile = [{ user_id: 'u1', consent_research: true, consent_version: '2026-07-v1', consent_at: '2026-09-01T00:00:00Z' }];
    await merge();
    expect(ops).not.toContain('upsert:student_profile');
    expect(db.student_profile[0].consent_at).toBe('2026-09-01T00:00:00Z');
  });

  it('a failed consent write leaves nothing claimed and no arm: nobody gets an arm without the consent for it', async () => {
    const r = await merge({ 'upsert:student_profile': 'boom' });
    expect(r).toMatchObject({ outcome: 'failed', stage: 'write_consent' });
    expect(db.anon_assignments[0].claimed_by).toBeNull();
    expect(db.profiles[0].ranking_variant).toBeNull();
  });

  it('a failed arm write is reported as a failure', async () => {
    expect(await merge({ 'update:profiles': 'boom' })).toMatchObject({ outcome: 'failed', stage: 'write_arm' });
  });
});

describe('the account already has an arm', () => {
  it('a disagreement keeps the account\'s arm and records the conflict', async () => {
    db.profiles[0].ranking_variant = 'baseline';
    expect(await merge()).toEqual({ outcome: 'conflict' });
    expect(db.profiles[0].ranking_variant).toBe('baseline');
    expect(db.randomization_conflicts).toEqual([
      { anon_id: ANON, user_id: 'u1', anon_arm: 'fairness_adjusted', profile_arm: 'baseline' },
    ]);
    expect(db.anon_assignments[0].claimed_by).toBe('u1');
    expect(ops).not.toContain('update:profiles');
  });

  it('agreement records no conflict but still claims the row', async () => {
    db.profiles[0].ranking_variant = 'fairness_adjusted';
    expect(await merge()).toEqual({ outcome: 'same_arm' });
    expect(db.randomization_conflicts).toHaveLength(0);
    expect(db.anon_assignments[0].claimed_by).toBe('u1');
  });

  it('losing a race with the wizard\'s own assignment is re-read as a conflict, not overwritten', async () => {
    // The profile looks empty when read, but is already assigned when the arm is written.
    const admin = fakeAdmin(db, ops);
    let reads = 0;
    const from = (admin as unknown as { from: (t: string) => Record<string, unknown> }).from.bind(admin);
    (admin as unknown as { from: (t: string) => unknown }).from = (t: string) => {
      const q = from(t);
      if (t === 'profiles') {
        const orig = q.maybeSingle as () => Promise<{ data: Row | null; error: unknown }>;
        q.maybeSingle = async () => {
          reads++;
          const r = await orig();
          if (reads === 1) { db.profiles[0].ranking_variant = 'baseline'; return { data: { ...r.data, ranking_variant: null }, error: null }; }
          return r;
        };
      }
      return q;
    };
    expect(await mergeAnonAssignment(admin as never, { anonId: ANON, userId: 'u1' })).toEqual({ outcome: 'conflict' });
    expect(db.profiles[0].ranking_variant).toBe('baseline');
    expect(db.randomization_conflicts).toHaveLength(1);
  });
});

describe('nothing to do', () => {
  it('a student who declined on the account is left alone and the row stays unclaimed', async () => {
    db.student_profile = [{ user_id: 'u1', consent_research: false }];
    expect(await merge()).toEqual({ outcome: 'none', reason: 'declined_on_account' });
    expect(db.profiles[0].ranking_variant).toBeNull();
    expect(db.anon_assignments[0].claimed_by).toBeNull();
  });

  it('the pilot cohort is never randomized', async () => {
    db.profiles[0].cohort = 'pilot';
    expect(await merge()).toEqual({ outcome: 'none', reason: 'pilot_cohort' });
    expect(db.profiles[0].ranking_variant).toBeNull();
  });

  it('merging twice changes nothing the second time', async () => {
    await merge();
    const second = await merge();
    expect(second).toEqual({ outcome: 'none', reason: 'already_claimed' });
    expect(db.randomization_conflicts).toHaveLength(0);
  });

  it('another account cannot take an assignment that has been claimed', async () => {
    db.anon_assignments[0].claimed_by = 'someone-else';
    expect(await merge()).toEqual({ outcome: 'none', reason: 'claimed_by_other' });
    expect(db.profiles[0].ranking_variant).toBeNull();
  });

  it('an unknown anonymous id is nothing to merge', async () => {
    db.anon_assignments = [];
    expect(await merge()).toEqual({ outcome: 'none', reason: 'no_anon_assignment' });
  });
});

describe('reads that fail are failures, not "nothing to do"', () => {
  it.each(['select:anon_assignments', 'select:profiles', 'select:student_profile'])('%s', async (op) => {
    const r = await merge({ [op]: 'boom' });
    expect(r.outcome).toBe('failed');
    expect(db.profiles[0].ranking_variant).toBeNull();
  });
});
