const EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

/**
 * Format a date string (YYYY-MM-DD or ISO timestamp) for display.
 *
 * EN → "31-Jul-2026"   (Gregorian)
 * TH → "31-ก.ค.-2569" (Buddhist Era, Gregorian year + 543)
 *
 * Uses UTC accessors to avoid timezone shifts on bare date strings.
 */
export function formatUserDate(dateStr: string, locale: 'th' | 'en'): string {
  const d = new Date(dateStr);
  const day   = d.getUTCDate();
  const month = d.getUTCMonth();
  const year  = d.getUTCFullYear();
  return locale === 'th'
    ? `${day}-${TH_MONTHS[month]}-${year + 543}`
    : `${day}-${EN_MONTHS[month]}-${year}`;
}

/**
 * The "last checked" date, spaced rather than hyphenated: "28 ส.ค. 2569".
 *
 * Separate from formatUserDate because that one renders deadlines, where the hyphens
 * read as a compact field. This is prose inside a sentence and wants to look like a
 * date a person wrote.
 *
 * Returns null for a missing or unparseable value. The caller must render nothing in
 * that case — never today's date and never a placeholder. A verification date that is
 * quietly wrong is worse than no verification date, because it is the one thing on the
 * card claiming the data was looked at.
 */
export function formatVerifiedDate(
  dateStr: string | null | undefined,
  locale: 'th' | 'en',
): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;

  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  if (month < 0 || month > 11) return null;

  return locale === 'th'
    ? `${day} ${TH_MONTHS[month]} ${year + 543}`
    : `${day} ${EN_MONTHS[month]} ${year}`;
}
