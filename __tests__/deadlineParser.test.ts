/**
 * The deadline parser, against the formats the master spreadsheet actually contains.
 *
 * Context for the D-Mon-YYYY cases: `deadline_date` was NULL on all 518 displayed
 * scholarships while `deadline_raw` held a perfectly good "31-Aug-2026" on 515 of them.
 * The parser understood ISO dates, ISO ranges and rolling text, and nothing else — so
 * the one format the sheet uses fell through to `return null`. Everything downstream
 * that keys off a date (the display gate, deadline reminders, sorting by urgency) was
 * dark as a result.
 */

import { describe, it, expect } from 'vitest';
import { parseDeadline, parseDeadlineFromDate, parseOpenDate } from '../lib/tdScholarships/deadlineParser';

describe('parseDeadline — the format the sheet actually uses', () => {
  it('parses D-Mon-YYYY and DD-Mon-YYYY', () => {
    expect(parseDeadline('31-Aug-2026').deadline_date).toBe('2026-08-31');
    expect(parseDeadline('1-Sep-2026').deadline_date).toBe('2026-09-01');
  });

  it('accepts whatever separator the sheet was typed with', () => {
    for (const raw of ['1 Sep 2026', '1/Sep/2026', '1.Sep.2026', '1-Sept-2026', '1 September 2026']) {
      expect(parseDeadline(raw).deadline_date, raw).toBe('2026-09-01');
    }
  });

  it('parses the month-first ordering too', () => {
    expect(parseDeadline('Aug 31, 2026').deadline_date).toBe('2026-08-31');
    expect(parseDeadline('August 31 2026').deadline_date).toBe('2026-08-31');
    expect(parseDeadline('Sep 1st, 2026').deadline_date).toBe('2026-09-01');
  });

  it('keeps the raw text as the note whether or not a date came out', () => {
    expect(parseDeadline('31-Aug-2026').deadline_note).toBe('31-Aug-2026');
    expect(parseDeadline('Nov 2026').deadline_note).toBe('Nov 2026');
  });
});

describe('parseDeadline — what it must refuse to guess', () => {
  it('does not invent a day from a month and year', () => {
    // Both of these are real values in the corpus. Resolving them to the 1st or the last
    // of the month would put a deadline on the card that nobody published, and a student
    // would plan against it.
    expect(parseDeadline('Nov 2026').deadline_date).toBeNull();
    expect(parseDeadline('Sep2027').deadline_date).toBeNull();
    expect(parseDeadline('~early Jan 2027').deadline_date).toBeNull();
    expect(parseDeadline('Annual ~Feb').deadline_date).toBeNull();
  });

  it('rejects a day the month does not have', () => {
    expect(parseDeadline('31-Apr-2026').deadline_date).toBeNull();
    expect(parseDeadline('30-Feb-2026').deadline_date).toBeNull();
  });

  it('knows which Februaries have 29 days', () => {
    expect(parseDeadline('29-Feb-2028').deadline_date).toBe('2028-02-29');
    expect(parseDeadline('29-Feb-2026').deadline_date).toBeNull();
    expect(parseDeadline('29-Feb-2100').deadline_date).toBeNull();   // century, not a leap year
    expect(parseDeadline('29-Feb-2000').deadline_date).toBe('2000-02-29');
  });

  it('still treats rolling deadlines as rolling, not as dates', () => {
    const rolling = parseDeadline('Rolling — applications open year-round');
    expect(rolling.deadline_is_rolling).toBe(true);
    expect(rolling.deadline_date).toBeNull();
  });

  it('is blank-safe', () => {
    for (const raw of [null, undefined, '', '   ']) {
      const p = parseDeadline(raw);
      expect(p.deadline_date).toBeNull();
      expect(p.deadline_is_rolling).toBe(false);
    }
  });
});

describe('Buddhist-era years', () => {
  it('converts a BE year in text, as the Date path already did', () => {
    // Thai sheets are routinely typed in the Buddhist era. Before this, 2569 passed the
    // "year >= 2000" check as a Gregorian year and the deadline landed five centuries out.
    expect(parseDeadline('31-Aug-2569').deadline_date).toBe('2026-08-31');
    expect(parseDeadline('2569-08-31').deadline_date).toBe('2026-08-31');
    expect(parseOpenDate('1-Sep-2569')).toBe('2026-09-01');
  });

  it('leaves Gregorian years alone', () => {
    expect(parseDeadline('31-Aug-2026').deadline_date).toBe('2026-08-31');
  });

  it('agrees with the Excel Date path', () => {
    expect(parseDeadlineFromDate(new Date(2026, 7, 31)).deadline_date).toBe('2026-08-31');
  });
});

describe('formats that already worked keep working', () => {
  it('ISO dates', () => {
    expect(parseDeadline('2026-08-31').deadline_date).toBe('2026-08-31');
  });

  it('ISO ranges resolve to the later end', () => {
    expect(parseDeadline('2026-10-29 to 2027-01-20').deadline_date).toBe('2027-01-20');
  });

  it('rejects years before 2000 rather than accepting a typo', () => {
    expect(parseDeadline('31-Aug-1926').deadline_date).toBeNull();
  });
});

describe('parseOpenDate', () => {
  it('reads the same formats as the deadline column', () => {
    expect(parseOpenDate('1-Sep-2026')).toBe('2026-09-01');
    expect(parseOpenDate('2026-09-01')).toBe('2026-09-01');
    expect(parseOpenDate(new Date(2026, 8, 1))).toBe('2026-09-01');
  });

  it('is blank-safe', () => {
    expect(parseOpenDate(null)).toBeNull();
    expect(parseOpenDate('')).toBeNull();
  });
});
