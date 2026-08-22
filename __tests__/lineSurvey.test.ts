/**
 * Pure-logic tests for the LINE outcome survey (lib/line/survey.ts).
 * Covers: the 4-answer message, branch routing, amount parsing, the 30-day
 * duplicate guard, per-user rate limiting, and re-ask scheduling.
 */

import { describe, it, expect } from 'vitest';
import {
  COPY,
  SURVEY_CHOICES,
  MIN_RESURVEY_GAP_DAYS,
  buildSurveyMessage,
  buildAmountQuestion,
  buildConsentQuestion,
  buildReminderOptInQuestion,
  parseSurveyPostback,
  parseAmountThb,
  routeSurveyAnswer,
  shouldSendSurvey,
  isReaskDue,
  addDaysIso,
  daysBetween,
  parseMaxPerUserPerDay,
  parseReaskDays,
} from '@/lib/line/survey';

const TODAY = '2026-08-22';

function eligibility(overrides: Partial<Parameters<typeof shouldSendSurvey>[0]> = {}) {
  return shouldSendSurvey({
    lineUserId:       'U-line-1',
    reminderOptIn:    true,
    status:           'applied',
    deadlineDate:     '2026-07-23',   // TODAY − 30
    todayStr:         TODAY,
    offsetDays:       30,
    lastSentAt:       null,
    sentToUserToday:  0,
    maxPerUserPerDay: 1,
    hasOpenSurvey:    false,
    ...overrides,
  });
}

// ── Message 1 ──────────────────────────────────────────────────────────────

describe('buildSurveyMessage', () => {
  it('offers exactly the four answers with distinct postback payloads', () => {
    const msg = buildSurveyMessage('ทุนตัวอย่าง', 'TD-0001');
    const items = msg.quickReply!.items;

    expect(items).toHaveLength(4);
    expect(items.map(i => i.action.data)).toEqual([
      'survey:TD-0001:awarded',
      'survey:TD-0001:waiting',
      'survey:TD-0001:not_applied',
      'survey:TD-0001:rejected',
    ]);
  });

  it('interpolates the scholarship name into the Thai question', () => {
    expect(buildSurveyMessage('ทุนตัวอย่าง', 'TD-0001').text).toContain('ทุนตัวอย่าง');
    expect(buildSurveyMessage('ทุนตัวอย่าง', 'TD-0001').text).not.toContain('{name}');
  });

  it('keeps every quick-reply label inside LINE’s 20-character limit', () => {
    for (const item of buildSurveyMessage('X', 'TD-0001').quickReply!.items) {
      expect([...item.action.label].length).toBeLessThanOrEqual(20);
    }
    for (const label of [COPY.amountSkipLabel, COPY.consentYesLabel, COPY.consentNoLabel,
                         COPY.remindYesLabel, COPY.remindNoLabel]) {
      expect([...label].length).toBeLessThanOrEqual(20);
    }
  });

  it('appends the incentive note when one is configured', () => {
    expect(buildSurveyMessage('X', 'TD-0001', 'มีของรางวัล').text).toContain('มีของรางวัล');
  });
});

// ── Postback protocol ──────────────────────────────────────────────────────

describe('parseSurveyPostback', () => {
  it.each(SURVEY_CHOICES)('round-trips the %s answer', choice => {
    expect(parseSurveyPostback(`survey:TD-0001:${choice}`))
      .toEqual({ kind: 'answer', scholarshipId: 'TD-0001', choice });
  });

  it('parses the amount-skip, consent and reminder follow-ups', () => {
    expect(parseSurveyPostback('amount:TD-0001:skip'))
      .toEqual({ kind: 'amount', scholarshipId: 'TD-0001', skip: true });
    expect(parseSurveyPostback('consent:TD-0001:yes'))
      .toEqual({ kind: 'consent', scholarshipId: 'TD-0001', agreed: true });
    expect(parseSurveyPostback('consent:TD-0001:no'))
      .toEqual({ kind: 'consent', scholarshipId: 'TD-0001', agreed: false });
    expect(parseSurveyPostback('remind:TD-0001:yes'))
      .toEqual({ kind: 'remind', scholarshipId: 'TD-0001', optIn: true });
  });

  it('handles a scholarship id containing a colon', () => {
    expect(parseSurveyPostback('survey:TD:0001:awarded'))
      .toEqual({ kind: 'answer', scholarshipId: 'TD:0001', choice: 'awarded' });
  });

  it('rejects malformed, unknown and empty-id payloads', () => {
    for (const bad of ['', 'survey', 'survey:TD-0001', 'survey:TD-0001:maybe',
                       'bogus:TD-0001:awarded', 'consent:TD-0001:perhaps', 'survey::awarded']) {
      expect(parseSurveyPostback(bad)).toBeNull();
    }
  });
});

