import { describe, it, expect } from 'vitest';
import {
  isDisplayable,
  bangkokMidnight,
  statusFromDates,
  computeStatusEffective,
  normalizeStatusValue,
  CLOSING_SOON_WINDOW_DAYS,
} from '../lib/tdScholarships/displayGate';
import { parseDeadline, parseDeadlineFromDate, parseOpenDate } from '../lib/tdScholarships/deadlineParser';

// Helper: build a minimal row for isDisplayable (Status-only gate)
function row(overrides: Partial<{
  open_date: string | null;
  deadline_date: string | null;
  status: string | null;
  last_verified: string | null;
}>) {
  return {
    open_date: null,
    deadline_date: null,
    status: 'Open',
    last_verified: null,
    ...overrides,
  };
}

const TODAY = new Date('2026-08-09T00:00:00Z'); // fixed test date

// ── deadline / open-date parsers ────────────────────────────────────────────

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

  it('malformed date year < 2000 → null date, not treated as expired', () => {
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
});

describe('parseOpenDate', () => {
  it('Date object → ISO date', () => {
    expect(parseOpenDate(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01');
  });

  it('ISO string → ISO date', () => {
    expect(parseOpenDate('2026-09-01')).toBe('2026-09-01');
  });

  it('blank → null', () => {
    expect(parseOpenDate(null)).toBeNull();
    expect(parseOpenDate('')).toBeNull();
  });
});

// ── normalizeStatusValue ─────────────────────────────────────────────────────

describe('normalizeStatusValue', () => {
  it.each([
    ['Opening Soon', 'Opening Soon'], ['opening soon', 'Opening Soon'], [' OPENING SOON ', 'Opening Soon'],
    ['Open', 'Open'], ['open', 'Open'], [' open ', 'Open'],
    ['Closing Soon', 'Closing Soon'], ['closing soon', 'Closing Soon'],
    ['Closed', 'Closed'], ['closed', 'Closed'],
  ])('normalizes "%s" → %s', (raw, expected) => {
    expect(normalizeStatusValue(raw)).toBe(expected);
  });

  it('unrecognized text (e.g. a stray formula string) → blank', () => {
    expect(normalizeStatusValue('=IFERROR(IF(AND(ISNUMBER($W2)...')).toBe('');
  });

  it('blank/null/undefined → blank', () => {
    expect(normalizeStatusValue('')).toBe('');
    expect(normalizeStatusValue(null)).toBe('');
    expect(normalizeStatusValue(undefined)).toBe('');
  });
});

// ── statusFromDates (mirrors the sheet formula) ─────────────────────────────

describe('statusFromDates', () => {
  it('open date in the future, deadline far future → Opening Soon', () => {
    expect(statusFromDates('2026-09-01', '2026-12-01', TODAY)).toBe('Opening Soon');
  });

  it('open in the past, deadline far future → Open', () => {
    expect(statusFromDates('2026-06-02', '2027-02-28', TODAY)).toBe('Open');
  });

  it(`deadline within ${CLOSING_SOON_WINDOW_DAYS} days and already open → Closing Soon`, () => {
    expect(statusFromDates('2026-06-02', '2026-08-20', TODAY)).toBe('Closing Soon');
  });

  it('deadline in the past → Closed (even if open_date is also in the past)', () => {
    expect(statusFromDates('2026-01-01', '2026-08-01', TODAY)).toBe('Closed');
  });

  it('no open_date, deadline far future → Open', () => {
    expect(statusFromDates(null, '2027-01-01', TODAY)).toBe('Open');
  });

  it('no open_date, deadline within window → Closing Soon', () => {
    expect(statusFromDates(null, '2026-08-15', TODAY)).toBe('Closing Soon');
  });

  it('no dates at all → blank', () => {
    expect(statusFromDates(null, null, TODAY)).toBe('');
  });

  it('deadline exactly at the closing-soon boundary → Closing Soon', () => {
    const boundary = '2026-08-23'; // TODAY + 14 days
    expect(statusFromDates(null, boundary, TODAY)).toBe('Closing Soon');
  });

  it('deadline one day past the closing-soon boundary → Open', () => {
    expect(statusFromDates(null, '2026-08-24', TODAY)).toBe('Open');
  });
});

// ── computeStatusEffective ────────────────────────────────────────────────────

describe('computeStatusEffective', () => {
  it('both dates present → derives from dates, ignoring stored status', () => {
    const eff = computeStatusEffective({ open_date: '2026-06-01', deadline_date: '2026-08-10', status: 'Closed' }, TODAY);
    expect(eff).toBe('Closing Soon');
  });

  it('rolling/prose deadline (no dates) + sheet status=Open → Open', () => {
    const eff = computeStatusEffective({ open_date: null, deadline_date: null, status: 'Open' }, TODAY);
    expect(eff).toBe('Open');
  });

  it('rolling/prose deadline (no dates) + blank sheet status → blank', () => {
    const eff = computeStatusEffective({ open_date: null, deadline_date: null, status: '' }, TODAY);
    expect(eff).toBe('');
  });

  it('only open_date present (no deadline) → falls back to sheet status', () => {
    const eff = computeStatusEffective({ open_date: '2026-09-01', deadline_date: null, status: 'Opening Soon' }, TODAY);
    expect(eff).toBe('Opening Soon');
  });
});

// ── isDisplayable (Status-only gate) ─────────────────────────────────────────

describe('isDisplayable', () => {
  it('open date in the future (Opening Soon) → shown', () => {
    const r = isDisplayable(row({ open_date: '2026-09-01', deadline_date: '2026-12-01' }), TODAY);
    expect(r.is_displayed).toBe(true);
    expect(r.status_effective).toBe('Opening Soon');
  });

  it('open in the past, deadline far future (Open) → shown', () => {
    const r = isDisplayable(row({ open_date: '2026-06-02', deadline_date: '2027-02-28' }), TODAY);
    expect(r.is_displayed).toBe(true);
    expect(r.status_effective).toBe('Open');
  });

  it('deadline within 14 days and already open (Closing Soon) → shown', () => {
    const r = isDisplayable(row({ open_date: '2026-06-02', deadline_date: '2026-08-20' }), TODAY);
    expect(r.is_displayed).toBe(true);
    expect(r.status_effective).toBe('Closing Soon');
  });

  it('deadline in the past (both dates known → Closed) → hidden', () => {
    const r = isDisplayable(row({ open_date: '2025-01-01', deadline_date: '2026-01-01' }), TODAY);
    expect(r.is_displayed).toBe(false);
    expect(r.status_effective).toBe('Closed');
  });

  it('only deadline known (no open_date) → falls back to sheet status, not auto-expired by date alone', () => {
    // Per spec §3b: date-based recompute only kicks in when BOTH open_date and
    // deadline_date are real dates — otherwise the normalized sheet status is trusted.
    const r = isDisplayable(row({ deadline_date: '2026-01-01', status: 'Closed' }), TODAY);
    expect(r.is_displayed).toBe(false);
    expect(r.status_effective).toBe('Closed');
  });

  it('rolling/prose deadline (no dates) + sheet status=Open → shown', () => {
    const r = isDisplayable(row({ status: 'Open' }), TODAY);
    expect(r.is_displayed).toBe(true);
  });

  it('rolling/prose deadline with blank sheet status and no dates → hidden', () => {
    const r = isDisplayable(row({ status: '' }), TODAY);
    expect(r.is_displayed).toBe(false);
    expect(r.status_effective).toBe('');
  });

  it('Verification Status does not gate visibility (status-only gate has no such field)', () => {
    // isDisplayable's row type has no verification_status field at all —
    // an "unverified" row with status_effective=Open is still shown.
    const r = isDisplayable(row({ status: 'Open' }), TODAY);
    expect(r.is_displayed).toBe(true);
  });

  it('status arrives as a raw formula string but open_date+deadline_date present → recomputed correctly', () => {
    const r = isDisplayable(row({ open_date: '2026-06-02', deadline_date: '2027-02-28', status: '=IFERROR(...)' }), TODAY);
    expect(r.is_displayed).toBe(true);
    expect(r.status_effective).toBe('Open');
  });

  it('status blank + no dates → hidden', () => {
    const r = isDisplayable(row({ status: null }), TODAY);
    expect(r.is_displayed).toBe(false);
  });

  it('case/space variants of status normalize correctly', () => {
    const r1 = isDisplayable(row({ status: ' open ' }), TODAY);
    expect(r1.is_displayed).toBe(true);
    const r2 = isDisplayable(row({ status: 'OPENING SOON' }), TODAY);
    expect(r2.is_displayed).toBe(true);
    expect(r2.status_effective).toBe('Opening Soon');
  });

  it('malformed deadline year < 2000 → parsed to null → not treated as expired → shown (status=Open)', () => {
    const dp = parseDeadline('1907-01-12');
    expect(dp.deadline_date).toBeNull();
    const r = isDisplayable(row({ deadline_date: dp.deadline_date, status: 'Open' }), TODAY);
    expect(r.is_displayed).toBe(true);
  });

  it('Closed status (no dates) → hidden', () => {
    const r = isDisplayable(row({ status: 'Closed' }), TODAY);
    expect(r.is_displayed).toBe(false);
  });

  it('stale (last_verified > 90 days ago) → still displayed if shown, stale=true', () => {
    const r = isDisplayable(row({ status: 'Open', last_verified: '2026-01-01' }), TODAY);
    expect(r.is_displayed).toBe(true);
    expect(r.stale).toBe(true);
  });

  it('recently verified → not stale', () => {
    const r = isDisplayable(row({ status: 'Open', last_verified: '2026-08-01' }), TODAY);
    expect(r.is_displayed).toBe(true);
    expect(r.stale).toBe(false);
  });

  it('staleness never hides a row that is otherwise displayable', () => {
    const r = isDisplayable(row({ status: 'Open', last_verified: '2020-01-01' }), TODAY);
    expect(r.is_displayed).toBe(true);
    expect(r.stale).toBe(true);
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
