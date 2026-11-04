/**
 * /scholarships tells students what the page is and what to do next.
 *
 * Behaviour lives in two pure helpers (matchProfileGaps, matchCountLine) and is
 * tested directly; the page wiring is pinned at the source level, in the style
 * of passwordlessAuth.test.ts, because vitest here does not render TSX.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchProfileGaps } from '@/lib/profile/matchGaps';
import { matchCountLine } from '@/lib/scholarships/matchCountLine';
import { translations } from '@/lib/translations';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const PAGE = read('app/scholarships/ScholarshipsClient.tsx');
const THAI = /[฀-๿]/;

describe('matchProfileGaps — only the answers the matcher reads', () => {
  const full = {
    grade_level: 'M4-M6', grade_year: 6, gpa: 3.2, province: 'ขอนแก่น',
    income_bracket: 2, fields_of_interest: ['engineering'],
  };

  it('a complete profile has no gaps', () => {
    expect(matchProfileGaps(full)).toEqual({ missing: [], percent: 100 });
  });

  it('the /start sign-up shape: income missing, named first among the gaps', () => {
    const g = matchProfileGaps({ ...full, income_bracket: null, fields_of_interest: ['any'] });
    expect(g.missing).toEqual(['income_bracket', 'fields_of_interest']);
    expect(g.percent).toBe(67);
  });

  it("['any'] and [] both count as no field chosen", () => {
    expect(matchProfileGaps({ ...full, fields_of_interest: ['any'] }).missing).toContain('fields_of_interest');
    expect(matchProfileGaps({ ...full, fields_of_interest: [] }).missing).toContain('fields_of_interest');
  });

  it('asks for the year only at school levels', () => {
    expect(matchProfileGaps({ ...full, grade_year: null }).missing).toContain('grade_year');
    const uni = matchProfileGaps({ ...full, grade_level: 'Undergraduate', grade_year: null });
    expect(uni.missing).not.toContain('grade_year');
    expect(uni.percent).toBe(100);
  });

  it('GPA 0 is an answer, not a gap', () => {
    expect(matchProfileGaps({ ...full, gpa: 0 }).missing).not.toContain('gpa');
  });
});

describe('matchCountLine — no more "คะแนน 0%+"', () => {
  it('no filter: how many match, and how many are on screen', () => {
    expect(matchCountLine({ total: 50, filteredCount: 50, visibleCount: 20, minScore: 0, lang: 'th' }))
      .toBe('ทุนที่ตรงกับคุณ 50 ทุน · แสดง 20 ทุนแรก');
    expect(matchCountLine({ total: 12, filteredCount: 12, visibleCount: 12, minScore: 0, lang: 'th' }))
      .toBe('ทุนที่ตรงกับคุณ 12 ทุน');
  });

  it('a % filter: how many it keeps', () => {
    expect(matchCountLine({ total: 50, filteredCount: 12, visibleCount: 12, minScore: 0.7, lang: 'th' }))
      .toBe('ตรงกับคุณ 70% ขึ้นไป: 12 ทุน');
    expect(matchCountLine({ total: 50, filteredCount: 30, visibleCount: 20, minScore: 0.5, lang: 'th' }))
      .toBe('ตรงกับคุณ 50% ขึ้นไป: 30 ทุน · แสดง 20 ทุนแรก');
  });

  it('never says "คะแนน 0%+" again', () => {
    expect(PAGE).not.toContain('คะแนน ${Math.round(minScore * 100)}%+');
  });
});

describe('the page', () => {
  it('renders the search box outside both tab bodies, above the tabs', () => {
    const search = PAGE.indexOf('onChange={e => onSearchChange(e.target.value)}');
    const tabs = PAGE.indexOf("(user ? ['matches', 'browse'] as Tab[] : ['browse'] as Tab[])");
    const matchesBody = PAGE.indexOf("{activeTab === 'matches' && user && (");
    const browseBody = PAGE.indexOf("{activeTab === 'browse' && (");
    expect(search).toBeGreaterThan(-1);
    expect(search).toBeLessThan(tabs);
    expect(search).toBeLessThan(matchesBody);
    expect(search).toBeLessThan(browseBody);
    // Exactly one search input: the old one in the browse tab is gone.
    expect(PAGE.match(/value=\{tdSearch\}/g)).toHaveLength(1);
  });

  it('a search typed on matches moves to browse, which searches everything', () => {
    expect(PAGE).toMatch(/if \(value\.trim\(\) && activeTab === 'matches'\) setActiveTab\('browse'\)/);
  });

  it('logs a search once it settles, with the tab it came from', () => {
    expect(PAGE).toContain('SEARCH_LOG_DELAY_MS');
    expect(PAGE).toContain('from_tab: searchFromTab.current');
    // The per-keystroke logger inside onChange is gone.
    expect(PAGE).not.toMatch(/onChange=\{e => \{\s*setTdSearch/);
  });

  it('remembers the guide dismissal under a fixed key, and survives blocked storage', () => {
    expect(PAGE).toContain("const GUIDE_DISMISSED_KEY = 'tundee_matches_guide_dismissed'");
    expect(PAGE).toMatch(/try \{ setGuideDismissed\(localStorage\.getItem\(GUIDE_DISMISSED_KEY\) === '1'\); \}/);
  });

  it('sends guests to the /start quiz first, and keeps sign-in as the secondary link', () => {
    const cta = PAGE.indexOf('href="/start"');
    const signIn = PAGE.indexOf('href="/auth?from=scholarships"');
    expect(cta).toBeGreaterThan(-1);
    expect(signIn).toBeGreaterThan(cta);
    expect(PAGE).toContain("eventType: 'guest_start_cta_clicked'");
  });

  it('on matches: profile card, then guide, then the results controls', () => {
    const card = PAGE.indexOf('{profileGaps && profileGaps.missing.length > 0 && (');
    const guide = PAGE.indexOf('{!guideDismissed && (');
    const controls = PAGE.indexOf('<MatchControls');
    expect(card).toBeGreaterThan(-1);
    expect(card).toBeLessThan(guide);
    expect(guide).toBeLessThan(controls);
  });

  it('badges only the browse cards that are in the student’s matches', () => {
    expect(PAGE).toContain('matchInfo={matchById.get(s.scholarship_id)}');
  });

  it('does not touch the ranking or the impression logger', () => {
    expect(PAGE).toContain("logImpressions(\n      fresh.map((s, i) => ({ scholarshipId: s.scholarship_id, rank: i + 1 })),");
    expect(PAGE).toContain('fairness_mode: fairnessMode, variant: rankingVariant ?? \'baseline\', limit: 50,');
  });
});

describe('copy', () => {
  const b = translations.browse;
  it('every new string has Thai', () => {
    for (const k of [
      'subtitleMatches', 'searchPlaceholder', 'searchAllNote', 'guideTitle', 'guideStep1', 'guideStep2',
      'guideStep3', 'profileNudgeCta', 'completeProfileCta', 'guestTitle', 'guestBody', 'guestCta',
      'guestSignIn', 'scoreExplain',
    ] as const) {
      expect(b[k].th, k).toMatch(THAI);
    }
    expect(b.profileNudge.th(60)).toContain('60%');
  });
});

describe('events', () => {
  it('every new event type is in the TypeScript union and in the v35 SQL', () => {
    const funnel = read('lib/research/funnel.ts');
    const sql = read('scripts/20261104_v35_scholarships_guidance_events.sql');
    for (const e of ['guide_dismissed', 'profile_nudge_clicked', 'guest_start_cta_clicked']) {
      expect(funnel).toContain(`| '${e}'`);
      expect(sql).toContain(`ADD VALUE IF NOT EXISTS '${e}'`);
      expect(PAGE).toContain(`eventType: '${e}'`);
    }
  });
});
