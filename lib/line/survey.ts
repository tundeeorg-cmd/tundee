/**
 * LINE outcome-survey flow — message copy, postback protocol, state machine.
 *
 * The survey is a short multi-turn conversation over LINE quick replies:
 *
 *   Message 1  →  awarded | waiting | not_applied | rejected
 *     awarded      →  amount question (free text, or "skip")
 *                  →  consent question (yes/no)  → consent_research
 *     waiting      →  schedule a re-ask (survey_log.state = 'awaiting_reask')
 *     not_applied  →  offer a deadline-reminder opt-in
 *     rejected     →  supportive message + tundee.org nudge
 *
 * Everything in here is pure except sendOutcomeSurvey(), so the branch logic
 * can be tested without a live DB or LINE access token.
 *
 * PDPA: the only student data this flow ever records is status, amount and
 * consent. Free text is parsed for a number and then discarded.
 */

import { parseIntList } from '@/lib/line/reminders';
import { linePush, type LineTextMessage, type LineQuickReplyAction } from '@/lib/line/push';

// ═══════════════════════════════════════════════════════════════════════════
// Copy — DRAFT Thai strings.
// All user-facing text lives in this block and nowhere else, so it can be
// rewritten without touching any logic below. Voice matches the existing
// reminder/outcome copy in lib/line/reminders.ts and lib/line/outcomes.ts.
// ═══════════════════════════════════════════════════════════════════════════

