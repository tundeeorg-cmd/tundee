/**
 * Proves the matched set and its ranked order are IDENTICAL before and after
 * a change to which columns we fetch.
 *
 * The ranking is experiment data. A column silently dropped that the scorer
 * reads would not throw — it would score as null and quietly reorder results,
 * which is indistinguishable from a real effect in the analysis. So the trim is
 * proven against the live scholarship set, not reasoned about.
 *
 *   npm run analyze
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { recommend } from '@/lib/recommender';
import type { RecommenderProfile } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';

loadEnv({ path: '.env.local' });

const FULL = ['scholarship_id','scholarship_name_en','scholarship_name_th','scholarship_name',
  'funder_en','funder_th','funder','funder_type','level','field_of_study','award_value_tier',
  'award_amount_thb_numeric','award_type','renewable','bond_obligation','region_eligibility',
  'targets_low_income','welfare_card_priority','income_cap_thb','num_recipients','min_gpa',
  'english_requirement','open_date','date_confidence','deadline_raw','deadline_date',
  'deadline_is_rolling','deadline_note','status','status_effective','application_url',
  'application_link','is_displayed','stale','source_language','translation_review'].join(', ');

/** Union of: every field the recommender reads, every field the card renders,
 *  and every field the browse tab filters or sorts on. */
const TRIMMED = ['scholarship_id','scholarship_name_en','scholarship_name_th','scholarship_name',
  'funder_en','funder_th','funder','funder_type','level','field_of_study','award_value_tier',
  'renewable','bond_obligation','region_eligibility','targets_low_income','welfare_card_priority',
  'income_cap_thb','num_recipients','min_gpa','deadline_raw','deadline_date',
  'deadline_is_rolling','status','status_effective','application_url','application_link',
  'is_displayed'].join(', ');

/** Ten diverse profiles, including both fairness paths and the boundaries. */
const FIXTURES: { name: string; p: RecommenderProfile }[] = [
  ['NE low income (fairness ACTIVE)',      { province_id: 'ขอนแก่น',        income_bracket: 1, gpa: 3.2 }],
  ['NE bracket 3 (boundary, ACTIVE)',      { province_id: 'อุบลราชธานี',     income_bracket: 3, gpa: 2.8 }],
  ['NE bracket 4 (boundary, INACTIVE)',    { province_id: 'อุบลราชธานี',     income_bracket: 4, gpa: 2.8 }],
  ['Bangkok low income (INACTIVE)',        { province_id: 'กรุงเทพมหานคร',  income_bracket: 1, gpa: 3.5 }],
  ['Chiang Mai (other region)',            { province_id: 'เชียงใหม่',        income_bracket: 2, gpa: 3.0 }],
  ['NE welfare card holder',               { province_id: 'เลย',            income_bracket: 1, gpa: 2.5, welfare_card: true }],
  ['high GPA',                             { province_id: 'นครราชสีมา',      income_bracket: 2, gpa: 4.0 }],
  ['GPA 0 (likely few matches)',           { province_id: 'สุรินทร์',         income_bracket: 1, gpa: 0 }],
  ['university level',                     { province_id: 'ขอนแก่น',        income_bracket: 3, gpa: 3.1, grade_level: 'uni' }],
  ['unknown province',                     { province_id: 'Atlantis',       income_bracket: 7, gpa: 3.0 }],
].map(([name, over]) => ({
  name: name as string,
  p: {
    user_id: 'fixture', grade_level: 'M4-M6', fields_of_interest: [], welfare_card: false,
    region: null, area_type: null, household_income_band: null,
    intended_level: null, intended_field: null,
    ...(over as object),
  } as unknown as RecommenderProfile,
}));

async function fetchRows(columns: string): Promise<TdScholarship[]> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await sb.from('td_scholarships').select(columns)
    .eq('is_displayed', true).order('scholarship_name_en');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TdScholarship[];
}

/** The ranked list — ids in order, plus scores, which is what must not move. */
function rank(rows: TdScholarship[], p: RecommenderProfile, mode: 'on' | 'off') {
  return recommend(rows, p, { fairness_mode: mode, variant: mode === 'on' ? 'fairness_adjusted' : 'baseline', limit: 50 })
    .items.map(i => `${i.scholarship.scholarship_id}@${i.fairness_score.toFixed(6)}`);
}

describe('column trim does not change the ranking', () => {
  it('produces identical ids AND order for every fixture, both arms', async () => {
    const full = await fetchRows(FULL);
    const trimmed = await fetchRows(TRIMMED);
    expect(full.length).toBe(trimmed.length);

    let identical = 0;
    const diffs: string[] = [];

    for (const { name, p } of FIXTURES) {
      for (const mode of ['off', 'on'] as const) {
        const a = rank(full, p, mode);
        const b = rank(trimmed, p, mode);
        if (JSON.stringify(a) === JSON.stringify(b)) {
          identical++;
        } else {
          const firstDiff = a.findIndex((x, i) => x !== b[i]);
          diffs.push(`${name} [${mode}]: ${a.length} vs ${b.length} items, first difference at rank ${firstDiff + 1}`);
        }
      }
      const on = rank(full, p, 'on');
      console.log(`  ${name.padEnd(36)} ${String(on.length).padStart(3)} matches`);
    }

    console.log('');
    console.log(`  comparisons identical: ${identical}/${FIXTURES.length * 2}`);
    if (diffs.length) { console.log('  DIFFERENCES:'); diffs.forEach(d => console.log('   ', d)); }
    expect(diffs).toEqual([]);
  }, 120_000);
});
