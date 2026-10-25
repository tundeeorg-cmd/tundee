/**
 * The /start preview gate's non-visual rules.
 *
 * The gate is the conversion mechanism on paid traffic, so the parts that decide what a
 * visitor is shown — and what number is claimed at them — are pinned here.
 */

import { describe, it, expect } from 'vitest';
import { roundForDisplay, MIN_DISPLAYABLE, ROUND_TO } from '@/lib/social/userCount';
import { PREVIEW_TOP_N } from '@/lib/preview/types';

describe('roundForDisplay — the social-proof count', () => {
  it('rounds down, never up', () => {
    // Rounding up would claim students who do not exist.
    expect(roundForDisplay(1_340)).toBe(1_300);
    expect(roundForDisplay(1_399)).toBe(1_300);
    expect(roundForDisplay(1_400)).toBe(1_400);
  });

  it('renders nothing at all below the threshold', () => {
    // ~70 accounts today. On a site whose problem is being mistaken for a scam, a
    // truthful small number argues against signing up — so the caller shows no line,
    // never a placeholder and never a padded figure.
    expect(roundForDisplay(70)).toBeNull();
    expect(roundForDisplay(999)).toBeNull();
    expect(roundForDisplay(MIN_DISPLAYABLE - 1)).toBeNull();
    expect(roundForDisplay(0)).toBeNull();
  });

  it('starts rendering exactly at the threshold', () => {
    expect(roundForDisplay(MIN_DISPLAYABLE)).toBe(MIN_DISPLAYABLE);
  });

  it('hides when the count is unavailable', () => {
    expect(roundForDisplay(null)).toBeNull();
    expect(roundForDisplay(NaN)).toBeNull();
  });

  it('never returns a number the database cannot defend', () => {
    for (const n of [1_000, 1_001, 1_567, 2_099, 12_345]) {
      const shown = roundForDisplay(n);
      expect(shown).not.toBeNull();
      expect(shown!).toBeLessThanOrEqual(n);
      expect(shown! % ROUND_TO).toBe(0);
    }
  });

  it('keeps the threshold and the rounding as the only two knobs', () => {
    // The brief asks for one named constant to change later; this pins that there is
    // no second, hidden floor buried in the rounding.
    expect(MIN_DISPLAYABLE % ROUND_TO).toBe(0);
  });
});

describe('nothing is gated', () => {
  // lockedCount is computed server-side as total - preview.length. It is the count of
  // eligible scholarships beyond the cards shown, which the page LINKS to (no blur,
  // no account needed). It keeps its name so the response shape does not change.
  const more = (total: number) => Math.max(0, total - Math.min(total, PREVIEW_TOP_N));

  it('shows up to ten full cards', () => {
    expect(PREVIEW_TOP_N).toBe(10);
    expect(more(25)).toBe(15);
    expect(more(11)).toBe(1);
  });

  it('has nothing beyond the cards when there are ten matches or fewer', () => {
    for (const total of [0, 1, 3, 10]) expect(more(total)).toBe(0);
  });

  it('the results block no longer blurs or covers anything', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/start/PreviewResults.tsx', 'utf8');
    expect(src).not.toMatch(/blur\(/);
    expect(src).not.toContain('LockedCard');
    expect(src).toContain('/scholarships?from=preview');
  });
});
