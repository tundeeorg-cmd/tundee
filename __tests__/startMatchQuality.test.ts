/**
 * Task 7 (2026-11-22 walkthrough): the test profile ปริญญาตรี / ขอนแก่น / income 2 /
 * no GPA got 136 results with a tobacco-industry research grant, a child-sponsorship
 * programme, Gates Cambridge and the Swiss Government scholarships in its top 10.
 * None of those may reach that profile; real undergraduate awards must.
 *
 * Plus the route: "ดูเพิ่มอีก 10 ทุน" pages through the same ranked list, and every
 * card served to a randomized visitor is an impression with its true rank.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { recommend } from '@/lib/recommender/recommend';
import { isEligible } from '@/lib/recommender/eligibility';
import { effectiveScholarshipLevel } from '@/lib/recommender/gradeLevel';
import { matchExclusion } from '@/lib/recommender/exclusions';
import { filterForUnknownGpa, UNKNOWN_GPA_SENTINEL } from '@/lib/recommender/unknownGpa';
import type { RecommenderProfile } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';

const NOW = new Date('2026-11-22T00:00:00Z');

let n = 0;
function sch(over: Partial<TdScholarship> & Record<string, unknown>): TdScholarship {
  n++;
  return {
    scholarship_id: `TD-${String(n).padStart(4, '0')}`,
    scholarship_name: over.scholarship_name_en ?? 'x', scholarship_name_en: null, scholarship_name_th: null,
    funder: 'Funder', funder_en: null, funder_th: null,
    status: 'Open', status_effective: 'Open', is_displayed: true,
    level: 'Multiple', field_of_study: null, region_eligibility: 'National',
    min_gpa: null, income_cap_thb: null, deadline_date: '2027-03-31', targets_low_income: false,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as unknown as TdScholarship;
}

/** The profile app/api/preview-match/route.ts builds for the walkthrough answers. */
const TEST_PROFILE: RecommenderProfile = {
  user_id: 'anonymous-preview', province_id: 'ขอนแก่น', income_bracket: 2, gpa: UNKNOWN_GPA_SENTINEL,
  grade_level: 'uni', fields_of_interest: [], welfare_card: false, region: null, area_type: null,
  household_income_band: null, intended_level: 'uni', intended_field: null,
};

const BAD = {
  tobacco: sch({ scholarship_name_th: 'ทุนวิจัย Tobacco Harm Reduction (Knowledge Action Change)', funder_en: 'Knowledge Action Change' }),
  ccf: sch({ scholarship_name_th: 'ทุนโครงการอุปการะเด็ก มูลนิธิ ซี.ซี.เอฟ.', funder_th: 'มูลนิธิซี.ซี.เอฟ.' }),
  gates: sch({ scholarship_name_en: 'Gates Cambridge Scholarship', funder_en: 'Gates Cambridge Trust', level: 'Multiple' }),
  swiss: sch({ scholarship_name_en: 'Swiss Government Excellence Scholarships', funder_en: 'Swiss Confederation', level: null }),
  exeter: sch({ scholarship_name_th: 'ทุน ป.โท University of Exeter Global Excellence', level: 'Multiple' }),
  melbourne: sch({ scholarship_name_en: "Melbourne Research Scholarship (Master's by research / PhD)", level: 'Undergraduate' }),
  uwaPhd: sch({ scholarship_name_th: 'ทุนปริญญาเอก UWA', level: "PhD" }),
  msOnly: sch({ scholarship_name_en: 'Some award', level: "Master's" }),
  // Live on 2026-11-23 at rank 59 for this profile: "Graduate Scholarships" was not read as postgraduate.
  oxfordPershing: sch({ scholarship_name_en: 'Oxford-Pershing Square Graduate Scholarships 2027', funder_en: 'University of Oxford', level: 'Multiple' }),
};

