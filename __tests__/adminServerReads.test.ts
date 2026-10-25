/**
 * The admin dashboard's analytics are read on the server, so the admin_* views can be
 * locked to the service role (v32).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(p, 'utf8');
const ADMIN_VIEWS = ['admin_summary', 'admin_daily_signups', 'admin_daily_active', 'admin_top_scholarships', 'admin_province_stats'];

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue;
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : /\.(ts|tsx)$/.test(n) && out.push(p);
  }
  return out;
}

describe('no browser code reads an admin view', () => {
  const sources = [...walk('app'), ...walk('components'), ...walk('lib')];

  it.each(ADMIN_VIEWS)('%s is read only by the analytics route', (view) => {
    const readers = sources.filter((f) => read(f).includes(view));
    expect(readers).toEqual(['app/api/admin/analytics/route.ts']);
  });

  it('the admin page fetches the route and names no view', () => {
    const page = read('app/admin/page.tsx');
    expect(page).toContain("fetch('/api/admin/analytics'");
    for (const v of ADMIN_VIEWS) expect(page).not.toContain(v);
  });
});

describe('v32', () => {
  const sql = read('scripts/20261031_v32_lock_admin_views.sql');
  const live = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

  it('locks exactly the five views and nothing else changes', () => {
    for (const v of ADMIN_VIEWS) expect(sql).toContain(`'${v}'`);
    for (const bad of [/\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bTRUNCATE\b/i, /\bDROP\b/i, /\bALTER\b/i, /\bCREATE\b/i]) {
      expect(live).not.toMatch(bad);
    }
    expect(live).toMatch(/REVOKE ALL ON public\.%I FROM PUBLIC, anon, authenticated/);
    expect(live).toMatch(/GRANT SELECT ON public\.%I TO service_role/);
  });

  it('does not touch platform_rollouts: it only says to look first', () => {
    expect(live).not.toContain('platform_rollouts');
    expect(sql).toContain('platform_rollouts');
  });
});

// ── The route ────────────────────────────────────────────────────────────────
const world = vi.hoisted(() => ({
  user: { id: 'u', email: 'boss@example.com' } as { id: string; email: string } | null,
  admin: true,
  fail: new Set<string>(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: world.user } }) } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => (world.admin ? {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'limit', 'eq', 'not']) q[m] = () => q;
      const result = () => {
        if (world.fail.has(table)) return { data: null, error: { message: 'boom detail' }, count: null };
        switch (table) {
          case 'admin_summary': return { data: { total_users: 123 }, error: null };
          case 'admin_daily_signups': return { data: [{ day: '2026-10-25', new_users: 4 }], error: null };
          case 'admin_daily_active': return { data: [{ day: '2026-10-25', active_users: 9 }], error: null };
          case 'admin_top_scholarships': return { data: [{ scholarship_id: 'TD-1' }], error: null };
          case 'admin_province_stats': return { data: [{ province: 'ขอนแก่น', users: 10 }], error: null };
          case 'profiles': return { data: [{ recruitment_source: 'organic' }, { recruitment_source: 'organic' }, { recruitment_source: 'bkk_2026' }], error: null, count: 7 };
          default: return { data: [], error: null, count: 3 };
        }
      };
      q.maybeSingle = async () => result();
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
      return q;
    },
  } : null),
}));

import { GET } from '@/app/api/admin/analytics/route';

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_EMAIL = 'boss@example.com';
  world.user = { id: 'u', email: 'boss@example.com' };
  world.admin = true;
  world.fail = new Set();
});

describe('GET /api/admin/analytics', () => {
  it('refuses a visitor (401), a signed-in non-admin (403), and everyone when no admin is configured', async () => {
    world.user = null;
    expect((await GET()).status).toBe(401);
    world.user = { id: 'x', email: 'student@example.com' };
    expect((await GET()).status).toBe(403);
    world.user = { id: 'u', email: 'boss@example.com' };
    delete process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    expect((await GET()).status).toBe(403);
  });

  it('returns the figures the page shows', async () => {
    const body = await (await GET()).json();
    expect(body.summary).toEqual({ total_users: 123 });
    expect(body.signups).toHaveLength(1);
    expect(body.active).toHaveLength(1);
    expect(body.top).toHaveLength(1);
    expect(body.provinces).toHaveLength(1);
    expect(body.research.recruitmentSources).toEqual([{ source: 'organic', count: 2 }, { source: 'bkk_2026', count: 1 }]);
    expect(body.errors).toEqual([]);
  });

  it('names a failed read in `errors` instead of turning it into a quiet zero, without leaking the message', async () => {
    world.fail = new Set(['admin_summary']);
    const res = await GET();
    const text = await res.text();
    expect(JSON.parse(text).errors).toContain('summary');
    expect(JSON.parse(text).summary).toBeNull();
    expect(text).not.toContain('boom detail');
  });

  it('is an error, not an empty page, when the service role is missing', async () => {
    world.admin = false;
    expect((await GET()).status).toBe(500);
  });

  it('shows nothing split by arm', () => {
    const src = read('app/api/admin/analytics/route.ts').split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(src).not.toMatch(/ranking_variant|ab_arm|fairness/i);
  });
});
