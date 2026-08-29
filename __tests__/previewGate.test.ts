/**
 * The /start preview gate's non-visual rules.
 *
 * The gate is the conversion mechanism on paid traffic, so the parts that decide what a
 * visitor is shown — and what number is claimed at them — are pinned here.
 */

import { describe, it, expect } from 'vitest';
import { roundForDisplay, MIN_DISPLAYABLE } from '@/lib/social/userCount';
import { PREVIEW_TOP_N } from '@/lib/preview/types';

describe('roundForDisplay — the social-proof count', () => {
  it('rounds down, never up', () => {
    // "74 renders as 70+". Rounding up would claim users that do not exist.
    expect(roundForDisplay(74)).toBe(70);
    expect(roundForDisplay(79)).toBe(70);
    expect(roundForDisplay(80)).toBe(80);
  });

  it('hides itself rather than showing a discouraging number', () => {
    // "20+ students" argues against the product. Below the floor the caller renders
    // nothing at all, which is the instruction: hide the line, never a placeholder.
    expect(roundForDisplay(MIN_DISPLAYABLE - 1)).toBeNull();
    expect(roundForDisplay(0)).toBeNull();
  });

  it('hides when the count is unavailable', () => {
    expect(roundForDisplay(null)).toBeNull();
    expect(roundForDisplay(NaN)).toBeNull();
  });

  it('never returns a number the database cannot defend', () => {
    for (const n of [23, 47, 61, 99, 100, 1234]) {
      const shown = roundForDisplay(n);
      expect(shown).not.toBeNull();
      expect(shown!).toBeLessThanOrEqual(n);
      expect(shown! % 10).toBe(0);
    }
  });
});

describe('gate arithmetic', () => {
  // lockedCount is computed server-side as total - preview.length; these assertions
  // describe what the copy then claims, which is what a visitor actually reads.
  const locked = (total: number) => Math.max(0, total - Math.min(total, PREVIEW_TOP_N));

  it('shows three free cards and locks the remainder', () => {
    expect(PREVIEW_TOP_N).toBe(3);
    expect(locked(12)).toBe(9);
    expect(locked(4)).toBe(1);
  });

  it('locks nothing when the visitor has three matches or fewer', () => {
    // This is the case that used to drop the signup ask entirely: with no locked cards
    // the whole gate block was hidden and those visitors were never asked to sign up.
    for (const total of [0, 1, 2, 3]) expect(locked(total)).toBe(0);
  });
});
