/**
 * Pure display-logic helpers for the tracker page — bilingual name/funder
 * resolution and deadline formatting. Kept in a plain .ts module (no JSX) so
 * it can be unit-tested directly, same pattern as lib/formatDate.ts.
 */

import type { TdScholarship } from '@/lib/tdScholarships/types';
import { formatUserDate } from '@/lib/formatDate';

// Bilingual identity fields (scholarship_name_th/en, funder_th/en) are the
// canonical source; the deprecated single-language columns are the last
// resort so a name/funder is never rendered empty.

export function resolveName(s: TdScholarship, lang: string): string {
  return lang === 'th'
    ? s.scholarship_name_th || s.scholarship_name_en || s.scholarship_name || ''
    : s.scholarship_name_en || s.scholarship_name_th || s.scholarship_name || '';
}

export function resolveFunder(s: TdScholarship, lang: string): string {
  return lang === 'th'
    ? s.funder_th || s.funder_en || s.funder || ''
    : s.funder_en || s.funder_th || s.funder || '';
}

export interface DeadlineDisplay {
  text: string;
  daysLabel: string | null;
  color: 'red' | 'amber' | 'gray';
}

export function formatDeadline(s: TdScholarship, lang: string): DeadlineDisplay {
  const lo = lang as 'th' | 'en';
  if (s.deadline_date) {
    const d = new Date(s.deadline_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
    const dateStr = formatUserDate(s.deadline_date, lo);

    if (days < 0) return { text: lo === 'th' ? 'หมดเขตแล้ว' : 'Expired', daysLabel: null, color: 'gray' };
    if (days === 0) return { text: lo === 'th' ? 'หมดเขตวันนี้!' : 'Closes today!', daysLabel: null, color: 'red' };

    const daysLabel = lo === 'th' ? `เหลือ ${days} วัน` : `${days}d left`;
    const color: DeadlineDisplay['color'] = days <= 7 ? 'red' : days <= 30 ? 'amber' : 'gray';
    return { text: dateStr, daysLabel, color };
  }
  if (s.deadline_is_rolling) return { text: lo === 'th' ? 'เปิดรับตลอด' : 'Always open', daysLabel: null, color: 'gray' };
  if (s.deadline_note) return { text: s.deadline_note, daysLabel: null, color: 'gray' };
  return { text: lo === 'th' ? 'ดูเว็บไซต์' : 'See website', daysLabel: null, color: 'gray' };
}

export const DEADLINE_COLOR_CLASS: Record<DeadlineDisplay['color'], string> = {
  red:   'text-red-600 dark:text-red-400',
  amber: 'text-amber-600 dark:text-amber-400',
  gray:  'text-[#6E6E73] dark:text-[#8E8E93]',
};

export const DEADLINE_BADGE_CLASS: Record<DeadlineDisplay['color'], string> = {
  red:   'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  gray:  'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-300',
};
