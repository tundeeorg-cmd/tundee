/**
 * Ordering and filtering for the /start browse list. Pure.
 *
 * The default order is the same for every visitor: scholarships that are open,
 * soonest deadline first, then those with no fixed deadline. No profile, no
 * score, no experiment arm — this list is not a treatment, and a visitor who has
 * not been randomized must never be shown one.
 */

import type { TdScholarship } from '@/lib/tdScholarships/types';

export const CLOSING_SOON_DAYS = 30;

/** The statuses a visitor can still act on. */
export const OPEN_STATUSES: ReadonlySet<string> = new Set(['Closing Soon', 'Open']);

export type LevelChip = 'high_school' | 'undergraduate' | 'postgraduate';

const LEVEL_CHIP: Record<LevelChip, readonly string[]> = {
  high_school:   ['High school'],
  undergraduate: ['Undergraduate'],
  postgraduate:  ["Master's", 'PhD'],
};

export interface StartFilters {
  query: string;
  level: LevelChip | null;
  closingSoon: boolean;
  lowIncome: boolean;
}

export const NO_FILTERS: StartFilters = { query: '', level: null, closingSoon: false, lowIncome: false };

/** Whole days from `today` (YYYY-MM-DD, Bangkok) to a deadline date; null when none. */
export function daysUntil(deadline: string | null | undefined, today: string): number | null {
  if (!deadline) return null;
  const a = Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

/** Today's date in Bangkok as YYYY-MM-DD, whatever the server or browser timezone. */
export function bangkokToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
}

/** Open, and not past its deadline. A rolling scholarship has no deadline to pass. */
export function isActionable(s: TdScholarship, today: string): boolean {
  if (!OPEN_STATUSES.has(s.status_effective || '')) return false;
  const d = daysUntil(s.deadline_date, today);
  return d === null || d >= 0;
}

/** Soonest deadline first; scholarships without a fixed date after all dated ones. Stable by name. */
export function sortByDeadline(items: TdScholarship[], today: string): TdScholarship[] {
  const key = (s: TdScholarship) => {
    const d = daysUntil(s.deadline_date, today);
    return d === null ? Number.POSITIVE_INFINITY : d;
  };
  const name = (s: TdScholarship) => s.scholarship_name_th || s.scholarship_name_en || s.scholarship_name || '';
  return [...items].sort((a, b) => key(a) - key(b) || name(a).localeCompare(name(b), 'th'));
}

export function applyFilters(items: TdScholarship[], f: StartFilters, today: string): TdScholarship[] {
  const q = f.query.trim().toLowerCase();
  const levels = f.level ? LEVEL_CHIP[f.level] : null;
  return items.filter((s) => {
    if (q) {
      const hay = [s.scholarship_name_en, s.scholarship_name_th, s.scholarship_name, s.funder_en, s.funder_th, s.funder]
        .some((v) => v?.toLowerCase().includes(q));
      if (!hay) return false;
    }
    if (levels && !(s.level && levels.includes(s.level))) return false;
    if (f.lowIncome && !s.targets_low_income) return false;
    if (f.closingSoon) {
      const d = daysUntil(s.deadline_date, today);
      if (d === null || d > CLOSING_SOON_DAYS) return false;
    }
    return true;
  });
}

export function hasActiveFilters(f: StartFilters): boolean {
  return f.query.trim() !== '' || f.level !== null || f.closingSoon || f.lowIncome;
}
