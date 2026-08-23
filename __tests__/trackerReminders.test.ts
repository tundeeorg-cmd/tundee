/**
 * Tests for tracker + LINE reminder business logic.
 * Uses Vitest. No DB or LINE API needed — only pure functions.
 */

import { describe, it, expect } from 'vitest';
import {
  parseOffsets,
  addDays,
  buildReminderText,
  shouldSendReminder,
  offsetWindows,
  DEFAULT_OFFSETS,
} from '@/lib/line/reminders';

const TODAY = '2026-07-19';

// ─── parseOffsets ─────────────────────────────────────────────────────────────

describe('parseOffsets', () => {
  it('returns defaults when env is undefined', () => {
    expect(parseOffsets(undefined)).toEqual([...DEFAULT_OFFSETS]);
  });

  it('returns defaults when env is empty string', () => {
    expect(parseOffsets('')).toEqual([...DEFAULT_OFFSETS]);
  });

  it('parses "7,3" correctly', () => {
    expect(parseOffsets('7,3')).toEqual([7, 3]);
  });

  it('drops NaN values and keeps valid ones', () => {
    expect(parseOffsets('14,abc,1')).toEqual([14, 1]);
  });

  it('drops non-positive values', () => {
    expect(parseOffsets('0,-5,3')).toEqual([3]);
  });
});

// ─── addDays ──────────────────────────────────────────────────────────────────

describe('addDays', () => {
  it('adds 14 days', () => {
    expect(addDays('2026-07-19', 14)).toBe('2026-08-02');
  });

  it('adds 1 day', () => {
    expect(addDays('2026-07-19', 1)).toBe('2026-07-20');
  });

  it('crosses month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses year boundary', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
  });
});

// ─── buildReminderText ────────────────────────────────────────────────────────

describe('buildReminderText', () => {
  it('includes "พรุ่งนี้" for 1-day Thai', () => {
    const text = buildReminderText('ทุนทดสอบ', '2026-07-20', 'https://example.com', 1, 'th');
    expect(text).toContain('พรุ่งนี้');
    expect(text).toContain('ทุนทดสอบ');
    expect(text).toContain('https://example.com');
  });

  it('includes "14 วัน" for 14-day Thai', () => {
    const text = buildReminderText('ทุนทดสอบ', '2026-08-02', 'https://example.com', 14, 'th');
    expect(text).toContain('14 วัน');
  });

  it('includes "tomorrow" for 1-day English', () => {
    const text = buildReminderText('Test Fund', '2026-07-20', 'https://example.com', 1, 'en');
    expect(text).toContain('tomorrow');
    expect(text).toContain('Test Fund');
  });

  it('includes "14 days" for 14-day English', () => {
    const text = buildReminderText('Test Fund', '2026-08-02', 'https://example.com', 14, 'en');
    expect(text).toContain('14 days');
  });
});

// ─── shouldSendReminder ───────────────────────────────────────────────────────

const BASE = {
  deadlineDate: addDays(TODAY, 14),
  todayStr: TODAY,
  offsetDays: 14,
  reminderOptIn: true,
  lineUserId: 'Uabcdef1234567890',
  status: 'interested',
  alreadySent: false,
};

describe('shouldSendReminder — happy path', () => {
  it('sends when all conditions are met', () => {
    const { send, reason } = shouldSendReminder(BASE);
    expect(send).toBe(true);
    expect(reason).toBe('ok');
  });

  it('sends for status=applying', () => {
    const { send } = shouldSendReminder({ ...BASE, status: 'applying' });
    expect(send).toBe(true);
  });
});

describe('shouldSendReminder — exclusions', () => {
  it('skips when reminder_opt_in is false', () => {
    const { send, reason } = shouldSendReminder({ ...BASE, reminderOptIn: false });
    expect(send).toBe(false);
    expect(reason).toBe('opt-out');
  });

  it('skips when lineUserId is null', () => {
    const { send, reason } = shouldSendReminder({ ...BASE, lineUserId: null });
    expect(send).toBe(false);
    expect(reason).toBe('no-line-id');
  });

  it('skips when lineUserId is undefined', () => {
    const { send, reason } = shouldSendReminder({ ...BASE, lineUserId: undefined });
    expect(send).toBe(false);
    expect(reason).toBe('no-line-id');
  });

  it('skips when status is applied', () => {
    const { send, reason } = shouldSendReminder({ ...BASE, status: 'applied' });
    expect(send).toBe(false);
    expect(reason).toBe('status-applied');
  });

  it('skips when status is awarded', () => {
    const { send } = shouldSendReminder({ ...BASE, status: 'awarded' });
    expect(send).toBe(false);
  });

  it('skips when status is rejected', () => {
    const { send } = shouldSendReminder({ ...BASE, status: 'rejected' });
    expect(send).toBe(false);
  });

  it('skips when deadlineDate is null', () => {
    const { send, reason } = shouldSendReminder({ ...BASE, deadlineDate: null });
    expect(send).toBe(false);
    expect(reason).toBe('no-deadline');
  });

  it('skips when deadline is in the past', () => {
    const { send, reason } = shouldSendReminder({ ...BASE, deadlineDate: '2026-01-01' });
    expect(send).toBe(false);
    expect(reason).toBe('past-deadline');
  });

  it('skips when already sent', () => {
    const { send, reason } = shouldSendReminder({ ...BASE, alreadySent: true });
    expect(send).toBe(false);
    expect(reason).toBe('already-sent');
  });

  it('skips when the deadline is further out than the offset', () => {
    // deadline is 14 days away but we ask for offset=1. The catch-up window reaches
    // backwards only, so a deadline beyond the target is never pulled forward.
    const { send, reason } = shouldSendReminder({ ...BASE, offsetDays: 1 });
    expect(send).toBe(false);
    expect(reason).toBe('too-early');
  });
});

