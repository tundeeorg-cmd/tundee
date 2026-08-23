/**
 * Pure business logic for LINE deadline reminders — extracted so tests don't
 * need a live DB or LINE access token.
 */

import { formatUserDate } from '@/lib/formatDate';

export const DEFAULT_OFFSETS = [14, 1] as const;

/**
 * How many days late a reminder may still go out.
 *
 * Without this the rule was an exact date match, so a run missed for any reason — a
 * deploy, a cold start, an outage — dropped that day's reminders permanently. Nothing
 * looked back, and a student tracking a scholarship simply never heard about it.
 *
 * Three days is deliberately short. A "14 days left" notice arriving on day 4 is not a
 * reminder any more, it is noise, and the 1-day notice will still land.
 */
export const DEFAULT_CATCHUP_DAYS = 3;

/** Parse a comma-separated list of positive integers from an env var, falling back to `defaults`. */
export function parseIntList(env: string | undefined, defaults: readonly number[]): number[] {
  if (!env) return [...defaults];
  const parsed = env.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  return parsed.length ? parsed : [...defaults];
}

/** Parse the REMINDER_OFFSETS env var, falling back to DEFAULT_OFFSETS. */
export function parseOffsets(env?: string): number[] {
  return parseIntList(env, DEFAULT_OFFSETS);
}

/** Parse REMINDER_CATCHUP_DAYS. 0 restores the old exact-date-match behaviour. */
export function parseCatchupDays(env?: string): number {
  if (env === undefined || env === '') return DEFAULT_CATCHUP_DAYS;
  const n = parseInt(env.trim(), 10);
  return isNaN(n) || n < 0 ? DEFAULT_CATCHUP_DAYS : n;
}

/** Whole days from `fromIso` to `toIso`, both YYYY-MM-DD. Negative if `toIso` is past. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso + 'T00:00:00Z');
  const to   = Date.parse(toIso + 'T00:00:00Z');
  return Math.round((to - from) / 86_400_000);
}

/**
 * The lowest `daysRemaining` at which each offset may still fire.
 *
 * Windows are clamped so they cannot overlap the next offset down. With offsets
 * [14, 1] and a 3-day catch-up, 14 covers 11–14 and 1 covers 0–1; a deadline 5 days out
 * matches neither, which is correct — the 14-day notice is stale by then and the 1-day
 * notice is still to come. Without the clamp a wide catch-up would let two offsets fire
 * for the same tracked row on the same morning, and the student gets two near-identical
 * messages about one scholarship.
 */
export function offsetWindows(offsets: number[], catchupDays: number): Map<number, number> {
  const descending = [...offsets].sort((a, b) => b - a);
  const windows = new Map<number, number>();
  for (let i = 0; i < descending.length; i++) {
    const offset = descending[i];
    const nextLower = descending[i + 1];
    const floor = nextLower === undefined ? 0 : nextLower + 1;
    windows.set(offset, Math.max(offset - catchupDays, floor));
  }
  return windows;
}

/** Return the ISO date string that is `days` days after `baseDate` (YYYY-MM-DD). */
export function addDays(baseDate: string, days: number): string {
  const d = new Date(baseDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Build the LINE push message text. */
export function buildReminderText(
  scholarshipName: string,
  deadlineDate: string,
  applicationLink: string,
  days: number,
  lang: 'th' | 'en' = 'th',
): string {
  const fmtDeadline = formatUserDate(deadlineDate, lang);
  // `days` is the days actually remaining, not the offset that triggered the send. A
  // catch-up firing three days late must not tell a student they have 14 days when they
  // have 11 — the whole point of the message is the number in it.
  if (lang === 'th') {
    const urgency = days <= 0
      ? '🔔 ทุนดี: วันนี้วันสุดท้าย!'
      : days === 1
        ? '🔔 ทุนดี: พรุ่งนี้ปิดรับสมัคร!'
        : `🔔 ทุนดี: เหลืออีก ${days} วันก่อนปิดรับสมัคร!`;
    return `${urgency}\n${scholarshipName}\nปิดรับ: ${fmtDeadline}\nสมัครที่นี่: ${applicationLink}`;
  }
  const urgency = days <= 0
    ? '🔔 TunDee: Last day to apply!'
    : days === 1
      ? '🔔 TunDee: Closes tomorrow!'
      : `🔔 TunDee: ${days} days left to apply!`;
  return `${urgency}\n${scholarshipName}\nDeadline: ${fmtDeadline}\nApply here: ${applicationLink}`;
}

/**
 * Determine whether a tracked row should get a reminder for this offset today.
 *
 * `lowerBound` is the lowest `daysRemaining` that still fires, from `offsetWindows`.
 * Omitting it restores exact-date matching, which is what this did before catch-up
 * existed and what `REMINDER_CATCHUP_DAYS=0` still gives.
 *
 * `daysRemaining` is returned so the caller can write a truthful message: a catch-up send
 * is late by definition, and the text must say the days left rather than the offset.
 */
export function shouldSendReminder(opts: {
  deadlineDate: string | null;
  todayStr: string;
  offsetDays: number;
  reminderOptIn: boolean;
  lineUserId: string | null | undefined;
  status: string;
  alreadySent: boolean;
  lowerBound?: number;
}): { send: boolean; reason: string; daysRemaining: number | null } {
  const {
    deadlineDate, todayStr, offsetDays, reminderOptIn, lineUserId, status, alreadySent,
  } = opts;
  const lowerBound = opts.lowerBound ?? offsetDays;

  if (!reminderOptIn) return { send: false, reason: 'opt-out', daysRemaining: null };
  if (!lineUserId) return { send: false, reason: 'no-line-id', daysRemaining: null };
  if (!['interested', 'applying'].includes(status)) {
    return { send: false, reason: `status-${status}`, daysRemaining: null };
  }
  if (!deadlineDate) return { send: false, reason: 'no-deadline', daysRemaining: null };
  if (deadlineDate < todayStr) return { send: false, reason: 'past-deadline', daysRemaining: null };
  if (alreadySent) return { send: false, reason: 'already-sent', daysRemaining: null };

  const daysRemaining = daysBetween(todayStr, deadlineDate);

  // Further out than the offset: not due yet. The window only ever reaches backwards,
  // so a deadline beyond the target is never pulled forward.
  if (daysRemaining > offsetDays) return { send: false, reason: 'too-early', daysRemaining };
  if (daysRemaining < lowerBound) return { send: false, reason: 'window-passed', daysRemaining };

  return {
    send: true,
    reason: daysRemaining === offsetDays ? 'ok' : 'catch-up',
    daysRemaining,
  };
}
