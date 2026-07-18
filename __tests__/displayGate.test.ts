import { describe, it, expect } from 'vitest';
import { isDisplayable, bangkokMidnight } from '../lib/tdScholarships/displayGate';
import { parseDeadline, parseDeadlineFromDate } from '../lib/tdScholarships/deadlineParser';

// Helper: build a minimal row for isDisplayable
function row(overrides: Partial<{
  verification_status: string | null;
  status: string | null;
  deadline_date: string | null;
  last_verified: string | null;
}>) {
  return {
    verification_status: 'verified',
    status: 'Open',
    deadline_date: null,
    last_verified: null,
    ...overrides,
  };
}

const TODAY = new Date('2026-07-18T00:00:00Z'); // fixed test date

// ── deadline parser ───────────────────────────────────────────────────────────

describe('parseDeadline', () => {
  it('rolling text → rolling=true, no date', () => {
    const r = parseDeadline('Rolling annual (per semester)');
    expect(r.deadline_is_rolling).toBe(true);
    expect(r.deadline_date).toBeNull();
  });

  it('concrete ISO date → date extracted', () => {
    const r = parseDeadline('2026-09-15');
    expect(r.deadline_date).toBe('2026-09-15');
    expect(r.deadline_is_rolling).toBe(false);
  });

  it('date range → latest date taken', () => {
    const r = parseDeadline('2026-10-29 to 2027-01-20');
    expect(r.deadline_date).toBe('2027-01-20');
  });

  it('prose "~early Jan 2027" → no concrete date', () => {
    const r = parseDeadline('~early Jan 2027');
    expect(r.deadline_date).toBeNull();
    expect(r.deadline_is_rolling).toBe(false);
    expect(r.deadline_note).toBe('~early Jan 2027');
  });

  it('malformed date year < 2000 → null date', () => {
    const r = parseDeadline('1907-01-12');
    expect(r.deadline_date).toBeNull();
  });

  it('empty → all nulls', () => {
    const r = parseDeadline(null);
    expect(r.deadline_date).toBeNull();
    expect(r.deadline_is_rolling).toBe(false);
    expect(r.deadline_note).toBe('');
  });

  it('Date object (Excel cellDates) → parsed correctly', () => {
    const r = parseDeadlineFromDate(new Date('2027-03-15T00:00:00Z'));
    expect(r.deadline_date).toBe('2027-03-15');
  });

  it('"ongoing" → rolling', () => {
    expect(parseDeadline('Ongoing').deadline_is_rolling).toBe(true);
  });

  it('"each semester" → rolling', () => {
    expect(parseDeadline('Annual - each semester').deadline_is_rolling).toBe(true);
  });
});

// ── isDisplayable ─────────────────────────────────────────────────────────────

describe('isDisplayable', () => {
  it('rolling deadline + verified + Open → shown', () => {
    const r = isDisplayable(row({ deadline_date: null }), TODAY);
    expect(r.is_displayed).toBe(true);
  });

  it('concrete future date + verified + Open → shown', () => {
    const r = isDisplayable(row({ deadline_date: '2026-09-15' }), TODAY);
    expect(r.is_displayed).toBe(true);
  });

  it('concrete past date + verified + Open → hidden (expired)', () => {
    const r = isDisplayable(row({ deadline_date: '2026-01-01' }), TODAY);
    expect(r.is_displayed).toBe(false);
    expect(r.display_reason).toMatch(/passed/i);
  });

  it('prose deadline (null date) + verified + Open → shown', () => {
    // ~early Jan 2027 parses to deadline_date=null
    const r = isDisplayable(row({ deadline_date: null }), TODAY);
    expect(r.is_displayed).toBe(true);
  });

  it('verified + Status Recheck → hidden', () => {
    const r = isDisplayable(row({ status: 'Recheck' }), TODAY);
    expect(r.is_displayed).toBe(false);
    expect(r.display_reason).toMatch(/Recheck/i);
  });

  it('verified + Status Closed → hidden', () => {
    const r = isDisplayable(row({ status: 'Closed' }), TODAY);
    expect(r.is_displayed).toBe(false);
  });

  it('"Auto-extracted (confirm deadline + link)" verification → hidden', () => {
    const r = isDisplayable(row({ verification_status: 'Auto-extracted (confirm deadline + link)' }), TODAY);
    expect(r.is_displayed).toBe(false);
    expect(r.display_reason).toMatch(/verified/i);
  });

  it('malformed date year < 2000 → parsed to null → not expired → shown', () => {
    // deadline_date would be null after parsing (tested separately above)
    // Here we test the gate with null deadline_date
    const r = isDisplayable(row({ deadline_date: null }), TODAY);
    expect(r.is_displayed).toBe(true);
  });

  it('whitespace+case variants normalize correctly', () => {
    const r1 = isDisplayable(row({ status: ' open ', verification_status: ' Verified ' }), TODAY);
    expect(r1.is_displayed).toBe(true);

    const r2 = isDisplayable(row({ status: 'OPEN', verification_status: 'VERIFIED' }), TODAY);
    expect(r2.is_displayed).toBe(true);
  });

  it('stale (last_verified > 90 days ago) → still displayed, stale=true', () => {
    const r = isDisplayable(row({ last_verified: '2026-01-01' }), TODAY);
    expect(r.is_displayed).toBe(true);
    expect(r.stale).toBe(true);
  });

  it('recently verified → not stale', () => {
    const r = isDisplayable(row({ last_verified: '2026-07-01' }), TODAY);
    expect(r.is_displayed).toBe(true);
    expect(r.stale).toBe(false);
  });

  it('no verification_status → hidden', () => {
    const r = isDisplayable(row({ verification_status: null }), TODAY);
    expect(r.is_displayed).toBe(false);
  });
});

// ── bangkokMidnight ───────────────────────────────────────────────────────────

describe('bangkokMidnight', () => {
  it('returns a date with time 00:00:00 UTC representing Bangkok midnight', () => {
    // At 2026-07-18T20:00:00Z it is already 2026-07-19 in Bangkok (UTC+7)
    const d = bangkokMidnight(new Date('2026-07-18T20:00:00Z'));
    expect(d.toISOString().startsWith('2026-07-19')).toBe(true);
  });

  it('before midnight Bangkok it is still the same day', () => {
    const d = bangkokMidnight(new Date('2026-07-18T10:00:00Z')); // 17:00 Bangkok
    expect(d.toISOString().startsWith('2026-07-18')).toBe(true);
  });
});