// ── Amount capture ─────────────────────────────────────────────────────────

describe('parseAmountThb', () => {
  it('accepts plain, comma-grouped, suffixed and Thai-numeral amounts', () => {
    expect(parseAmountThb('50000')).toBe(50000);
    expect(parseAmountThb('50,000')).toBe(50000);
    expect(parseAmountThb('50000 บาท')).toBe(50000);
    expect(parseAmountThb('฿50,000')).toBe(50000);
    expect(parseAmountThb('  50000  ')).toBe(50000);
    expect(parseAmountThb('๕๐๐๐๐')).toBe(50000);
    expect(parseAmountThb('12500.50')).toBe(12500.5);
    expect(parseAmountThb('0')).toBe(0);
  });

  it('rejects free text, negatives and absurd values', () => {
    for (const bad of ['', 'ไม่รู้', 'ประมาณห้าหมื่น', '-5000', '50000บาทค่ะ ขอบคุณ', '1e9', '999999999']) {
      expect(parseAmountThb(bad)).toBeNull();
    }
  });

  it('accepts a six-digit amount — the case that collides with a link code', () => {
    expect(parseAmountThb('100000')).toBe(100000);
  });
});

// ── Branch routing ─────────────────────────────────────────────────────────

describe('routeSurveyAnswer', () => {
  const opts = { todayStr: TODAY, reaskDays: 30 };

  it('awarded → asks for the amount and marks the tracked row awarded', () => {
    const r = routeSurveyAnswer('awarded', 'TD-0001', opts);
    expect(r.nextState).toBe('awaiting_amount');
    expect(r.trackedStatus).toBe('awarded');
    expect(r.messages[0].text).toBe(COPY.amountQuestion);
    expect(r.messages[0].quickReply!.items[0].action.data).toBe('amount:TD-0001:skip');
  });

  it('waiting → schedules a re-ask and promises it in the reply', () => {
    const r = routeSurveyAnswer('waiting', 'TD-0001', opts);
    expect(r.nextState).toBe('awaiting_reask');
    expect(r.reaskAfter).toBe('2026-09-21');
    expect(r.messages[0].text).toContain('30');
    expect(r.trackedStatus).toBeUndefined();
  });

  it('not_applied → offers the deadline-reminder opt-in', () => {
    const r = routeSurveyAnswer('not_applied', 'TD-0001', opts);
    expect(r.nextState).toBe('awaiting_reminder_optin');
    expect(r.messages[0].quickReply!.items.map(i => i.action.data))
      .toEqual(['remind:TD-0001:yes', 'remind:TD-0001:no']);
  });

  it('rejected → sends the supportive message with the tundee.org nudge and closes', () => {
    const r = routeSurveyAnswer('rejected', 'TD-0001', opts);
    expect(r.nextState).toBe('done');
    expect(r.trackedStatus).toBe('rejected');
    expect(r.messages[0].text).toContain('tundee.org');
  });
});

describe('follow-up questions', () => {
  it('the consent question offers a clear yes and no', () => {
    expect(buildConsentQuestion('TD-0001').quickReply!.items.map(i => i.action.data))
      .toEqual(['consent:TD-0001:yes', 'consent:TD-0001:no']);
  });

  it('the amount question always offers a skip', () => {
    expect(buildAmountQuestion('TD-0001').quickReply!.items[0].action.data)
      .toBe('amount:TD-0001:skip');
  });

  it('the reminder question is the not_applied branch’s only ask', () => {
    expect(buildReminderOptInQuestion('TD-0001').text).toBe(COPY.notAppliedQuestion);
  });
});

