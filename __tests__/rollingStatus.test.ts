/**
 * Rolling scholarships with a blank status.
 *
 * The master sheet computes `status` with a formula whose every branch is guarded by
 * ISNUMBER on the deadline cell. A scholarship whose deadline is the word "Rolling" can
 * therefore never receive a status from the sheet — not an oversight, a consequence of
 * the formula having nothing to test. 22 genuinely open scholarships were invisible for
 * that reason and no other.
 *
 * `deadline_is_rolling` on its own is too blunt to act on, which is what these tests are
 * really about: "Rolling (Fall 2027)" is rolling AND not open yet.
 */

import { describe, it, expect } from 'vitest';
import { isUnqualifiedRolling, parseDeadline } from '@/lib/tdScholarships/deadlineParser';
import { computeStatusEffective } from '@/lib/tdScholarships/displayGate';

const TODAY = new Date(Date.UTC(2026, 7, 29));

describe('isUnqualifiedRolling', () => {
  it('accepts rolling text that means "apply today"', () => {
    for (const raw of [
      'Rolling', 'rolling', 'Rolling / ongoing', 'Rolling / ongoing recruitment',
      'Year-round', 'Each trimester', 'Rolling (each semester)',
      'rolling (admission-linked; no end date stated)',
    ]) {
      expect(isUnqualifiedRolling(raw), raw).toBe(true);
    }
  });

  it('refuses rolling text that names a future intake', () => {
    // Real values from the master sheet. Calling these Open sends a student to a form
    // that is not accepting yet — worse than leaving the scholarship hidden.
    for (const raw of [
      'Rolling (Fall 2027)', 'Rolling; next intake Jan 2027', 'Rolling through spring 2027',
    ]) {
      expect(isUnqualifiedRolling(raw), raw).toBe(false);
    }
  });

  it('refuses rolling text the data itself flags as unverified', () => {
    for (const raw of ['Recheck (rolling by intake)', 'Rolling / annual (confirm)', 'Rolling annual (varies by institution)']) {
      expect(isUnqualifiedRolling(raw), raw).toBe(false);
    }
  });

  it('is not fooled by prose that is simply undated', () => {
    // "Varies" and "Annual ~Mar" have no deadline either, but neither says applications
    // are open — only rolling text does.
    for (const raw of ['Varies', 'Annual ~Mar', 'Cycle-based (recheck)', 'Not specified', '', null]) {
      expect(isUnqualifiedRolling(raw), String(raw)).toBe(false);
    }
  });

  it('agrees with the parser about what counts as rolling', () => {
    expect(parseDeadline('Rolling / ongoing').deadline_is_rolling).toBe(true);
    expect(isUnqualifiedRolling('Rolling / ongoing')).toBe(true);
  });
});

describe('computeStatusEffective — the rolling rule', () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({ open_date: null, deadline_date: null, status: '', ...over });

  it('derives Open for an unqualified rolling deadline with no sheet status', () => {
    expect(computeStatusEffective(row({ rolling_open: true }), TODAY)).toBe('Open');
  });

  it('leaves a blank status blank when the deadline is not rolling', () => {
    expect(computeStatusEffective(row({ rolling_open: false }), TODAY)).toBe('');
    expect(computeStatusEffective(row(), TODAY)).toBe('');
  });

  it('never overrides a status a person put in the sheet', () => {
    // If someone marked a rolling scholarship Closed, they knew something the text does
    // not say. The derived rule sits below the stored value, never above it.
    expect(computeStatusEffective(row({ rolling_open: true, status: 'Closed' }), TODAY)).toBe('Closed');
    expect(computeStatusEffective(row({ rolling_open: true, status: 'Opening Soon' }), TODAY)).toBe('Opening Soon');
  });

  it('never overrides real dates', () => {
    // Both dates present means the sheet's own logic applies and the deadline has passed.
    const dated = { open_date: '2026-01-01', deadline_date: '2026-08-01', status: '', rolling_open: true };
    expect(computeStatusEffective(dated, TODAY)).toBe('Closed');
  });
});
