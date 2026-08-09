import type { TdStatus } from './types';

export interface DisplayGateResult {
  is_displayed: boolean;
  display_reason: string;
  stale: boolean;
  status_effective: TdStatus;
}

// Staleness threshold in days (configurable via env, default 90)
const STALE_DAYS = parseInt(process.env.TD_STALE_DAYS ?? '90', 10);

// "Closing Soon" window in days (configurable via env, default 14)
export const CLOSING_SOON_WINDOW_DAYS = parseInt(process.env.TD_CLOSING_SOON_DAYS ?? '14', 10);

function ymd(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDaysIso(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return ymd(dt);
}

/** Normalize an arbitrary sheet value (incl. stray formula strings) to the canonical 4-state enum, or '' if unrecognized/blank. */
export function normalizeStatusValue(v: unknown): TdStatus {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'opening soon') return 'Opening Soon';
  if (s === 'open') return 'Open';
  if (s === 'closing soon') return 'Closing Soon';
  if (s === 'closed') return 'Closed';
  return '';
}

/**
 * Canonical mirror of the spreadsheet's `status` formula.
 * First match wins:
 *   1. deadline_date exists AND deadline_date < today       → "Closed"
 *   2. open_date exists AND today < open_date               → "Opening Soon"
 *   3. deadline_date exists AND deadline_date <= today+N AND
 *      (open_date is null OR today >= open_date)             → "Closing Soon"
 *   4. (open_date exists AND today >= open_date) OR
 *      (deadline_date exists AND today <= deadline_date)      → "Open"
 *   5. otherwise                                              → "" (blank)
 */
export function statusFromDates(
  openDate: string | null | undefined,
  deadlineDate: string | null | undefined,
  todayBkk: Date,
): TdStatus {
  const today = ymd(todayBkk);

  if (deadlineDate && deadlineDate < today) return 'Closed';
  if (openDate && today < openDate) return 'Opening Soon';

  const closingSoonCutoff = addDaysIso(today, CLOSING_SOON_WINDOW_DAYS);
  if (deadlineDate && deadlineDate <= closingSoonCutoff && (!openDate || today >= openDate)) {
    return 'Closing Soon';
  }

  if ((openDate && today >= openDate) || (deadlineDate && today <= deadlineDate)) return 'Open';

  return '';
}

/**
 * The status the site actually uses.
 * - Both open_date and deadline_date are real dates → derive from dates (keeps day-to-day accuracy).
 * - Otherwise → trust the normalized uploaded/stored `status` (rolling/prose-deadline rows).
 */
export function computeStatusEffective(
  row: {
    open_date: string | null | undefined;
    deadline_date: string | null | undefined;
    status: string | null | undefined;
  },
  todayBkk: Date,
): TdStatus {
  if (row.open_date && row.deadline_date) {
    return statusFromDates(row.open_date, row.deadline_date, todayBkk);
  }
  return normalizeStatusValue(row.status);
}

/**
 * Pure display gate function — Status-only.
 *
 * Show to students IFF status_effective ∈ {"Opening Soon", "Open", "Closing Soon"}.
 * Hidden when status_effective is "Closed" or blank.
 *
 * `Verification Status` is NOT considered — it is admin-only and never gates visibility.
 *
 * Staleness: if last_verified is older than STALE_DAYS, keep displayed
 * but set stale = true (soft check — never hides).
 *
 * todayBkk should be midnight in Asia/Bangkok (a plain Date with time 00:00:00 UTC).
 */
export function isDisplayable(
  row: {
    open_date: string | null | undefined;
    deadline_date: string | null | undefined;
    status: string | null | undefined;
    last_verified: string | null | undefined;
  },
  todayBkk: Date,
): DisplayGateResult {
  const statusEffective = computeStatusEffective(row, todayBkk);
  const shown = statusEffective === 'Opening Soon' || statusEffective === 'Open' || statusEffective === 'Closing Soon';

  let stale = false;
  if (row.last_verified) {
    const lastVerifiedMs = new Date(row.last_verified).getTime();
    const cutoffMs = todayBkk.getTime() - STALE_DAYS * 86_400_000;
    if (lastVerifiedMs < cutoffMs) stale = true;
  }

  const display_reason = shown
    ? stale
      ? `Displayed (status=${statusEffective}, stale — last verified ${row.last_verified})`
      : `Displayed (status=${statusEffective})`
    : `Hidden (status=${statusEffective || 'blank — no usable dates or sheet status'})`;

  return { is_displayed: shown, display_reason, stale, status_effective: statusEffective };
}

/** Convenience: compute Bangkok midnight from a UTC Date */
export function bangkokMidnight(utcDate?: Date): Date {
  const src = utcDate ?? new Date();
  // Asia/Bangkok is UTC+7, no DST
  const bkkMs = src.getTime() + 7 * 3600 * 1000;
  const bkk = new Date(bkkMs);
  return new Date(
    Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate()),
  );
}
