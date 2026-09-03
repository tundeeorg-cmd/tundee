/**
 * What the student reads when something goes wrong in the wizard.
 *
 * The rule this file enforces: a database error is never shown to a user. Until
 * 31 Aug 2026 a failed save rendered
 *
 *   [23514] new row for relation "profiles" violates check constraint
 *   "profiles_grade_level_check"
 *
 * verbatim — raw Postgres, in English, on a Thai page, naming our table and our
 * constraint to anyone who reached it. The real error now goes to the server log
 * (app/api/profile/setup/route.ts) and the browser receives a code, which is
 * turned into one short Thai sentence here.
 */

import type { SetupErrorCode, SetupField } from '@/lib/profile/setupAnswers';

export type SaveErrorCode = 'save_failed' | 'network' | 'unauthorized' | 'validation';

interface Copy { th: string; en: string }

/** Field-level: shown next to the answer, the moment it is chosen. */
export const FIELD_MESSAGES: Record<SetupErrorCode, Copy> = {
  grade_level_invalid: {
    th: 'ตัวเลือกนี้ใช้ไม่ได้ กรุณาเลือกใหม่อีกครั้ง',
    en: 'That option is not available. Please choose another.',
  },
  grade_level_required: {
    th: 'กรุณาเลือกระดับชั้นที่กำลังเรียนอยู่',
    en: 'Please choose your current level of study.',
  },
  gpa_out_of_range: {
    th: 'เกรดเฉลี่ยต้องอยู่ระหว่าง 0.00 – 4.00',
    en: 'GPA must be between 0.00 and 4.00.',
  },
  gpa_not_a_number: {
    th: 'กรุณากรอกเกรดเฉลี่ยเป็นตัวเลข เช่น 3.25',
    en: 'Please enter your GPA as a number, e.g. 3.25.',
  },
  province_unknown: {
    th: 'ไม่พบจังหวัดนี้ กรุณาเลือกจากรายการ',
    en: 'That province was not found. Please pick one from the list.',
  },
  province_required: {
    th: 'กรุณาเลือกจังหวัดของคุณ',
    en: 'Please choose your province.',
  },
  income_out_of_range: {
    th: 'กรุณาเลือกช่วงรายได้จากรายการ',
    en: 'Please choose an income range from the list.',
  },
  heard_about_us_invalid: {
    th: 'กรุณาเลือกจากรายการ',
    en: 'Please choose from the list.',
  },
  prior_knowledge_invalid: {
    th: 'กรุณาเลือกจากรายการ',
    en: 'Please choose from the list.',
  },
  consent_required: {
    th: 'กรุณายอมรับเงื่อนไขก่อนดำเนินการต่อ',
    en: 'Please accept the terms before continuing.',
  },
};

/** Save-level: shown with a retry button when the write itself fails. */
export const SAVE_MESSAGES: Record<SaveErrorCode, Copy> = {
  save_failed: {
    // Deliberately says the answers are safe, because they are: every step was
    // already written, and the draft is in localStorage either way.
    th: 'บันทึกไม่สำเร็จ คำตอบของคุณยังอยู่ครบ กรุณาลองอีกครั้ง',
    en: 'We could not save. Your answers are safe — please try again.',
  },
  network: {
    th: 'การเชื่อมต่อมีปัญหา คำตอบของคุณยังอยู่ครบ กรุณาลองอีกครั้ง',
    en: 'Connection problem. Your answers are safe — please try again.',
  },
  unauthorized: {
    th: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
    en: 'Your session expired. Please sign in again.',
  },
  validation: {
    th: 'มีคำตอบบางข้อที่ต้องแก้ไข เราพาคุณกลับไปที่ข้อนั้นแล้ว',
    en: 'One of your answers needs fixing — we have taken you back to it.',
  },
};

export const RETRY_LABEL: Copy = { th: 'ลองอีกครั้ง', en: 'Try again' };

export function fieldMessage(code: SetupErrorCode, lang: string): string {
  return FIELD_MESSAGES[code][lang === 'th' ? 'th' : 'en'];
}

export function saveMessage(code: SaveErrorCode, lang: string): string {
  return SAVE_MESSAGES[code][lang === 'th' ? 'th' : 'en'];
}

/** The step that owns each field, so a rejection can send the student back to it. */
export const FIELD_STEP: Record<SetupField, number> = {
  consentTerms:   0,
  priorKnowledge: 2,
  gradeLevel:     3,
  gpa:            4,
  province:       5,
  incomeBracket:  6,
  heardAboutUs:   8,
};
