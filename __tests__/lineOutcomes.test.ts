/**
 * Tests for the LINE outcome self-report business logic.
 * Uses Vitest. No DB or LINE API needed — only pure functions.
 */

import { describe, it, expect } from 'vitest';
import {
  parseOutcomeOffsets,
  shouldSendOutcomeFollowup,
  buildOutcomeFollowupMessage,
  parseOutcomePostback,
  outcomeChoiceToStatus,
  buildOutcomeConfirmationText,
  DEFAULT_OUTCOME_OFFSETS,
  MAX_OUTCOME_ATTEMPTS,
} from '@/lib/line/outcomes';
import { addDays } from '@/lib/line/reminders';

const TODAY = '2026-07-20';

// ─── parseOutcomeOffsets ────────────────────────────────────────────────────

describe('parseOutcomeOffsets', () => {
  it('defaults to 30/60/90 when env is undefined', () => {
    expect(parseOutcomeOffsets(undefined)).toEqual([...DEFAULT_OUTCOME_OFFSETS]);
  });

  it('defaults when env is empty string', () => {
    expect(parseOutcomeOffsets('')).toEqual([...DEFAULT_OUTCOME_OFFSETS]);
  });

  it('parses a custom list', () => {
    expect(parseOutcomeOffsets('7,21')).toEqual([7, 21]);
  });

  it('drops invalid entries', () => {
    expect(parseOutcomeOffsets('30,abc,-5,90')).toEqual([30, 90]);
  });
});

// ─── shouldSendOutcomeFollowup ──────────────────────────────────────────────

const BASE = {
  deadlineDate: addDays(TODAY, -30),
  todayStr: TODAY,
  offsetDays: 30,
  attemptNo: 1,
  reminderOptIn: true,
  lineUserId: 'Uabcdef1234567890',
  status: 'applied',
  alreadySent: false,
};

describe('shouldSendOutcomeFollowup — happy path', () => {
  it('sends 30 days after a passed deadline (attempt 1)', () => {
    const { send, reason } = shouldSendOutcomeFollowup(BASE);
    expect(send).toBe(true);
    expect(reason).toBe('ok');
  });

  it('sends for status=applying', () => {
    const { send } = shouldSendOutcomeFollowup({ ...BASE, status: 'applying' });
    expect(send).toBe(true);
  });

  it('sends attempt 2 at 60 days when attempt 1 was already sent for offset 30', () => {
    const { send } = shouldSendOutcomeFollowup({
      ...BASE,
      deadlineDate: addDays(TODAY, -60),
      offsetDays: 60,
      attemptNo: 2,
    });
    expect(send).toBe(true);
  });

  it('sends attempt 3 at 90 days', () => {
    const { send } = shouldSendOutcomeFollowup({
      ...BASE,
      deadlineDate: addDays(TODAY, -90),
      offsetDays: 90,
      attemptNo: 3,
    });
    expect(send).toBe(true);
  });
});

describe('shouldSendOutcomeFollowup — never before the deadline', () => {
  it('does not send when the deadline is still in the future', () => {
    const { send, reason } = shouldSendOutcomeFollowup({
      ...BASE,
      deadlineDate: addDays(TODAY, 5),
    });
    expect(send).toBe(false);
    expect(reason).toBe('date-mismatch');
  });

  it('does not send on the deadline day itself (offset has not elapsed yet)', () => {
    const { send, reason } = shouldSendOutcomeFollowup({ ...BASE, deadlineDate: TODAY });
    expect(send).toBe(false);
    expect(reason).toBe('date-mismatch');
  });
});

describe('shouldSendOutcomeFollowup — exclusions', () => {
  it('skips when reminder_opt_in is false', () => {
    const { send, reason } = shouldSendOutcomeFollowup({ ...BASE, reminderOptIn: false });
    expect(send).toBe(false);
    expect(reason).toBe('opt-out');
  });

  it('skips when lineUserId is missing', () => {
    const { send, reason } = shouldSendOutcomeFollowup({ ...BASE, lineUserId: null });
    expect(send).toBe(false);
    expect(reason).toBe('no-line-id');
  });

  it('skips when status is interested (never applied)', () => {
    const { send, reason } = shouldSendOutcomeFollowup({ ...BASE, status: 'interested' });
    expect(send).toBe(false);
    expect(reason).toBe('status-interested');
  });

  it('skips once status has already resolved to awarded', () => {
    const { send } = shouldSendOutcomeFollowup({ ...BASE, status: 'awarded' });
    expect(send).toBe(false);
  });

  it('skips once status has already resolved to rejected', () => {
    const { send } = shouldSendOutcomeFollowup({ ...BASE, status: 'rejected' });
    expect(send).toBe(false);
  });

  it('skips when there is no concrete deadline_date', () => {
    const { send, reason } = shouldSendOutcomeFollowup({ ...BASE, deadlineDate: null });
    expect(send).toBe(false);
    expect(reason).toBe('no-deadline');
  });

  it('skips beyond the max attempt count', () => {
    const { send, reason } = shouldSendOutcomeFollowup({
      ...BASE,
      deadlineDate: addDays(TODAY, -120),
      offsetDays: 120,
      attemptNo: MAX_OUTCOME_ATTEMPTS + 1,
    });
    expect(send).toBe(false);
    expect(reason).toBe('max-attempts');
  });

  it('skips when this attempt was already sent (idempotency)', () => {
    const { send, reason } = shouldSendOutcomeFollowup({ ...BASE, alreadySent: true });
    expect(send).toBe(false);
    expect(reason).toBe('already-sent');
  });
});