export const COPY = {
  /** Message 1 — the survey itself. {name} is the scholarship name. */
  question:
    'สวัสดีค่ะ 👋 ทุนดีมาถามผลทุนนะคะ\n\n' +
    '"{name}"\n' +
    'ตอนนี้ผลเป็นยังไงบ้างคะ?\n\n' +
    'กดปุ่มตอบได้เลย ใช้เวลาแค่ 3 วินาที\n' +
    'คำตอบของน้องจะช่วยให้รุ่นน้องหาทุนได้ง่ายขึ้นค่ะ 🙏',

  /** Quick-reply labels for Message 1 (LINE caps labels at 20 characters). */
  choiceLabels: {
    awarded:     'ได้ทุนแล้ว 🎉',
    waiting:     'ยังรอผลอยู่',
    not_applied: 'ไม่ได้สมัคร',
    rejected:    'ไม่ได้ทุนรอบนี้',
  },

  // ── awarded branch ──────────────────────────────────────────────────────
  amountQuestion:
    'ยินดีด้วยนะคะ! 🎉 เก่งมากเลยค่ะ\n\n' +
    'ขอถามอีกนิดเดียวนะคะ — ทุนที่ได้เป็นจำนวนเงินเท่าไหร่คะ?\n' +
    'พิมพ์แค่ตัวเลขได้เลยค่ะ เช่น 50000\n\n' +
    'ข้อมูลนี้ช่วยให้ทุนดีบอกรุ่นน้องได้ว่าทุนไหนให้จริงเท่าไหร่\n' +
    'ถ้าไม่สะดวกบอก กดข้ามได้เลยค่ะ ไม่เป็นไรเลย',
  amountSkipLabel: 'ขอข้ามค่ะ',
  amountUnparseable:
    'ขอโทษค่ะ ทุนดีอ่านตัวเลขไม่ออก 🙈\n' +
    'ลองพิมพ์เฉพาะตัวเลขอีกครั้งนะคะ เช่น 50000\n' +
    'หรือกดข้ามไปก่อนก็ได้ค่ะ',

  consentQuestion:
    'ขอบคุณมากเลยค่ะ 🙏\n\n' +
    'ทุนดีขออนุญาตนำข้อมูลนี้ไปใช้ในงานวิจัยเรื่องการเข้าถึงทุนของเด็กไทย ' +
    'เพื่อผลักดันให้ทุนไปถึงคนที่ต้องการจริง ๆ ได้ไหมคะ?\n\n' +
    'ใช้แค่ ชื่อทุน สถานะ และจำนวนเงิน เท่านั้นค่ะ\n' +
    'ไม่มีชื่อ เบอร์ หรืออีเมลของน้องอยู่ในงานวิจัยแน่นอน\n\n' +
    'น้องเลือกไม่ให้ก็ได้นะคะ ไม่มีผลกับการใช้งานทุนดีเลยค่ะ',
  consentYesLabel: 'ยินดีค่ะ',
  consentNoLabel:  'ขอไม่ให้ค่ะ',
  consentYesReply:
    'ขอบคุณมากค่ะ 🙏💙\n' +
    'ข้อมูลของน้องจะช่วยให้รุ่นน้องอีกหลายคนเข้าถึงทุนได้ง่ายขึ้นจริง ๆ ค่ะ',
  consentNoReply:
    'รับทราบค่ะ 🙏\n' +
    'ทุนดีจะเก็บข้อมูลนี้ไว้สำหรับน้องคนเดียว ไม่นำไปใช้ในงานวิจัยนะคะ\n' +
    'ขอบคุณที่บอกผลให้ทุนดีรู้ค่ะ',

  // ── waiting branch ──────────────────────────────────────────────────────
  waitingReply:
    'รับทราบค่ะ 🙏\n' +
    'ทุนดีจะกลับมาถามใหม่ในอีกประมาณ {days} วันนะคะ\n\n' +
    'ระหว่างนี้ถ้ามีข่าวดี พิมพ์บอกได้เลยค่ะ\n' +
    'ขอให้ได้ข่าวดีนะคะ 🤞',

  // ── not_applied branch ──────────────────────────────────────────────────
  notAppliedQuestion:
    'รับทราบค่ะ ไม่เป็นไรเลยนะคะ 🙏\n' +
    'บางทีจังหวะไม่พอดี หรือเงื่อนไขไม่ตรง ก็เกิดขึ้นได้ค่ะ\n\n' +
    'อยากให้ทุนดีเตือนก่อนหมดเขตทุนรอบหน้าไหมคะ?',
  remindYesLabel: 'เตือนด้วยค่ะ',
  remindNoLabel:  'ไม่ต้องค่ะ',
  remindYesReply:
    'เรียบร้อยค่ะ 🔔\n' +
    'ทุนดีจะเตือนล่วงหน้า 14 วัน และเตือนอีกครั้งก่อนปิดรับ 1 วันนะคะ',
  remindNoReply:
    'รับทราบค่ะ 🙏\n' +
    'ถ้าเปลี่ยนใจ เปิดแจ้งเตือนได้ที่หน้าทุนที่ติดตาม ในเว็บทุนดีค่ะ',

  // ── rejected branch ─────────────────────────────────────────────────────
  rejectedReply:
    'ขอบคุณที่บอกทุนดีนะคะ 🙏\n\n' +
    'รอบนี้ยังไม่ได้ ไม่ได้แปลว่าน้องไม่เก่งนะคะ\n' +
    'ทุนแต่ละที่มีโควตาและเกณฑ์ต่างกันมาก บางทุนรับแค่ 5 คน จากผู้สมัครเป็นพัน ' +
    'และหลายคนที่ได้ทุน ก็เพิ่งได้ตอนสมัครรอบที่ 2 หรือ 3 ค่ะ 💙\n\n' +
    'ตอนนี้ยังมีทุนอื่นที่เปิดรับอยู่ และหลายทุนอาจตรงกับน้องมากกว่าเดิม\n' +
    'ลองเข้าไปดูได้ที่ tundee.org นะคะ\n' +
    'ทุนดีเป็นกำลังใจให้เสมอค่ะ 🌱',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Types + tunables
// ═══════════════════════════════════════════════════════════════════════════

export type SurveyStatus = 'awarded' | 'waiting' | 'not_applied' | 'rejected' | 'unknown';
export type SurveyState  = 'sent' | 'awaiting_amount' | 'awaiting_consent'
                         | 'awaiting_reminder_optin' | 'awaiting_reask'
                         | 'done' | 'skipped';

/** States in which the student still owes us a reply. */
export const OPEN_SURVEY_STATES: SurveyState[] = [
  'sent', 'awaiting_amount', 'awaiting_consent', 'awaiting_reminder_optin', 'awaiting_reask',
];

export const SURVEY_CHOICES = ['awarded', 'waiting', 'not_applied', 'rejected'] as const;
export type SurveyChoice = (typeof SURVEY_CHOICES)[number];

/** Never ask the same user about the same scholarship twice inside this window. */
export const MIN_RESURVEY_GAP_DAYS = 30;
/** Days to wait before re-asking someone who answered "waiting". */
export const DEFAULT_REASK_DAYS = 30;
/** Per-user push cap per cron run / per day. */
export const DEFAULT_MAX_PER_USER_PER_DAY = 1;
/** Largest award we'll accept from free text — anything above is a typo. */
export const MAX_AMOUNT_THB = 100_000_000;

export const DEFAULT_SURVEY_OFFSETS = [30, 60, 90] as const;

export interface SurveyApplication {
  user_id: string;
  scholarship_id: string;
  scholarship_name: string | null;
}

export function parseSurveyOffsets(env?: string): number[] {
  return parseIntList(env, DEFAULT_SURVEY_OFFSETS);
}

export function parseReaskDays(env?: string): number {
  const n = parseInt(env ?? '', 10);
  return !isNaN(n) && n > 0 ? n : DEFAULT_REASK_DAYS;
}

export function parseMaxPerUserPerDay(env?: string): number {
  const n = parseInt(env ?? '', 10);
  return !isNaN(n) && n > 0 ? n : DEFAULT_MAX_PER_USER_PER_DAY;
}

// ═══════════════════════════════════════════════════════════════════════════
// Postback protocol
//
//   survey:<scholarshipId>:<awarded|waiting|not_applied|rejected>
//   amount:<scholarshipId>:skip
//   consent:<scholarshipId>:<yes|no>
//   remind:<scholarshipId>:<yes|no>
//
// scholarship_id is TEXT and may itself contain ':', so every parser splits on
// the FIRST and LAST colon only.
// ═══════════════════════════════════════════════════════════════════════════

export type SurveyPostback =
  | { kind: 'answer';  scholarshipId: string; choice: SurveyChoice }
  | { kind: 'amount';  scholarshipId: string; skip: true }
  | { kind: 'consent'; scholarshipId: string; agreed: boolean }
  | { kind: 'remind';  scholarshipId: string; optIn: boolean };

function splitPostback(data: string): { prefix: string; id: string; value: string } | null {
  const first = data.indexOf(':');
  const last  = data.lastIndexOf(':');
  if (first < 0 || last <= first) return null;
  return {
    prefix: data.slice(0, first),
    id:     data.slice(first + 1, last),
    value:  data.slice(last + 1),
  };
}

export function parseSurveyPostback(data: string): SurveyPostback | null {
  const parts = splitPostback(data);
  if (!parts || !parts.id) return null;
  const { prefix, id, value } = parts;

  switch (prefix) {
    case 'survey':
      return (SURVEY_CHOICES as readonly string[]).includes(value)
        ? { kind: 'answer', scholarshipId: id, choice: value as SurveyChoice }
        : null;
    case 'amount':
      return value === 'skip' ? { kind: 'amount', scholarshipId: id, skip: true } : null;
    case 'consent':
      if (value !== 'yes' && value !== 'no') return null;
      return { kind: 'consent', scholarshipId: id, agreed: value === 'yes' };
    case 'remind':
      if (value !== 'yes' && value !== 'no') return null;
      return { kind: 'remind', scholarshipId: id, optIn: value === 'yes' };
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Free-text amount parsing
// ═══════════════════════════════════════════════════════════════════════════

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

/**
 * Pull a THB amount out of a free-text reply.
 * Accepts "50000", "50,000", "50000 บาท", "฿50000", Thai numerals, and
 * decimals. Returns null when the text isn't a plain number — the caller then
 * re-prompts rather than guessing.
 */
export function parseAmountThb(raw: string): number | null {
  if (!raw) return null;

  let s = raw.trim();
  // Normalise Thai numerals to ASCII
  s = s.replace(/[๐-๙]/g, ch => String(THAI_DIGITS.indexOf(ch)));
  // Strip currency words/symbols, thousands separators and whitespace
  s = s.replace(/บาท|thb|baht|฿|,|\s/gi, '');

  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  const n = parseFloat(s);
  if (!isFinite(n) || n < 0 || n > MAX_AMOUNT_THB) return null;
  return Math.round(n * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// Message builders
// ═══════════════════════════════════════════════════════════════════════════

function postbackItem(label: string, data: string): LineQuickReplyAction {
  return { type: 'action', action: { type: 'postback', label, data, displayText: label } };
}

/** Message 1 — the outcome question with its four quick replies. */
export function buildSurveyMessage(
  scholarshipName: string,
  scholarshipId: string,
  incentiveNote?: string,
): LineTextMessage {
  const question = COPY.question.replace('{name}', scholarshipName);
  return {
    type: 'text',
    text: incentiveNote ? `${question}\n\n${incentiveNote}` : question,
    quickReply: {
      items: SURVEY_CHOICES.map(choice =>
        postbackItem(COPY.choiceLabels[choice], `survey:${scholarshipId}:${choice}`)),
    },
  };
}

/** awarded → "how much?" (free text, or a skip button). */
export function buildAmountQuestion(scholarshipId: string): LineTextMessage {
  return {
    type: 'text',
    text: COPY.amountQuestion,
    quickReply: { items: [postbackItem(COPY.amountSkipLabel, `amount:${scholarshipId}:skip`)] },
  };
}

/** amount → research-consent question. */
export function buildConsentQuestion(scholarshipId: string): LineTextMessage {
  return {
    type: 'text',
    text: COPY.consentQuestion,
    quickReply: {
      items: [
        postbackItem(COPY.consentYesLabel, `consent:${scholarshipId}:yes`),
        postbackItem(COPY.consentNoLabel,  `consent:${scholarshipId}:no`),
      ],
    },
  };
}

/** not_applied → deadline-reminder opt-in. */
export function buildReminderOptInQuestion(scholarshipId: string): LineTextMessage {
  return {
    type: 'text',
    text: COPY.notAppliedQuestion,
    quickReply: {
      items: [
        postbackItem(COPY.remindYesLabel, `remind:${scholarshipId}:yes`),
        postbackItem(COPY.remindNoLabel,  `remind:${scholarshipId}:no`),
      ],
    },
  };
}

export function buildWaitingReply(reaskDays: number): LineTextMessage {
  return { type: 'text', text: COPY.waitingReply.replace('{days}', String(reaskDays)) };
}

export function buildRejectedReply(): LineTextMessage {
  return { type: 'text', text: COPY.rejectedReply };
}

export function buildAmountUnparseableReply(scholarshipId: string): LineTextMessage {
  return {
    type: 'text',
    text: COPY.amountUnparseable,
    quickReply: { items: [postbackItem(COPY.amountSkipLabel, `amount:${scholarshipId}:skip`)] },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Branch routing — what happens after each of the four answers
// ═══════════════════════════════════════════════════════════════════════════

export interface BranchResult {
  /** survey_log.state to move to. */
  nextState: SurveyState;
  /** Messages to reply with. */
  messages: LineTextMessage[];
  /** Set survey_log.reask_after to this ISO date (waiting branch only). */
  reaskAfter?: string;
  /** Update tracked_scholarship.status to this ('not_applied' has no tracked equivalent). */
  trackedStatus?: 'awarded' | 'rejected';
}

/** Decide the reply + next state for one of the four answers. */
export function routeSurveyAnswer(
  choice: SurveyChoice,
  scholarshipId: string,
  opts: { todayStr: string; reaskDays: number },
): BranchResult {
  switch (choice) {
    case 'awarded':
      return { nextState: 'awaiting_amount', messages: [buildAmountQuestion(scholarshipId)], trackedStatus: 'awarded' };

    case 'waiting':
      return {
        nextState: 'awaiting_reask',
        messages: [buildWaitingReply(opts.reaskDays)],
        reaskAfter: addDaysIso(opts.todayStr, opts.reaskDays),
      };

    case 'not_applied':
      return { nextState: 'awaiting_reminder_optin', messages: [buildReminderOptInQuestion(scholarshipId)] };

    case 'rejected':
      return { nextState: 'done', messages: [buildRejectedReply()], trackedStatus: 'rejected' };
  }
}

/** ISO date `days` after `baseDate` (YYYY-MM-DD). */
export function addDaysIso(baseDate: string, days: number): string {
  const d = new Date(baseDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════════════
// Send eligibility — the 30-day guard + per-user rate limit
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Whole days between two ISO timestamps or dates (a − b).
 * A bare YYYY-MM-DD is read as UTC midnight, so date-only comparisons are
 * timezone-stable.
 */
export function daysBetween(aIso: string, bIso: string): number {
  const norm = (v: string) => new Date(v.length === 10 ? `${v}T00:00:00Z` : v).getTime();
  return Math.floor((norm(aIso) - norm(bIso)) / 86_400_000);
}

export function shouldSendSurvey(opts: {
  lineUserId: string | null | undefined;
  reminderOptIn: boolean;
  status: string;
  deadlineDate: string | null;
  todayStr: string;
  offsetDays: number;
  /** Most recent survey_log.sent_at for this (user, scholarship), if any. */
  lastSentAt: string | null;
  /** Surveys already pushed to this user today (this run included). */
  sentToUserToday: number;
  maxPerUserPerDay: number;
  /** True when an outcome conversation for this pair is still open. */
  hasOpenSurvey: boolean;
  /** Admin manual trigger — bypasses the schedule and the 30-day guard. */
  force?: boolean;
}): { send: boolean; reason: string } {
  const {
    lineUserId, reminderOptIn, status, deadlineDate, todayStr, offsetDays,
    lastSentAt, sentToUserToday, maxPerUserPerDay, hasOpenSurvey, force,
  } = opts;

  // These hold even for a forced admin send — we cannot push without a LINE id.
  if (!lineUserId) return { send: false, reason: 'no-line-id' };
  if (hasOpenSurvey && !force) return { send: false, reason: 'conversation-open' };

  if (force) return { send: true, reason: 'forced' };

  if (!reminderOptIn) return { send: false, reason: 'opt-out' };
  if (!['applying', 'applied'].includes(status)) return { send: false, reason: `status-${status}` };
  if (!deadlineDate) return { send: false, reason: 'no-deadline' };
  if (sentToUserToday >= maxPerUserPerDay) return { send: false, reason: 'rate-limited' };

  // 30-day duplicate guard: never re-ask the same pair inside the window.
  // Compared as calendar dates, so the result doesn't drift with the hour the
  // cron happened to run (a send 30 days ago at 08:00 is 30 days, not 29.7).
  if (lastSentAt && daysBetween(todayStr, lastSentAt.slice(0, 10)) < MIN_RESURVEY_GAP_DAYS) {
    return { send: false, reason: 'asked-recently' };
  }

  if (addDaysIso(deadlineDate, offsetDays) !== todayStr) {
    return { send: false, reason: 'date-mismatch' };
  }

  return { send: true, reason: 'ok' };
}

/** Is an 'awaiting_reask' row due today? */
export function isReaskDue(reaskAfter: string | null, todayStr: string): boolean {
  return !!reaskAfter && reaskAfter <= todayStr;
}

// ═══════════════════════════════════════════════════════════════════════════
// Sender
// ═══════════════════════════════════════════════════════════════════════════

/** Minimal structural type for the Supabase client bits we use here. */
type Db = { from: (table: string) => any };

/**
 * Push Message 1 to a student and record the send in survey_log.
 *
 * Closes any stale open conversation for the pair first, so the partial unique
 * index on survey_log never rejects the new row.
 */
export async function sendOutcomeSurvey(
  lineUserId: string,
  application: SurveyApplication,
  db: Db,
  opts: {
    triggerSource?: 'cron' | 'admin';
    attemptNo?: number;
    incentiveNote?: string;
  } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const { triggerSource = 'cron', attemptNo = 1, incentiveNote } = opts;
  const name = application.scholarship_name ?? application.scholarship_id;

  // Retire any open row for this pair — a fresh ask supersedes it.
  await db
    .from('survey_log')
    .update({ state: 'skipped' })
    .eq('user_id', application.user_id)
    .eq('scholarship_id', application.scholarship_id)
    .in('state', OPEN_SURVEY_STATES);

  await linePush(lineUserId, [
    buildSurveyMessage(name, application.scholarship_id, incentiveNote),
  ]);

  const { error } = await db.from('survey_log').insert({
    user_id:        application.user_id,
    scholarship_id: application.scholarship_id,
    state:          'sent',
    attempt_no:     Math.min(Math.max(attemptNo, 1), 6),
    trigger_source: triggerSource,
  });

  if (error) {
    console.error('[survey] survey_log insert failed:', error);
    return { ok: false, reason: 'log-insert-failed' };
  }

  // Seed the outcome row so the dashboard shows "asked, no answer yet".
  // onConflict ignoreDuplicates keeps an existing answer intact.
  await db.from('outcomes').upsert(
    {
      user_id:          application.user_id,
      scholarship_id:   application.scholarship_id,
      scholarship_name: application.scholarship_name,
      status:           'unknown',
      source:           triggerSource === 'admin' ? 'admin' : 'line',
    },
    { onConflict: 'user_id,scholarship_id', ignoreDuplicates: true },
  );

  return { ok: true };
}
