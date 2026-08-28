/**
 * Randomization properties for the fairness-ranking trial.
 *
 * These assert the guarantees research/PREREGISTRATION.md §4 makes to a
 * reviewer. A failure here is a research-integrity defect, not a UI bug.
 */

import { describe, it, expect } from 'vitest';
import {
  computeRankingVariant,
  regionGroup,
  isTargetPopulation,
  computeFairnessEligible,
  recruitmentSourceFrom,
  stratumKey,
  NORTHEAST_PROVINCES,
  ASSIGNMENT_ALGORITHM_VERSION,
} from '@/lib/research/assignment';

const SALT = 'test-salt-not-the-production-one';
const OTHER_SALT = 'a-different-salt-entirely-abcdef';

/** Deterministic pseudo-UUIDs, so the suite never depends on Math.random. */
function uuidAt(i: number): string {
  const hex = i.toString(16).padStart(8, '0').repeat(4);
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20, 32),
  ].join('-');
}

describe('computeRankingVariant — determinism (PREREG §4)', () => {
  it('returns the same arm for the same user every time', () => {
    const u = uuidAt(42);
    const first = computeRankingVariant(u, 'northeast|2', SALT);
    for (let i = 0; i < 100; i++) {
      expect(computeRankingVariant(u, 'northeast|2', SALT)).toBe(first);
    }
  });

  it('only ever returns one of the two pre-registered arms', () => {
    for (let i = 0; i < 500; i++) {
      const v = computeRankingVariant(uuidAt(i), 'northeast|1', SALT);
      expect(['baseline', 'fairness_adjusted']).toContain(v);
    }
  });
});

describe('computeRankingVariant — balance (PREREG §4)', () => {
  it('splits about 50/50 within a single stratum', () => {
    let adjusted = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      if (computeRankingVariant(uuidAt(i), 'northeast|2', SALT) === 'fairness_adjusted') adjusted++;
    }
    const share = adjusted / N;
    // ±2pp: far outside sampling noise at N=20000, tight enough to catch a
    // systematically skewed hash.
    expect(share).toBeGreaterThan(0.48);
    expect(share).toBeLessThan(0.52);
  });

  it('balances within EACH stratum, not merely overall', () => {
    const strata = ['northeast|1', 'northeast|3', 'bangkok_metro|5', 'other|7'];
    for (const s of strata) {
      let adjusted = 0;
      const N = 8000;
      for (let i = 0; i < N; i++) {
        if (computeRankingVariant(uuidAt(i), s, SALT) === 'fairness_adjusted') adjusted++;
      }
      const share = adjusted / N;
      expect(share, `stratum ${s} is skewed`).toBeGreaterThan(0.47);
      expect(share, `stratum ${s} is skewed`).toBeLessThan(0.53);
    }
  });

  it('assigns strata independently — the same user can differ across strata', () => {
    let differs = 0;
    for (let i = 0; i < 1000; i++) {
      const u = uuidAt(i);
      if (computeRankingVariant(u, 'northeast|1', SALT)
          !== computeRankingVariant(u, 'bangkok_metro|6', SALT)) differs++;
    }
    // Independent hashing → disagreement near half. If the stratum were being
    // ignored this would be 0.
    expect(differs).toBeGreaterThan(400);
    expect(differs).toBeLessThan(600);
  });
});

describe('computeRankingVariant — the salt is real (PREREG §4)', () => {
  it('changing the salt reshuffles arms, which is why it must never change', () => {
    let differs = 0;
    for (let i = 0; i < 1000; i++) {
      const u = uuidAt(i);
      if (computeRankingVariant(u, 'northeast|2', SALT)
          !== computeRankingVariant(u, 'northeast|2', OTHER_SALT)) differs++;
    }
    expect(differs).toBeGreaterThan(400);
  });

  it('refuses to assign with a missing salt', () => {
    expect(() => computeRankingVariant(uuidAt(1), 'northeast|2', '')).toThrow(/SALT/);
  });

  it('refuses to assign with a salt too short to be a secret', () => {
    expect(() => computeRankingVariant(uuidAt(1), 'northeast|2', 'short')).toThrow(/16 characters/);
  });
});

describe('regionGroup — a property of the user (PREREG §5.1)', () => {
  it('classifies all 20 Isan provinces as northeast', () => {
    expect(NORTHEAST_PROVINCES.size).toBe(20);
    for (const p of NORTHEAST_PROVINCES) expect(regionGroup(p)).toBe('northeast');
  });

  it('classifies the Bangkok metro provinces', () => {
    for (const p of ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ']) {
      expect(regionGroup(p)).toBe('bangkok_metro');
    }
  });

  it('classifies everything else as other, and null province as null', () => {
    expect(regionGroup('เชียงใหม่')).toBe('other');
    expect(regionGroup('ภูเก็ต')).toBe('other');
    expect(regionGroup(null)).toBeNull();
    expect(regionGroup(undefined)).toBeNull();
  });
});

describe('is_target_population (PREREG §5.3)', () => {
  it('requires BOTH northeast and income_bracket <= 3', () => {
    expect(isTargetPopulation('ขอนแก่น', 1)).toBe(true);
    expect(isTargetPopulation('ขอนแก่น', 3)).toBe(true);
    expect(isTargetPopulation('ขอนแก่น', 4)).toBe(false);   // rural, not low income
    expect(isTargetPopulation('กรุงเทพมหานคร', 1)).toBe(false); // low income, not rural
    expect(isTargetPopulation('เชียงใหม่', 2)).toBe(false);
  });

  it('is false when income is unknown rather than assuming a bracket', () => {
    expect(isTargetPopulation('ขอนแก่น', null)).toBe(false);
    expect(isTargetPopulation('ขอนแก่น', undefined)).toBe(false);
  });

  it('fairness eligibility matches the target population definition', () => {
    for (const [prov, inc] of [['ขอนแก่น', 2], ['กรุงเทพมหานคร', 2], ['เลย', 6]] as const) {
      expect(computeFairnessEligible(prov, inc)).toBe(isTargetPopulation(prov, inc));
    }
  });
});

describe('recruitment_source (PREREG §5.4)', () => {
  it('recognises exactly the two campaigns', () => {
    expect(recruitmentSourceFrom('isaan_2026')).toBe('isaan_2026');
    expect(recruitmentSourceFrom('bkk_2026')).toBe('bkk_2026');
  });

  it('treats anything else, including absent, as organic', () => {
    for (const v of ['', 'ISAAN_2026', 'isaan_2025', 'facebook', null, undefined]) {
      expect(recruitmentSourceFrom(v)).toBe('organic');
    }
  });

  it('is INDEPENDENT of region_group — the Khon Kaen student on the Bangkok ad', () => {
    const province = 'ขอนแก่น';
    expect(regionGroup(province)).toBe('northeast');
    expect(recruitmentSourceFrom('bkk_2026')).toBe('bkk_2026');
  });
});

describe('stratumKey', () => {
  it('combines region group and income bracket', () => {
    expect(stratumKey('ขอนแก่น', 2)).toBe('northeast|2');
    expect(stratumKey('กรุงเทพมหานคร', 5)).toBe('bangkok_metro|5');
  });

  it('marks unknowns explicitly rather than silently bucketing them', () => {
    expect(stratumKey(null, 2)).toBe('unknown|2');
    expect(stratumKey('ขอนแก่น', null)).toBe('northeast|unknown');
  });
});

describe('algorithm version', () => {
  it('is a non-empty string stamped on every assignment', () => {
    expect(ASSIGNMENT_ALGORITHM_VERSION).toMatch(/\S/);
  });
});