// ── Send eligibility ───────────────────────────────────────────────────────

describe('shouldSendSurvey', () => {
  it('sends when the offset lands on today and nothing blocks it', () => {
    expect(eligibility()).toEqual({ send: true, reason: 'ok' });
  });

  it('skips a user asked about the same scholarship inside the 30-day window', () => {
    const yesterday = `${addDaysIso(TODAY, -1)}T08:00:00.000Z`;
    expect(eligibility({ lastSentAt: yesterday }))
      .toEqual({ send: false, reason: 'asked-recently' });

    const dayBefore = `${addDaysIso(TODAY, -(MIN_RESURVEY_GAP_DAYS - 1))}T08:00:00.000Z`;
    expect(eligibility({ lastSentAt: dayBefore }).send).toBe(false);
  });

  it('sends again once the 30-day window has fully elapsed', () => {
    const gap = `${addDaysIso(TODAY, -MIN_RESURVEY_GAP_DAYS)}T08:00:00.000Z`;
    expect(eligibility({ lastSentAt: gap })).toEqual({ send: true, reason: 'ok' });
  });

  it('rate-limits per user', () => {
    expect(eligibility({ sentToUserToday: 1, maxPerUserPerDay: 1 }))
      .toEqual({ send: false, reason: 'rate-limited' });
    expect(eligibility({ sentToUserToday: 1, maxPerUserPerDay: 2 }).send).toBe(true);
  });

  it('never starts a second survey while one conversation is open', () => {
    expect(eligibility({ hasOpenSurvey: true }))
      .toEqual({ send: false, reason: 'conversation-open' });
  });

  it('skips unreachable, opted-out, untracked and undated rows', () => {
    expect(eligibility({ lineUserId: null }).reason).toBe('no-line-id');
    expect(eligibility({ reminderOptIn: false }).reason).toBe('opt-out');
    expect(eligibility({ status: 'interested' }).reason).toBe('status-interested');
    expect(eligibility({ deadlineDate: null }).reason).toBe('no-deadline');
  });

  it('skips when today is not the offset date', () => {
    expect(eligibility({ offsetDays: 60 }).reason).toBe('date-mismatch');
  });

  it('force lets an admin override the guards — but never the missing LINE id', () => {
    const yesterday = `${addDaysIso(TODAY, -1)}T08:00:00.000Z`;
    expect(eligibility({ force: true, lastSentAt: yesterday, hasOpenSurvey: true }))
      .toEqual({ send: true, reason: 'forced' });
    expect(eligibility({ force: true, lineUserId: null }).reason).toBe('no-line-id');
  });
});

// ── Small helpers ──────────────────────────────────────────────────────────

describe('date + env helpers', () => {
  it('addDaysIso moves forward and backward across a month boundary', () => {
    expect(addDaysIso('2026-08-22', 30)).toBe('2026-09-21');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('daysBetween counts whole days', () => {
    expect(daysBetween('2026-08-22T00:00:00Z', '2026-07-23T00:00:00Z')).toBe(30);
  });

  it('isReaskDue fires on and after the scheduled date only', () => {
    expect(isReaskDue('2026-08-21', TODAY)).toBe(true);
    expect(isReaskDue('2026-08-22', TODAY)).toBe(true);
    expect(isReaskDue('2026-08-23', TODAY)).toBe(false);
    expect(isReaskDue(null, TODAY)).toBe(false);
  });

  it('env parsers fall back on junk', () => {
    expect(parseMaxPerUserPerDay(undefined)).toBe(1);
    expect(parseMaxPerUserPerDay('3')).toBe(3);
    expect(parseMaxPerUserPerDay('nonsense')).toBe(1);
    expect(parseReaskDays('45')).toBe(45);
    expect(parseReaskDays('0')).toBe(30);
  });
});
