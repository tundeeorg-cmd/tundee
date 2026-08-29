/**
 * Profiles the "ทุนที่ตรงกับคุณ" path. Measurement only — changes nothing.
 *
 *   npm run analyze
 *
 * Reads the live scholarship set with the anon key, so row counts and payload
 * sizes are what a real signed-in user's browser actually receives.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { describe, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { recommend } from '@/lib/recommender';
import type { RecommenderProfile } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';

loadEnv({ path: '.env.local' });

// Exactly the column list app/scholarships/page.tsx requests.
const COLUMNS = [
  'scholarship_id',
  'scholarship_name_en', 'scholarship_name_th', 'scholarship_name',
  'funder_en', 'funder_th', 'funder',
  'funder_type', 'level', 'field_of_study',
  'award_value_tier', 'award_amount_thb_numeric', 'award_type',
  'renewable', 'bond_obligation',
  'region_eligibility', 'targets_low_income', 'welfare_card_priority',
  'income_cap_thb', 'num_recipients', 'min_gpa', 'english_requirement',
  'open_date', 'date_confidence',
  'deadline_raw', 'deadline_date', 'deadline_is_rolling', 'deadline_note',
  'status', 'status_effective', 'application_url', 'application_link',
  'is_displayed', 'stale', 'source_language', 'translation_review',
].join(', ');

/** Fields the match card actually renders, per components/TdScholarshipCard. */
const CARD_FIELDS = new Set([
  'scholarship_id', 'scholarship_name_th', 'scholarship_name_en', 'scholarship_name',
  'funder_th', 'funder_en', 'funder', 'funder_type', 'level',
  'award_value_tier', 'deadline_date', 'deadline_raw', 'deadline_is_rolling',
  'status_effective', 'application_url', 'application_link', 'renewable',
  'field_of_study', 'region_eligibility',
]);

function profile(i: number, over: Partial<RecommenderProfile> = {}): RecommenderProfile {
  const NE = ['ขอนแก่น', 'อุบลราชธานี', 'นครราชสีมา', 'เลย'];
  return {
    user_id: `perf-${i}`,
    province_id: NE[i % NE.length],
    income_bracket: (i % 3) + 1,
    gpa: 2.6 + (i % 6) * 0.2,
    grade_level: 'M4-M6',
    fields_of_interest: [],
    welfare_card: i % 2 === 0,
    region: null, area_type: null,
    household_income_band: null, intended_level: null, intended_field: null,
    ...over,
  };
}

describe('match path profile', () => {
  it('measures fetch, payload and scoring', async () => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // ── 1. the fetch the page issues ────────────────────────────────────────
    const t0 = performance.now();
    const { data, error } = await sb
      .from('td_scholarships')
      .select(COLUMNS)
      .eq('is_displayed', true)
      .order('scholarship_name_en');
    const fetchMs = performance.now() - t0;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as TdScholarship[];
    const json = JSON.stringify(rows);
    const bytes = Buffer.byteLength(json, 'utf8');

    // ── 2. how much of that payload the card never shows ────────────────────
    const keys = Object.keys((rows[0] ?? {}) as unknown as Record<string, unknown>);
    const unused = keys.filter(k => !CARD_FIELDS.has(k));
    const unusedBytes = Buffer.byteLength(
      JSON.stringify(rows.map(r => {
        const o: Record<string, unknown> = {};
        for (const k of unused) o[k] = (r as unknown as unknown as Record<string, unknown>)[k];
        return o;
      })), 'utf8');

    // ── 3. scoring, which today runs in the browser ─────────────────────────
    const runs: number[] = [];
    for (let i = 0; i < 12; i++) {
      const p = profile(i);
      const s = performance.now();
      recommend(rows, p, { fairness_mode: 'on', variant: 'fairness_adjusted', limit: 50 });
      runs.push(performance.now() - s);
    }
    runs.sort((a, b) => a - b);
    const median = runs[Math.floor(runs.length / 2)];

    const kb = (n: number) => (n / 1024).toFixed(1);
    console.log('\n  ── match path, measured ────────────────────────────────');
    console.log('  rows fetched                 ', rows.length);
    console.log('  columns selected             ', keys.length);
    console.log('  columns the card never shows ', unused.length);
    console.log('  payload (uncompressed)       ', kb(bytes), 'KB');
    console.log('  of which never displayed     ', kb(unusedBytes), 'KB',
                `(${Math.round((unusedBytes / bytes) * 100)}%)`);
    console.log('  fetch round-trip (this host) ', fetchMs.toFixed(0), 'ms');
    console.log('');
    console.log('  scoring, median of 12 runs   ', median.toFixed(1), 'ms   [dev machine]');
    console.log('  scoring, min / max           ', runs[0].toFixed(1), '/', runs[runs.length - 1].toFixed(1), 'ms');
    console.log('  x4 CPU throttle (est.)       ', (median * 4).toFixed(0), 'ms');
    console.log('  x10 budget Android (est.)    ', (median * 10).toFixed(0), 'ms');
    console.log('  ────────────────────────────────────────────────────────\n');
  }, 120_000);
});
