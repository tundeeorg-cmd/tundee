/**
 * Pure business logic for LINE deadline reminders — extracted so tests don't
 * need a live DB or LINE access token.
 */

export const DEFAULT_OFFSETS = [14, 1] as const;

/** Parse the REMINDER_OFFSETS env var, falling back to DEFAULT_OFFSETS. */
export function parseOffsets(env?: string): number[] {
  if (!env) return [...DEFAULT_OFFSETS];
  const parsed = env.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  return parsed.length ? parsed : [...DEFAULT_OFFSETS];
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
  if (lang === 'th') {
    const urgency = days === 1
      ? '🔔 ทุนดี: พรุ่งนี้ปิดรับสมัคร!'
      : `🔔 ทุนดี: เหลืออีก ${days} วันก่อนปิดรับสมัคร!`;
    return `${urgency}\n${scholarshipName}\nปิดรับ: ${deadlineDate}\nสมัครที่นี่: ${applicationLink}`;
  }
  const urgency = days === 1
    ? '🔔 TunDee: Closes tomorrow!'
    : `🔔 TunDee: ${days} days left to apply!`;
  return `${urgency}\n${scholarshipName}\nDeadline: ${deadlineDate}\nApply here: ${applicationLink}`;
}

/** Determine whether a tracked row should get a reminder for this offset today. */
export function shouldSendReminder(opts: {
  deadlineDate: string | null;
  todayStr: string;
  offsetDays: number;
  reminderOptIn: boolean;
  lineUserId: string | null | undefined;
  status: string;
  alreadySent: boolean;
}): { send: boolean; reason: string } {
  const { deadlineDate, todayStr, offsetDays, reminderOptIn, lineUserId, status, alreadySent } = opts;

  if (!reminderOptIn) return { send: false, reason: 'opt-out' };
  if (!lineUserId) return { send: false, reason: 'no-line-id' };
  if (!['interested', 'applying'].includes(status)) return { send: false, reason: `status-${status}` };
  if (!deadlineDate) return { send: false, reason: 'no-deadline' };
  if (deadlineDate < todayStr) return { send: false, reason: 'past-deadline' };
  if (alreadySent) return { send: false, reason: 'already-sent' };

  const targetDate = addDays(todayStr, offsetDays);
  if (deadlineDate !== targetDate) return { send: false, reason: 'date-mismatch' };

  return { send: true, reason: 'ok' };
}