describe('shouldSendReminder — 1-day offset', () => {
  const base1 = {
    ...BASE,
    deadlineDate: addDays(TODAY, 1),
    offsetDays: 1,
  };

  it('sends for 1-day offset on correct date', () => {
    const { send } = shouldSendReminder(base1);
    expect(send).toBe(true);
  });

  it('does not send when deadline is 2 days away and offset is 1', () => {
    const { send } = shouldSendReminder({ ...base1, deadlineDate: addDays(TODAY, 2) });
    expect(send).toBe(false);
  });
});

describe('shouldSendReminder — idempotency via alreadySent', () => {
  it('does not double-send if sentSet already has the key', () => {
    const { send } = shouldSendReminder({ ...BASE, alreadySent: true });
    expect(send).toBe(false);
  });
});

describe('offsetWindows', () => {
  it('lets each offset fire for catchupDays past its target', () => {
    const w = offsetWindows([14, 1], 3);
    expect(w.get(14)).toBe(11);   // 14 covers 11–14 days remaining
    expect(w.get(1)).toBe(0);     // 1 covers 0–1
  });

  it('clamps a window so two offsets never fire on the same morning', () => {
    // Without the clamp a wide catch-up would let the 7-day and 5-day notices both match
    // one tracked row, and the student gets two near-identical messages about one
    // scholarship. The lower offset wins the overlapping days.
    const w = offsetWindows([7, 5], 4);
    expect(w.get(7)).toBe(6);     // not 3 — 5's territory starts at 6
    expect(w.get(5)).toBe(1);
  });

  it('is exact matching when catchupDays is 0', () => {
    const w = offsetWindows([14, 1], 0);
    expect(w.get(14)).toBe(14);
    expect(w.get(1)).toBe(1);
  });

  it('never lets a window go below zero', () => {
    expect(offsetWindows([2], 30).get(2)).toBe(0);
  });
});

describe('shouldSendReminder — catch-up window', () => {
  const withWindow = (deadlineOffset: number, offsetDays: number, lowerBound: number) =>
    shouldSendReminder({
      ...BASE,
      deadlineDate: addDays(TODAY, deadlineOffset),
      offsetDays,
      lowerBound,
    });

  it('still sends a 14-day notice that is two days late', () => {
    // The case this exists for: the cron did not run for two mornings.
    const { send, reason, daysRemaining } = withWindow(12, 14, 11);
    expect(send).toBe(true);
    expect(reason).toBe('catch-up');
    expect(daysRemaining).toBe(12);
  });

  it('reports the exact-match send as ok rather than catch-up', () => {
    const { send, reason, daysRemaining } = withWindow(14, 14, 11);
    expect(send).toBe(true);
    expect(reason).toBe('ok');
    expect(daysRemaining).toBe(14);
  });

  it('gives up once the window has passed', () => {
    // Four days late for a 14-day notice. "14 days left" would be false and "10 days
    // left" is not the reminder anyone signed up for — the 1-day notice still comes.
    const { send, reason } = withWindow(10, 14, 11);
    expect(send).toBe(false);
    expect(reason).toBe('window-passed');
  });

  it('defaults to exact matching when no window is supplied', () => {
    const { send, reason } = shouldSendReminder({
      ...BASE, deadlineDate: addDays(TODAY, 12), offsetDays: 14,
    });
    expect(send).toBe(false);
    expect(reason).toBe('window-passed');
  });
});

describe('buildReminderText — days remaining, not the offset', () => {
  it('states the days actually left on a catch-up send', () => {
    // A late 14-day notice must not claim 14 days when 12 remain.
    expect(buildReminderText('ทุน X', '2026-09-04', 'https://x.test', 12, 'th'))
      .toContain('เหลืออีก 12 วัน');
  });

  it('says last day rather than "0 days left"', () => {
    expect(buildReminderText('ทุน X', '2026-08-23', 'https://x.test', 0, 'th'))
      .toContain('วันนี้วันสุดท้าย');
    expect(buildReminderText('Scholarship X', '2026-08-23', 'https://x.test', 0, 'en'))
      .toContain('Last day to apply');
  });
});
