/**
 * Question wording versions for the research questions the profile wizard asks.
 *
 * A question's version must change whenever its WORDING does, or answers given
 * to different questions get pooled as if they were one variable (PART 2 step 3).
 * The version is stored with each answer (profiles.prior_knowledge_question_version),
 * so this file is the single place a version, its wording and its dates live.
 */

export interface QuestionWording {
  th: string;
  en: string;
  /** First date the wording was live, as far as the repository can show. */
  introduced: string;
  /** Date it was replaced, or null while it is the live wording. */
  retired: string | null;
}

/** `prior_scholarship_knowledge` / `prior_knowledge_unsure`. */
export const PRIOR_KNOWLEDGE_QUESTION_VERSION = 'v2' as const;

export const PRIOR_KNOWLEDGE_QUESTION_HISTORY: Record<'v1' | 'v2', QuestionWording> = {
  v1: {
    th: 'ก่อนใช้ทุนดี คุณรู้จักทุนการศึกษากี่ทุน?',
    en: 'Before TunDee, how many scholarships did you know?',
    introduced: '2026-07-22',
    retired: '2026-10-27',
  },
  v2: {
    th: 'ก่อนรู้จัก TunDee คุณรู้จักทุนที่ตัวเองมีสิทธิ์สมัครกี่ทุน?',
    en: 'Before you knew TunDee, how many scholarships that you were eligible for did you know about?',
    introduced: '2026-10-27',
    retired: null,
  },
};
