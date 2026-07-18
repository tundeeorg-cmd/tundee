import type { TdScholarship } from './types';

export interface DisplayGateResult {
  is_displayed: boolean;
  display_reason: string;
  stale: boolean;
}

// Staleness threshold in days (configurable via env, default 90)
const STALE_DAYS = parseInt(process.env.TD_STALE_DAYS ?? '90', 10);

/**
 * Pure display gate function.
 *
 * Show to students IFF ALL of:
 *   1. verification_status (trimmed, lowercased) === "verified"
 *   2. status (trimmed, lowercased) === "open"
 *   3. NOT (deadline_date is not null AND deadline_date < todayBkk)
 *
 * Staleness: if last_verified is older than STALE_DAYS, keep displayed
 * but set stale = true.
 *
 * todayBkk should be midnight in Asia/Bangkok (a plain Date with time 00:00:00).
 */
export function isDisplayable(
  row: {
    verification_status: string | null | undefined;
    status: string | null | undefined;
    deadline_date: string | null | undefined;
    last_verified: string | null | undefined;
  },
  todayBkk: Date,
): DisplayGateResult {
  const verif = (row.verification_status ?? '').trim().toLowerCase();
  const status = (row.status ?? '').trim().toLowerCase();

  if (verif !== 'verified') {
    return {
      is_displayed: false,
      display_reason: `Not verified (verification_status="${row.verification_status ?? ''}")`,
      stale: false,
    };
  }

  if (status !== 'open') {
    return {
      is_displayed: false,
      display_reason: `Status is "${row.status ?? ''}" (must be Open)`,
      stale: false,
    };
  }

  if (row.deadline_date) {
    // Compare dates as strings (YYYY-MM-DD) — lexicographic order is correct for ISO dates
    const todayStr = todayBkk.toISOString().split('T')[0];
    if (row.deadline_date < todayStr) {
      return {
        is_displayed: false,
        display_reason: `Deadline ${row.deadline_date} has passed`,
        stale: false,
      };
    }
  }
  // No concrete deadline_date → do not hide on that basis (prose/rolling/cycle)

  // Staleness (soft check — keeps is_displayed true)
  let stale = false;
  if (row.last_verified) {
    const lastVerifiedMs = new Date(row.last_verified).getTime();
    const cutoffMs = todayBkk.getTime() - STALE_DAYS * 86_400_000;
    if (lastVerifiedMs < cutoffMs) stale = true;
  }

  return {
    is_displayed: true,
    display_reason: stale ? `Displayed (stale — last verified ${row.last_verified})` : 'Displayed',
    stale,
  };
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
