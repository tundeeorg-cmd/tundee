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

  it('skips when date does not match offset', () => {
    // deadline is 14 days away but we ask for offset=1
    const { send, reason } = shouldSendReminder({ ...BASE, offsetDays: 1 });
    expect(send).toBe(false);
    expect(reason).toBe('date-mismatch');
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