const GOOD = {
  undergrad: sch({ scholarship_name_th: 'ทุนเรียนดี ป.ตรี มหาวิทยาลัยขอนแก่น', level: 'Undergraduate' }),
  kys: sch({ scholarship_name_th: 'กองทุนเงินให้กู้ยืมเพื่อการศึกษา (กยศ.)', level: 'Multiple' }),
  mixed: sch({ scholarship_name_th: 'ทุนรัฐบาล ป.ตรี-โท-เอก', level: 'Multiple' }),
  mastercard: sch({ scholarship_name_en: 'Mastercard Foundation Scholars Program', level: 'Multiple' }),
  // "Undergraduate Scholarships" must not trip the "Graduate Scholarships" rule.
  jefferson: sch({ scholarship_name_en: 'Jefferson Scholars Foundation Undergraduate Scholarships 2027', level: 'Multiple' }),
  tobaccoControl: sch({ scholarship_name_th: 'ทุนวิจัยควบคุมยาสูบ ศจย.', funder_th: 'ศูนย์วิจัยและจัดการความรู้เพื่อการควบคุมยาสูบ', level: 'Multiple' }),
};

const CATALOGUE = [...Object.values(BAD), ...Object.values(GOOD)];

function previewIds(profile = TEST_PROFILE): string[] {
  const rows = filterForUnknownGpa(CATALOGUE, null);
  return recommend(rows, profile, { fairness_mode: 'off', variant: 'anonymous', limit: 200 }, NOW).items
    .map((i) => i.scholarship.scholarship_id);
}

describe('the walkthrough profile: ปริญญาตรี / ขอนแก่น / income 2 / no GPA', () => {
  const ids = previewIds();

  it('gets no ป.โท-only, ป.เอก-only, child-sponsorship or tobacco record', () => {
    for (const [name, s] of Object.entries(BAD)) expect(ids, name).not.toContain(s.scholarship_id);
  });

  it('still gets the undergraduate and open-to-all awards', () => {
    for (const [name, s] of Object.entries(GOOD)) expect(ids, name).toContain(s.scholarship_id);
  });
});

describe('effectiveScholarshipLevel — the column, corrected by the title', () => {
  it('reads postgraduate-only wording on a Multiple / blank / Undergraduate row as graduate', () => {
    expect(effectiveScholarshipLevel(BAD.gates)).toBe('graduate');
    expect(effectiveScholarshipLevel(BAD.swiss)).toBe('graduate');
    expect(effectiveScholarshipLevel(BAD.exeter)).toBe('graduate');
    expect(effectiveScholarshipLevel(BAD.melbourne)).toBe('graduate');
    expect(effectiveScholarshipLevel(BAD.oxfordPershing)).toBe('graduate');
  });

  it('"Undergraduate Scholarships" stays undergraduate-open', () => {
    expect(effectiveScholarshipLevel(GOOD.jefferson)).toBe('multiple');
  });

  it('keeps a mixed row open when it also names ป.ตรี / bachelor', () => {
    expect(effectiveScholarshipLevel(GOOD.mixed)).toBe('multiple');
    expect(effectiveScholarshipLevel(GOOD.mastercard)).toBe('multiple');
  });

  it('child sponsorship is school-age support', () => {
    expect(effectiveScholarshipLevel(BAD.ccf)).toBe('high_school');
    // …so a secondary student still sees it.
    expect(isEligible(BAD.ccf, { ...TEST_PROFILE, grade_level: 'M4-M6', intended_level: 'M4-M6' }, NOW).eligible).toBe(true);
  });

  it('a graduate student still gets the postgraduate awards', () => {
    const grad = previewIds({ ...TEST_PROFILE, grade_level: 'graduate', intended_level: 'graduate' });
    expect(grad).toContain(BAD.gates.scholarship_id);
    expect(grad).toContain(BAD.exeter.scholarship_id);
  });
});

describe('matchExclusion — data-driven, not by id', () => {
  it('tobacco-industry funding is never matched, whatever the level', () => {
    expect(matchExclusion(BAD.tobacco)).toBe('tobacco_industry');
    expect(isEligible(BAD.tobacco, { ...TEST_PROFILE, grade_level: 'graduate', intended_level: 'graduate' }, NOW))
      .toEqual({ eligible: false, reason: 'excluded_tobacco_industry' });
    expect(matchExclusion(sch({ funder_en: 'Foundation for a Smoke-Free World' }))).toBe('tobacco_industry');
    expect(matchExclusion(sch({ funder_th: 'การยาสูบแห่งประเทศไทย' }))).toBe('tobacco_industry');
  });

  it('tobacco CONTROL research is not industry money and stays matchable', () => {
    expect(matchExclusion(GOOD.tobaccoControl)).toBeNull();
  });

  it('an admin can take any row out of matching through verification_status', () => {
    const flagged = sch({ scholarship_name_th: 'ทุนอะไรก็ได้', level: 'Undergraduate', verification_status: 'Excluded: misleading funder' });
    expect(matchExclusion(flagged)).toBe('admin_flag');
    expect(isEligible(flagged, TEST_PROFILE, NOW).eligible).toBe(false);
    expect(matchExclusion(sch({ verification_status: 'verified' }))).toBeNull();
  });

  it('names no scholarship id', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('lib/recommender/exclusions.ts', 'utf8')).not.toMatch(/TD-\d{3,}/);
  });
});

