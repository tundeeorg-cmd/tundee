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

function validateDate(y: number, m: number, d: number): string | null {
  if (y < 2000) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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

  // Excel serial number passed as string (rare, but handle it)
  // XLSX with cellDates:true returns Date objects upstream, but guard here too.

  // Try to parse a year and month from prose like "~early Jan 2027" or "Annual ~Feb"
  // Pattern: optional non-digit chars, then YYYY at end, optionally with month name
  const proseMatch = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\b/i) ||
                     s.match(/\b(\d{4})\b.*\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\b/i);
  if (proseMatch) {
    // We have a month + year but no day — can't produce a concrete date
    // Return null so deadline_note is used instead
    return null;
  }

  return null;
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
