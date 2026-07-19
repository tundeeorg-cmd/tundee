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