// ── The route: paging and impressions ───────────────────────────────────────

const ANON = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const state = vi.hoisted(() => ({
  catalogue: [] as unknown[],
  assignment: null as Record<string, unknown> | null,
  impressions: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/fetchAll', () => ({ fetchAllRows: async () => ({ data: state.catalogue, error: null }) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: table === 'anon_assignments' ? state.assignment : null, error: null }),
        insert: async (rows: Record<string, unknown>[]) => { state.impressions.push(...rows); return { error: null }; },
      };
      return q;
    },
  }),
}));

import { POST as previewMatch } from '@/app/api/preview-match/route';

let ipN = 0;
const ask = (body: Record<string, unknown>, cookie = `tundee_anon=${ANON}`) =>
  previewMatch(new NextRequest('https://www.tundee.org/api/preview-match', {
    method: 'POST', body: JSON.stringify(body),
    headers: { cookie, 'x-forwarded-for': `10.0.0.${++ipN}` },
  }));

describe('/api/preview-match — same ranked list, recorded impressions (tasks 2, 6)', () => {
  beforeEach(() => {
    process.env.ANON_RANDOMIZATION = 'on';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    state.catalogue = Array.from({ length: 25 }, (_, i) => sch({ scholarship_name_th: `ทุน ป.ตรี ${i}`, level: 'Undergraduate', deadline_date: `2027-01-${String(i + 1).padStart(2, '0')}` }));
    state.assignment = {
      anon_id: ANON, ranking_variant: 'baseline', ranking_assigned_at: '2026-11-22T00:00:00Z',
      assignment_algorithm_version: 'v2', stratum: 'northeast|2', fairness_eligible: true,
      research_consent_version: 'v', research_consented_at: '2026-11-22T00:00:00Z', claimed_by: null,
    };
    state.impressions = [];
  });

  it('writes one impression per served card, ranks 1–10', async () => {
    const body = await (await ask(TEST_INPUT)).json();
    expect(body.preview).toHaveLength(10);
    expect(state.impressions.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(state.impressions.map((r) => r.scholarship_id)).toEqual(body.preview.map((c: { scholarship_id: string }) => c.scholarship_id));
    expect(state.impressions[0]).toMatchObject({ anon_id: ANON, fairness_mode: 'off', variant: 'anonymous-baseline' });
  });

  it('offset 10 continues the same list: ranks 11–20, no repeats, and says how many remain', async () => {
    const first = await (await ask(TEST_INPUT)).json();
    const second = await (await ask({ ...TEST_INPUT, offset: 10 })).json();
    const a = first.preview.map((c: { scholarship_id: string }) => c.scholarship_id);
    const b = second.preview.map((c: { scholarship_id: string }) => c.scholarship_id);
    expect(b).toHaveLength(10);
    expect(a.filter((id: string) => b.includes(id))).toEqual([]);
    expect(state.impressions.slice(10).map((r) => r.rank)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(second).toMatchObject({ offset: 10, total: 25, lockedCount: 5 });
  });

  it('a visitor with no assignment (declined) gets the same list and no impression rows', async () => {
    const withArm = await (await ask(TEST_INPUT)).json();
    state.assignment = null;
    state.impressions = [];
    const declined = await (await ask(TEST_INPUT, '')).json();
    expect(declined.preview.map((c: { scholarship_id: string }) => c.scholarship_id))
      .toEqual(withArm.preview.map((c: { scholarship_id: string }) => c.scholarship_id));
    expect(state.impressions).toHaveLength(0);
  });

  it('rejects a bad offset', async () => {
    expect((await ask({ ...TEST_INPUT, offset: -5 })).status).toBe(400);
  });
});

const TEST_INPUT = { level: 'uni', province: 'ขอนแก่น', income: 2, gpa: null };
