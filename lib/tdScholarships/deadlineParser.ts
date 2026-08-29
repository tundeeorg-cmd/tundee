export interface ParsedDeadline {
  deadline_date: string | null;    // ISO YYYY-MM-DD, or null
  deadline_is_rolling: boolean;
  deadline_note: string;           // the raw text (always kept for display)
}

// Patterns that indicate a rolling / ongoing deadline
const ROLLING_RE = /rolling|ongoing|year.?round|always open|no deadline|each (trimester|semester)|per (trimester|semester)|ตลอด|ต่อเนื่อง/i;

// ISO date: YYYY-MM-DD (optionally with time component)
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;

// Date range: "2026-10-29 to 2027-01-20" — capture both ends, use the latest
const RANGE_RE = /(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_NAMES = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';

/**
 * "31-Aug-2026", "1 Sep 2026", "1/Sep/2026". This is the format the master spreadsheet
 * actually uses — 515 of the 517 non-blank deadlines in the corpus — and it was the one
 * shape the parser did not recognise, which is why `deadline_date` was NULL on every row.
 * Separator is flexible because a hand-edited sheet is not consistent about it.
 */
const DAY_MONTH_YEAR_RE = new RegExp(
  `\\b(\\d{1,2})[\\s./-]*(${MONTH_NAMES})[a-z]*\\.?[\\s./-]*(\\d{4})\\b`, 'i',
);

/** "Aug 31, 2026" / "August 31 2026" — the same date written the other way round. */
const MONTH_DAY_YEAR_RE = new RegExp(
  `\\b(${MONTH_NAMES})[a-z]*\\.?[\\s./-]+(\\d{1,2})(?:st|nd|rd|th)?,?[\\s./-]+(\\d{4})\\b`, 'i',
);

/** Days per month. Index 0 unused so the month number indexes directly; February is
 *  resolved against the year, since the year is always known by the time we check. */
const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month !== 2) return DAYS_IN_MONTH[month];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 29 : 28;
}

function validateDate(y: number, m: number, d: number): string | null {
  // Thai sheets are routinely typed in the Buddhist era: 2569 is 2026. The Date-object
  // path already did this conversion; text dates reached validateDate unconverted and a
  // year of 2569 passed the `>= 2000` check as if it were Gregorian, putting the deadline
  // five centuries out.
  const year = y > 2400 ? y - 543 : y;
  if (year < 2000) return null;
  if (m < 1 || m > 12) return null;
  // Reject 31 April rather than accepting it: a deadline that does not exist is worse
  // than no deadline, because the display gate will happily count down to it.
  if (d < 1 || d > daysInMonth(year, m)) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Try to extract a single concrete ISO date from a raw string.
// Returns null if no parseable date found or year < 2000.
function extractDate(s: string): string | null {
  // Date range → latest date
  const rangeMatch = s.match(RANGE_RE);
  if (rangeMatch) {
    const a = extractDate(rangeMatch[1]);
    const b = extractDate(rangeMatch[2]);
    if (a && b) return a > b ? a : b;
    return b ?? a;
  }

  // ISO date at start of string
  const isoMatch = s.match(ISO_RE);
  if (isoMatch) {
    const y = parseInt(isoMatch[1]);
    const m = parseInt(isoMatch[2]);
    const d = parseInt(isoMatch[3]);
    return validateDate(y, m, d);
  }

  // "31-Aug-2026" and friends — the dominant format in the master sheet.
  const dmy = s.match(DAY_MONTH_YEAR_RE);
  if (dmy) {
    const month = MONTHS[dmy[2].toLowerCase().slice(0, 3)];
    return validateDate(parseInt(dmy[3], 10), month, parseInt(dmy[1], 10));
  }

  // "Aug 31, 2026" — same date, other order.
  const mdy = s.match(MONTH_DAY_YEAR_RE);
  if (mdy) {
    const month = MONTHS[mdy[1].toLowerCase().slice(0, 3)];
    return validateDate(parseInt(mdy[3], 10), month, parseInt(mdy[2], 10));
  }

  // Month and year but no day — "Nov 2026", "Sep2027", "~early Jan 2027", "Annual ~Feb".
  // Deliberately NOT resolved to a concrete date. Picking the 1st or the last of the
  // month would invent a deadline, and a student would plan against it. The raw text is
  // preserved in deadline_note and shown instead.
  return null;
}

/**
 * Text that qualifies a rolling deadline with a period, so "rolling" alone no longer
 * means "open today": a year ("Rolling (Fall 2027)", "Rolling; next intake Jan 2027"),
 * or an explicit instruction that the entry is unverified ("Recheck (rolling by intake)").
 */
const ROLLING_QUALIFIER = /\b(19|20|25|26)\d{2}\b|recheck|confirm|varies|tbc|tba/i;

/**
 * True when the deadline text means "you can apply right now" and nothing more.
 *
 * The distinction matters because `deadline_is_rolling` alone is too broad to act on.
 * "Rolling / ongoing" is open today. "Rolling (Fall 2027)" is a future intake, and
 * telling a student it is open would send them to a form that is not accepting yet —
 * so anything carrying a year, or flagged for rechecking, is deliberately excluded and
 * stays for a human to decide.
 */
export function isUnqualifiedRolling(raw: string | null | undefined): boolean {
  const text = (raw ?? '').trim();
  if (!text) return false;
  if (!ROLLING_RE.test(text)) return false;
  return !ROLLING_QUALIFIER.test(text);
}

export function parseDeadline(raw: string | null | undefined): ParsedDeadline {
  const note = (raw ?? '').trim();

  if (!note) {
    return { deadline_date: null, deadline_is_rolling: false, deadline_note: '' };
  }

  if (ROLLING_RE.test(note)) {
    return { deadline_date: null, deadline_is_rolling: true, deadline_note: note };
  }

  const date = extractDate(note);
  return { deadline_date: date, deadline_is_rolling: false, deadline_note: note };
}

// Overload for Excel Date objects (xlsx with cellDates:true)
export function parseDeadlineFromDate(raw: unknown): ParsedDeadline {
  if (raw instanceof Date) {
    const y = raw.getFullYear() > 2400 ? raw.getFullYear() - 543 : raw.getFullYear();
    const m = raw.getMonth() + 1;
    const d = raw.getDate();
    const date = validateDate(y, m, d);
    const note = date ?? raw.toISOString().split('T')[0];
    return { deadline_date: date, deadline_is_rolling: false, deadline_note: note };
  }
  return parseDeadline(raw == null ? null : String(raw));
}

/**
 * Parse the "Open Date" column: a plain date (Excel Date object or ISO string).
 * No rolling/prose handling — Open Date is either a concrete date or blank.
 */
export function parseOpenDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    const y = raw.getFullYear() > 2400 ? raw.getFullYear() - 543 : raw.getFullYear();
    return validateDate(y, raw.getMonth() + 1, raw.getDate());
  }
  return extractDate(String(raw).trim());
}
