/**
 * Pure business logic for the LINE outcome self-report flow — extracted so
 * tests don't need a live DB or LINE access token.
 */

import { addDays, parseIntList } from '@/lib/line/reminders';
import type { LineTextMessage } from '@/lib/line/push';

export const DEFAULT_OUTCOME_OFFSETS = [30, 60, 90] as const;
export const MAX_OUTCOME_ATTEMPTS = 3;

export type OutcomeChoice = 'awarded' | 'rejected' | 'waiting';

/** Parse the OUTCOME_OFFSETS env var, falling back to DEFAULT_OUTCOME_OFFSETS. */
export function parseOutcomeOffsets(env?: string): number[] {
  return parseIntList(env, DEFAULT_OUTCOME_OFFSETS);
}

/** Determine whether a tracked row is due for an outcome follow-up today. */
export function shouldSendOutcomeFollowup(opts: {
  deadlineDate: string | null;
  todayStr: string;
  offsetDays: number;
  attemptNo: number;
  reminderOptIn: boolean;
  lineUserId: string | null | undefined;
  status: string;
  alreadySent: boolean;
}): { send: boolean; reason: string } {
  const { deadlineDate, todayStr, offsetDays, attemptNo, reminderOptIn, lineUserId, status, alreadySent } = opts;

  if (!reminderOptIn) return { send: false, reason: 'opt-out' };
  if (!lineUserId) return { send: false, reason: 'no-line-id' };
  if (!['applying', 'applied'].includes(status)) return { send: false, reason: `status-${status}` };
  if (!deadlineDate) return { send: false, reason: 'no-deadline' };
  if (attemptNo > MAX_OUTCOME_ATTEMPTS) return { send: false, reason: 'max-attempts' };
  if (alreadySent) return { send: false, reason: 'already-sent' };

  const targetDate = addDays(deadlineDate, offsetDays);
  if (targetDate !== todayStr) return { send: false, reason: 'date-mismatch' };

  return { send: true, reason: 'ok' };
}

/** Build the LINE outcome-followup push message: question text + 3 quick-reply buttons. */
export function buildOutcomeFollowupMessage(
  scholarshipName: string,
  scholarshipId: string,
  lang: 'th' | 'en' = 'th',
  incentiveNote?: string,
): LineTextMessage {
  const question = lang === 'th'
    ? `ผลทุน ${scholarshipName} เป็นอย่างไรบ้าง?`
    : `How did your application for ${scholarshipName} turn out?`;
  const labels = lang === 'th'
    ? { awarded: 'ได้รับทุน 🎉', rejected: 'ไม่ได้รับ', waiting: 'ยังรอผล' }
    : { awarded: 'Awarded 🎉', rejected: 'Not awarded', waiting: 'Still waiting' };

  const text = incentiveNote ? `${question}\n${incentiveNote}` : question;

  return {
    type: 'text',
    text,
    quickReply: {
      items: (['awarded', 'rejected', 'waiting'] as const).map(choice => ({
        type: 'action',
        action: {
          type: 'postback',
          label: labels[choice],
          data: `outcome:${scholarshipId}:${choice}`,
          displayText: labels[choice],
        },
      })),
    },
  };
}

/** Parse a postback data string of the form "outcome:<scholarshipId>:<choice>". */
export function parseOutcomePostback(data: string): { scholarshipId: string; choice: OutcomeChoice } | null {
  const match = /^outcome:(.+):(awarded|rejected|waiting)$/.exec(data);
  if (!match) return null;
  return { scholarshipId: match[1], choice: match[2] as OutcomeChoice };
}

/** Map a student's answer to the tracked_scholarship.status update — null means "leave as-is". */
export function outcomeChoiceToStatus(choice: OutcomeChoice): 'awarded' | 'rejected' | null {
  if (choice === 'awarded') return 'awarded';
  if (choice === 'rejected') return 'rejected';
  return null;
}

/** Build the LINE reply text confirming the student's answer was recorded. */
export function buildOutcomeConfirmationText(choice: OutcomeChoice, lang: 'th' | 'en' = 'th'): string {
  if (lang === 'th') {
    return choice === 'awarded'
      ? 'บันทึกแล้ว ขอบคุณค่ะ 🙏 ยินดีด้วยนะคะ! 🎉'
      : 'บันทึกแล้ว ขอบคุณค่ะ 🙏';
  }
  return choice === 'awarded'
    ? 'Got it, thank you! 🙏 Congratulations! 🎉'
    : 'Got it, thank you! 🙏';
}
