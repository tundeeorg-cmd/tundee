/**
 * Apply-click outcomes carry the arm the student was in when they clicked
 * (PART 2 step 7). A click before the trial, by someone never randomized, or by an
 * anonymous visitor is kept but excluded from the primary result; a click after
 * randomization carries the real arm; a failed lookup is recorded as such, never
 * quietly given an arm.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { bindOutcome, IMPRESSION_MAX_AGE_MS, type ProfileFacts } from '@/lib/research/outcomeBinding';

const T0 = new Date('2026-10-20T10:00:00Z');
const assigned = (offsetMs: number) => new Date(T0.getTime() + offsetMs).toISOString();
const randomized = (over: Partial<ProfileFacts> = {}): ProfileFacts => ({
  ranking_variant: 'fairness_adjusted', ranking_assigned_at: assigned(-3600_000), cohort: 'main', ...over,
});
const imp = (over: Record<string, unknown> = {}, ago = 60_000) => ({
  occurred_at: new Date(T0.getTime() - ago).toISOString(),
  context: { rank: 3, tab: 'matches', fairness_mode: 'on', ...over },
});

describe('bindOutcome', () => {
  it('a click after randomization carries the arm, its assignment time and the served context', () => {
    expect(bindOutcome({ userId: 'u', clickedAt: T0, profile: randomized(), impression: imp() })).toEqual({
      ranking_variant: 'fairness_adjusted',
      ranking_assigned_at: assigned(-3600_000),
      rank_position: 3, was_personalized: true, served_fairness_mode: 'on',
      excluded_from_primary: false, binding_source: 'server',
    });
  });

  it('a click BEFORE the assignment has no arm and is excluded, but remembers when they were assigned', () => {
    const b = bindOutcome({ userId: 'u', clickedAt: T0, profile: randomized({ ranking_assigned_at: assigned(+60_000) }), impression: null });
    expect(b).toMatchObject({ ranking_variant: null, excluded_from_primary: true, binding_source: 'server' });
    expect(b.ranking_assigned_at).toBe(assigned(+60_000));
  });

  it('a click at exactly the assignment instant counts as after', () => {
    const b = bindOutcome({ userId: 'u', clickedAt: T0, profile: randomized({ ranking_assigned_at: T0.toISOString() }), impression: null });
    expect(b.excluded_from_primary).toBe(false);
  });

  it.each([
    ['never randomized', { ranking_variant: null, ranking_assigned_at: null }],
    ['pilot cohort', { cohort: 'pilot' }],
    ['a variant with no assignment time', { ranking_assigned_at: null }],
    ['an unrecognised variant', { ranking_variant: 'control' }],
  ])('%s: no arm, excluded', (_n, over) => {
    const b = bindOutcome({ userId: 'u', clickedAt: T0, profile: randomized(over), impression: null });
    expect(b.ranking_variant).toBeNull();
    expect(b.excluded_from_primary).toBe(true);
  });

  it('an anonymous visitor has no arm and is excluded', () => {
    const b = bindOutcome({ userId: null, clickedAt: T0, profile: null, impression: null });
    expect(b).toMatchObject({ ranking_variant: null, excluded_from_primary: true, binding_source: 'server' });
  });

  it('a failed profile read is recorded as unbound and excluded, never given an arm', () => {
    const b = bindOutcome({ userId: 'u', clickedAt: T0, profile: null, profileReadFailed: true, impression: imp() });
    expect(b).toMatchObject({ ranking_variant: null, excluded_from_primary: true, binding_source: 'server_unbound' });
  });

  it('a signed-in user with no profile row is excluded, not "unbound"', () => {
    expect(bindOutcome({ userId: 'u', clickedAt: T0, profile: null, impression: null }).binding_source).toBe('server_unbound');
  });

  it('browse is not personalized; an unknown tab is unknown', () => {
    expect(bindOutcome({ userId: 'u', clickedAt: T0, profile: randomized(), impression: imp({ tab: 'browse', fairness_mode: 'off' }) }))
      .toMatchObject({ was_personalized: false, served_fairness_mode: 'off' });
    expect(bindOutcome({ userId: 'u', clickedAt: T0, profile: randomized(), impression: imp({ tab: 'tracker' }) }).was_personalized).toBeNull();
  });

  it('an impression that is too old, or from the future, is not the list they clicked from', () => {
    const old = bindOutcome({ userId: 'u', clickedAt: T0, profile: randomized(), impression: imp({}, IMPRESSION_MAX_AGE_MS + 1) });
    expect(old).toMatchObject({ rank_position: null, was_personalized: null, served_fairness_mode: null });
    const future = bindOutcome({ userId: 'u', clickedAt: T0, profile: randomized(), impression: imp({}, -5_000) });
    expect(future.rank_position).toBeNull();
  });

  it('an unusable rank is null, not 0 or NaN', () => {
    for (const rank of [0, -2, 1.5, 'x', null]) {
      expect(bindOutcome({ userId: 'u', clickedAt: T0, profile: randomized(), impression: imp({ rank }) }).rank_position).toBeNull();
    }
  });
});

// ── The route ────────────────────────────────────────────────────────────────

const inserted = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => ({ error: null as null | { code: string; message: string } })));
const world = vi.hoisted(() => ({
  user: { id: 'u-1' } as { id: string } | null,
  profile: { data: null as unknown, error: null as null | { message: string } },
  impression: { data: null as unknown, error: null as null | { message: string } },
  admin: true,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: world.user } }) },
    from: () => ({ insert: inserted }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => world.admin ? ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'lte', 'order', 'limit']) q[m] = () => q;
      q.maybeSingle = async () => table === 'profiles' ? world.profile : world.impression;
      return q;
    },
  }) : null,
}));

import { POST } from '@/app/api/apply-click/route';

const click = (body: unknown = { scholarship_id: 'TD-1' }) =>
  POST(new NextRequest('http://localhost/api/apply-click', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  inserted.mockClear();
  world.user = { id: 'u-1' };
  world.admin = true;
  world.profile = { data: { ranking_variant: 'baseline', ranking_assigned_at: '2020-01-01T00:00:00Z', cohort: 'main' }, error: null };
  world.impression = { data: { occurred_at: new Date(Date.now() - 1000).toISOString(), context: { rank: 2, tab: 'matches', fairness_mode: 'off' } }, error: null };
});

describe('POST /api/apply-click', () => {
  it('writes the arm and served context, taken from the server and never from the request', async () => {
    const res = await click({ scholarship_id: 'TD-1', ranking_variant: 'fairness_adjusted', excluded_from_primary: false });
    expect(res.status).toBe(200);
    const row = inserted.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      user_id: 'u-1', scholarship_id: 'TD-1', ranking_variant: 'baseline',
      excluded_from_primary: false, rank_position: 2, was_personalized: true, served_fairness_mode: 'off',
    });
  });

  it('an anonymous click is recorded, excluded, and costs no database read', async () => {
    world.user = null;
    await click();
    const row = inserted.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ user_id: null, ranking_variant: null, excluded_from_primary: true });
  });

  it('still records the click when the profile read fails, marked unbound and excluded', async () => {
    world.profile = { data: null, error: { message: 'boom' } };
    expect((await click()).status).toBe(200);
    expect(inserted.mock.calls[0][0]).toMatchObject({ ranking_variant: null, excluded_from_primary: true, binding_source: 'server_unbound' });
  });

  it('still records the click when the service role is missing, marked unbound', async () => {
    world.admin = false;
    expect((await click()).status).toBe(200);
    expect(inserted.mock.calls[0][0]).toMatchObject({ excluded_from_primary: true, binding_source: 'server_unbound' });
  });

  it('a failed impression lookup costs the rank only, not the arm', async () => {
    world.impression = { data: null, error: { message: 'boom' } };
    await click();
    expect(inserted.mock.calls[0][0]).toMatchObject({ ranking_variant: 'baseline', excluded_from_primary: false, rank_position: null });
  });

  it('reports an insert failure instead of pretending it worked, without leaking the database message', async () => {
    inserted.mockResolvedValueOnce({ error: { code: '42703', message: 'column "x" does not exist' } });
    const res = await click();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('column');
  });

  it('rejects a body with no scholarship_id', async () => {
    expect((await click({})).status).toBe(400);
    expect(inserted).not.toHaveBeenCalled();
  });
});
