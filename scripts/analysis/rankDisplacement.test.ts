/**
 * Rank-displacement measurement for the fairness intervention.
 *
 * Answers the question the study depends on: when the Equalized Odds
 * correction is applied, how much does the ranking a student sees ACTUALLY
 * change? If the answer is "barely", the trial is powered to detect an effect
 * the manipulation is too weak to produce.
 *
 * Runs the real recommender over the real displayed scholarship set, for
 * synthetic profiles drawn from the target population (PREREG §5.3). Reads the
 * database with the anon key; writes nothing.
 *
 * Not part of the unit suite — it needs network. Run explicitly:
 *   npx vitest run scripts/analysis/rankDisplacement.test.ts
 */

import { describe, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { recommend } from '@/lib/recommender';
import type { RecommenderProfile } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';

const NE = ['ขอนแก่น', 'อุบลราชธานี', 'นครราชสีมา', 'อุดรธานี', 'ร้อยเอ็ด', 'เลย', 'สุรินทร์', 'บุรีรัมย์'];
const LEVELS = ['M4-M6', 'uni', 'vocational'];
const TOP_N = 10;

function profile(i: number): RecommenderProfile {
  return {
    user_id: `sim-${i}`,
    province_id: NE[i % NE.length],
    income_bracket: (i % 3) + 1,          // 1..3 — the target population
    gpa: 2.5 + ((i % 7) * 0.2),           // 2.5 .. 3.7
    grade_level: LEVELS[i % LEVELS.length],
    fields_of_interest: [],
    welfare_card: i % 2 === 0,
    region: null, area_type: null,        // exactly as /scholarships builds it
    household_income_band: null, intended_level: null, intended_field: null,
  };
}

describe('rank displacement: fairness ON vs OFF', () => {
  it('measures how much the served ranking actually moves', async () => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data, error } = await sb
      .from('td_scholarships')
      .select('*')
      .eq('is_displayed', true)
      .limit(1000);

    if (error) throw new Error(`scholarship fetch failed: ${error.message}`);
    const rows = (data ?? []) as unknown as TdScholarship[];

    let profiles = 0, anyChange = 0, top1Changed = 0;
    let sumMeanAbsShift = 0, sumEntered = 0, maxShiftSeen = 0, sumBoosted = 0;

    for (let i = 0; i < 60; i++) {
      const p = profile(i);
      const off = recommend(rows, p, { fairness_mode: 'off', variant: 'baseline', limit: 50 });
      const on  = recommend(rows, p, { fairness_mode: 'on',  variant: 'fairness_adjusted', limit: 50 });
      if (off.items.length === 0) continue;
      profiles++;

      const offRank = new Map(off.items.map((it, idx) => [it.scholarship.scholarship_id, idx + 1]));
      const onTop   = on.items.slice(0, TOP_N);
      const offTop  = off.items.slice(0, TOP_N).map(it => it.scholarship.scholarship_id);

      let shifts = 0, shiftSum = 0, localMax = 0;
      for (let k = 0; k < onTop.length; k++) {
        const id = onTop[k].scholarship.scholarship_id;
        const was = offRank.get(id);
        if (was === undefined) continue;
        const d = Math.abs(was - (k + 1));
        shiftSum += d; shifts++;
        if (d > localMax) localMax = d;
      }

      const entered = onTop.filter(it => !offTop.includes(it.scholarship.scholarship_id)).length;
      const boosted = on.items.filter(it => it.fairness_boosted).length;

      sumMeanAbsShift += shifts ? shiftSum / shifts : 0;
      sumEntered += entered;
      sumBoosted += boosted;
      if (localMax > maxShiftSeen) maxShiftSeen = localMax;
      if (entered > 0 || localMax > 0) anyChange++;
      if (onTop[0]?.scholarship.scholarship_id !== offTop[0]) top1Changed++;
    }

    const pct = (n: number) => ((100 * n) / profiles).toFixed(1) + '%';
    console.log('\n  ── Rank displacement, fairness ON vs OFF ──────────────────');
    console.log('  scholarships in pool          ', rows.length);
    console.log('  target-population profiles    ', profiles);
    console.log('  profiles whose top-10 changed ', `${anyChange} (${pct(anyChange)})`);
    console.log('  profiles whose #1 changed     ', `${top1Changed} (${pct(top1Changed)})`);
    console.log('  mean |rank shift| in top 10   ', (sumMeanAbsShift / profiles).toFixed(2), 'positions');
    console.log('  mean new entrants into top 10 ', (sumEntered / profiles).toFixed(2), 'of 10');
    console.log('  largest single shift observed ', maxShiftSeen, 'positions');
    console.log('  mean boosted items per profile', (sumBoosted / profiles).toFixed(1), 'of 50 returned');
    console.log('  ───────────────────────────────────────────────────────────\n');
  }, 120_000);
});
