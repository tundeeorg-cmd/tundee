/**
 * Local draft of the onboarding wizard, and where to resume it.
 *
 * The wizard used to hold nine steps in React state and write once, at the end.
 * When that write failed — as it did for every secondary-school and vocational
 * student until 31 Aug 2026 — nine steps and about eight minutes went with it,
 * and a reload started at step 1.
 *
 * Two independent safety nets now sit under it:
 *
 *   • this draft, in localStorage, written on every answer. It survives a
 *     reload, a crashed tab and a dead connection, and needs no round trip.
 *   • a partial upsert to /api/profile/setup after each step, so the answers are
 *     rows in the database rather than state in a browser.
 *
 * Either one alone would do for most failures. Together, losing an answer takes
 * both a failed request AND a cleared browser.
 */

import type { SetupAnswers } from '@/lib/profile/setupAnswers';

const DRAFT_KEY = 'tundee_setup_draft';

/** Bumped when the shape changes; a draft from an older shape is discarded. */
const DRAFT_VERSION = 1;

interface Draft {
  v: number;
  step: number;
  answers: Partial<SetupAnswers>;
  savedAt: string;
}

export function saveDraft(step: number, answers: Partial<SetupAnswers>): void {
  if (typeof window === 'undefined') return;
  try {
    const draft: Draft = { v: DRAFT_VERSION, step, answers, savedAt: new Date().toISOString() };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode, or a full quota. The server-side partial save is the other
    // net; never let storage break the wizard.
  }
}

export function loadDraft(): { step: number; answers: Partial<SetupAnswers> } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (draft?.v !== DRAFT_VERSION || typeof draft.step !== 'number') return null;
    return { step: draft.step, answers: draft.answers ?? {} };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// ─── Resume ──────────────────────────────────────────────────────────────────

/**
 * Which profiles column each step fills.
 *
 * GPA (step 4) is deliberately absent: it is optional, so an empty gpa is
 * indistinguishable from a declined one, and treating it as unanswered would
 * park returning students on a question they already chose to skip.
 */
const STEP_FIELDS: Array<{ step: number; column: string }> = [
  { step: 0, column: 'consent_version' },
  { step: 1, column: 'display_name' },
  { step: 2, column: 'prior_scholarship_knowledge' },
  { step: 3, column: 'grade_level' },
  { step: 5, column: 'province' },
  { step: 6, column: 'income_bracket' },
  { step: 7, column: 'fields_of_interest' },
  { step: 8, column: 'heard_about_us' },
];

function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) {
    // ['any'] is the default the table was created with, not a choice anyone made.
    const meaningful = value.filter(v => v !== 'any');
    return meaningful.length > 0;
  }
  return true;
}

/**
 * The step a returning student should land on, given their stored profile row.
 *
 * The first question they have not answered — so someone who got to step 7 and
 * lost the save resumes at 7, not at 1. Returns 0 for a student with no row at
 * all, and the last step when everything is answered (they are one click from
 * finishing, which is where a failed final save leaves them).
 */
export function resumeStep(profile: Record<string, unknown> | null | undefined): number {
  if (!profile) return 0;
  for (const { step, column } of STEP_FIELDS) {
    if (!isAnswered(profile[column])) return step;
  }
  return STEP_FIELDS[STEP_FIELDS.length - 1].step;
}

/** Answers recovered from a stored profile row, for prefilling the wizard. */
export function answersFromProfile(profile: Record<string, unknown> | null | undefined): Partial<SetupAnswers> {
  if (!profile) return {};
  const fields = Array.isArray(profile.fields_of_interest)
    ? (profile.fields_of_interest as string[]).filter(f => f !== 'any')
    : [];
  return {
    displayName:          typeof profile.display_name === 'string' ? profile.display_name : undefined,
    gradeLevel:           typeof profile.grade_level === 'string' ? profile.grade_level : undefined,
    gpa:                  profile.gpa == null ? undefined : String(profile.gpa),
    province:             typeof profile.province === 'string' ? profile.province : undefined,
    incomeBracket:        typeof profile.income_bracket === 'number' ? profile.income_bracket : undefined,
    welfareCard:          typeof profile.welfare_card === 'boolean' ? profile.welfare_card : undefined,
    fields:               fields.length > 0 ? fields : undefined,
    priorKnowledge:       typeof profile.prior_scholarship_knowledge === 'number'
                            ? profile.prior_scholarship_knowledge : null,
    heardAboutUs:         typeof profile.heard_about_us === 'string' ? profile.heard_about_us : undefined,
    consentTerms:         typeof profile.consent_version === 'string' && profile.consent_version !== '',
    researchOptIn:        typeof profile.research_opt_in === 'boolean' ? profile.research_opt_in : undefined,
    guardianAcknowledged: typeof profile.guardian_acknowledged === 'boolean'
                            ? profile.guardian_acknowledged : undefined,
  };
}