// ─── buildOutcomeFollowupMessage ────────────────────────────────────────────

describe('buildOutcomeFollowupMessage', () => {
  it('builds a Thai question with 3 postback quick-reply buttons', () => {
    const msg = buildOutcomeFollowupMessage('ทุนทดสอบ', 'TD-0001', 'th');
    expect(msg.type).toBe('text');
    expect(msg.text).toContain('ทุนทดสอบ');
    expect(msg.quickReply?.items).toHaveLength(3);

    const choices = msg.quickReply!.items.map(i => i.action.data);
    expect(choices).toEqual([
      'outcome:TD-0001:awarded',
      'outcome:TD-0001:rejected',
      'outcome:TD-0001:waiting',
    ]);
    msg.quickReply!.items.forEach(i => expect(i.action.type).toBe('postback'));
  });

  it('builds an English question', () => {
    const msg = buildOutcomeFollowupMessage('Test Fund', 'TD-0001', 'en');
    expect(msg.text).toContain('Test Fund');
    expect(msg.quickReply?.items.map(i => i.action.label)).toEqual([
      'Awarded 🎉', 'Not awarded', 'Still waiting',
    ]);
  });

  it('appends an optional incentive note', () => {
    const msg = buildOutcomeFollowupMessage('ทุนทดสอบ', 'TD-0001', 'th', 'ขอบคุณที่ช่วยตอบนะคะ');
    expect(msg.text).toContain('ขอบคุณที่ช่วยตอบนะคะ');
  });

  it('omits the incentive note when not provided', () => {
    const msg = buildOutcomeFollowupMessage('ทุนทดสอบ', 'TD-0001', 'th');
    expect(msg.text.split('\n')).toHaveLength(1);
  });
});

// ─── parseOutcomePostback ───────────────────────────────────────────────────

describe('parseOutcomePostback', () => {
  it('parses a valid awarded postback', () => {
    expect(parseOutcomePostback('outcome:TD-0001:awarded')).toEqual({
      scholarshipId: 'TD-0001', choice: 'awarded',
    });
  });

  it('parses a scholarship id containing hyphens', () => {
    expect(parseOutcomePostback('outcome:TD-2026-0099:rejected')).toEqual({
      scholarshipId: 'TD-2026-0099', choice: 'rejected',
    });
  });

  it('returns null for an unrelated postback', () => {
    expect(parseOutcomePostback('something:else')).toBeNull();
  });

  it('returns null for an invalid choice', () => {
    expect(parseOutcomePostback('outcome:TD-0001:maybe')).toBeNull();
  });
});

// ─── outcomeChoiceToStatus ───────────────────────────────────────────────────

describe('outcomeChoiceToStatus', () => {
  it('maps awarded → awarded', () => {
    expect(outcomeChoiceToStatus('awarded')).toBe('awarded');
  });

  it('maps rejected → rejected', () => {
    expect(outcomeChoiceToStatus('rejected')).toBe('rejected');
  });

  it('maps waiting → null (no status change)', () => {
    expect(outcomeChoiceToStatus('waiting')).toBeNull();
  });
});

// ─── buildOutcomeConfirmationText ───────────────────────────────────────────

describe('buildOutcomeConfirmationText', () => {
  it('adds a congrats line for awarded (Thai)', () => {
    const text = buildOutcomeConfirmationText('awarded', 'th');
    expect(text).toContain('บันทึกแล้ว');
    expect(text).toContain('ยินดีด้วย');
  });

  it('is a plain thank-you for rejected (Thai)', () => {
    const text = buildOutcomeConfirmationText('rejected', 'th');
    expect(text).toContain('บันทึกแล้ว');
    expect(text).not.toContain('ยินดีด้วย');
  });

  it('is a plain thank-you for waiting (Thai)', () => {
    const text = buildOutcomeConfirmationText('waiting', 'th');
    expect(text).toContain('บันทึกแล้ว');
  });

  it('adds congratulations for awarded (English)', () => {
    expect(buildOutcomeConfirmationText('awarded', 'en')).toContain('Congratulations');
  });
});
