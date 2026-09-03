/**
 * The onboarding wizard's answers, and the one validator that guards them.
 *
 * Before this file the wizard accumulated nine steps in React state and posted
 * them straight at PostgREST. Nothing between the radio button and the database
 * knew what the database would accept, so an option the CHECK constraint
 * rejected was discovered eight minutes later, at 100%, as a raw Postgres error.
 *
 * So: every domain lives here, and three callers share it —
 *
 *   the wizard        validates a field the moment it is chosen (STEP 4.3)
 *   /api/profile/setup validates again server-side, never trusting the client
 *   the E2E test      walks all nine steps through this same code
 *
 * A value that passes validateSetupAnswers() is a value the database accepts.
 * That is the invariant; __tests__/profileSetup.e2e.test.ts proves it against
 * the real constraint.
 */

import {
  GRADE_LEVEL_VALUES, canonicalizeGradeLevel, coherentGradeYear,
} from '@/lib/profile/gradeLevels';
import { PROVINCES_TH } from '@/lib/translations';

/** profiles.income_bracket CHECK: BETWEEN 1 AND 7. */
export const INCOME_BRACKET_MIN = 1;
export const INCOME_BRACKET_MAX = 7;

/** profiles.gpa CHECK: BETWEEN 0 AND 4. */
export const GPA_MIN = 0;
export const GPA_MAX = 4;

/** The wizard's step 8 answer. profiles.heard_about_us has no CHECK; we hold one anyway. */
export const HEARD_ABOUT_US_VALUES = [
  'school_teacher', 'friend_referral', 'google_search', 'social_media', 'unknown',
] as const;

/** profiles_signup_cohort_check. Derived, never chosen — '' is rejected by the constraint. */
export const SIGNUP_COHORT_VALUES = [
  'wave_1_bangkok', 'wave_2_northeast', 'wave_2_north', 'wave_3_national',
] as const;

/** prior_scholarship_knowledge: the numeric proxies behind the four choices. */
export const PRIOR_KNOWLEDGE_VALUES = [0, 2, 6, 15] as const;

export interface SetupAnswers {
  displayName: string;
  gradeLevel: string;
  /**
   * Year inside gradeLevel's range — 1–3 for M1-M3, 4–6 for M4-M6. null when
   * not applicable (any other level) or not yet answered.
   *
   * Coherence with gradeLevel is enforced at write time in
   * buildProfilePayload, not by a database CHECK — see
   * scripts/20260903_v21_grade_year.sql for why a cross-column constraint was
   * rejected: it would refuse the whole write the moment a student changes
   * ม.6 → ม.2 and a stale year comes along for the ride, which is the same
   * failure shape profiles_grade_level_check produced for weeks.
   */
  gradeYear: number | null;
  gpa: string;
  province: string;
  incomeBracket: number;
  welfareCard: boolean;
  fields: string[];
  priorKnowledge: number | null;
  heardAboutUs: string;
  consentTerms: boolean;
  researchOptIn: boolean;
  guardianAcknowledged: boolean;
  acquisitionSource: string;
}

/** Every field the validator can reject, so callers can point at the right one. */
export type SetupField =
  | 'gradeLevel' | 'gradeYear' | 'gpa' | 'province' | 'incomeBracket'
  | 'heardAboutUs' | 'priorKnowledge' | 'consentTerms';

/** A rejection, as a stable code. Copy lives with the UI, not in the validator. */
export type SetupErrorCode =
  | 'grade_level_invalid' | 'grade_level_required'
  | 'grade_year_invalid'
  | 'gpa_out_of_range' | 'gpa_not_a_number'
  | 'province_unknown' | 'province_required'
  | 'income_out_of_range'
  | 'heard_about_us_invalid'
  | 'prior_knowledge_invalid'
  | 'consent_required';

const VALID_PROVINCES = new Set<string>(PROVINCES_TH);

/**
 * Validates ONE field, for use at the moment the student answers it.
 *
 * Returns null when the value is acceptable, including when it is simply not
 * answered yet — "required" is enforced by validateSetupAnswers at submit, not
 * by shouting at someone who has not reached the field. The exception is
 * gradeLevel: an out-of-domain grade is the bug this whole change exists to
 * make impossible, so it is caught the instant it is chosen.
 */
export function validateField(field: SetupField, value: unknown): SetupErrorCode | null {
  switch (field) {
    case 'gradeLevel': {
      if (value === '' || value == null) return null;
      return GRADE_LEVEL_VALUES.includes(String(value)) ? null : 'grade_level_invalid';
    }
    case 'gradeYear': {
      // Not required at this level — a student who has not reached the year
      // question yet, or whose level has none (profiles_grade_year_check
      // admits 1-6), sends null. Coherence with the CHOSEN level (a year
      // outside its range) is checked at write time in buildProfilePayload,
      // not here: the wizard only ever offers the years gradeYearsFor(level)
      // returns, so an incoherent pairing cannot come from the UI — only from
      // a stale field the student's own later change should silently correct,
      // not reject.
      if (value == null || value === '') return null;
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 && n <= 6 ? null : 'grade_year_invalid';
    }
    case 'gpa': {
      const raw = String(value ?? '').trim();
      if (!raw) return null;                       // GPA is optional throughout
      const n = Number(raw);
      if (!Number.isFinite(n)) return 'gpa_not_a_number';
      return n >= GPA_MIN && n <= GPA_MAX ? null : 'gpa_out_of_range';
    }
    case 'province': {
      const raw = String(value ?? '').trim();
      if (!raw) return null;
      return VALID_PROVINCES.has(raw) ? null : 'province_unknown';
    }
    case 'incomeBracket': {
      const n = Number(value);
      if (!Number.isInteger(n)) return 'income_out_of_range';
      return n >= INCOME_BRACKET_MIN && n <= INCOME_BRACKET_MAX ? null : 'income_out_of_range';
    }
    case 'heardAboutUs': {
      const raw = String(value ?? '').trim();
      if (!raw) return null;
      return (HEARD_ABOUT_US_VALUES as readonly string[]).includes(raw)
        ? null : 'heard_about_us_invalid';
    }
    case 'priorKnowledge': {
      if (value == null) return null;
      const n = Number(value);
      return Number.isInteger(n) && n >= 0 ? null : 'prior_knowledge_invalid';
    }
    case 'consentTerms':
      return value === true ? null : 'consent_required';
  }
}

export type SetupErrors = Partial<Record<SetupField, SetupErrorCode>>;

/**
 * Validates the complete set, as the wizard submits it and as the API receives it.
 *
 * Consent is the only thing required at submit — it is the legal basis for the
 * whole row (PDPA).
 *
 * Grade level is deliberately NOT required, even though the matcher wants it
 * badly: profiles.grade_level is nullable, the step has always had a "ข้ามก่อน"
 * link, and 25 students have taken it. Making it mandatory now would turn a
 * skipped question into a refusal at 100% — the precise failure this change
 * exists to abolish. Whether to require it is a flow decision, made with the
 * step-triage list, not smuggled in with a constraint fix. What IS enforced is
 * that a grade the student did give must be one the database will accept.
 */
export function validateSetupAnswers(answers: Partial<SetupAnswers>): SetupErrors {
  const errors: SetupErrors = {};
  const put = (f: SetupField, code: SetupErrorCode | null) => { if (code) errors[f] = code; };

  put('gradeLevel',     validateField('gradeLevel', answers.gradeLevel));
  put('gradeYear',      validateField('gradeYear', answers.gradeYear));
  put('gpa',            validateField('gpa', answers.gpa));
  put('province',       validateField('province', answers.province));
  put('incomeBracket',  validateField('incomeBracket', answers.incomeBracket));
  put('heardAboutUs',   validateField('heardAboutUs', answers.heardAboutUs));
  put('priorKnowledge', validateField('priorKnowledge', answers.priorKnowledge));
  put('consentTerms',   validateField('consentTerms', answers.consentTerms));

  return errors;
}

export function hasErrors(errors: SetupErrors): boolean {
  return Object.keys(errors).length > 0;
}

// ─── Signup cohort ───────────────────────────────────────────────────────────

const NORTHEAST_PROVINCE_NAMES = [
  'นครราชสีมา','ขอนแก่น','อุดรธานี','อุบลราชธานี','นครพนม','บึงกาฬ',
  'หนองคาย','หนองบัวลำภู','เลย','ชัยภูมิ','กาฬสินธุ์','มหาสารคาม',
  'ร้อยเอ็ด','ยโสธร','ศรีสะเกษ','อำนาจเจริญ','มุกดาหาร','สุรินทร์',
  'บุรีรัมย์','สกลนคร',
];

const NORTH_PROVINCE_NAMES = [
  'เชียงใหม่','เชียงราย','แม่ฮ่องสอน','ลำปาง','ลำพูน','พะเยา',
  'แพร่','น่าน','พิษณุโลก','สุโขทัย','ตาก','อุตรดิตถ์',
  'กำแพงเพชร','พิจิตร','เพชรบูรณ์','นครสวรรค์','อุทัยธานี',
];

/**
 * Rollout wave from a Thai province name or a TH-XX code.
 *
 * Moved out of the wizard component so the API route derives the same value the
 * client would have. Its output feeds profiles_signup_cohort_check, which
 * rejects '' — so an unrecognised province must return a real wave, never a
 * blank. 'wave_3_national' is that fallback.
 */
export function determineSignupCohort(provinceId: string): typeof SIGNUP_COHORT_VALUES[number] {
  const v = provinceId.trim();

  if (v === 'TH-10' || v === 'กรุงเทพมหานคร') return 'wave_1_bangkok';

  const codeMatch = v.match(/^TH-(\d+)$/);
  if (codeMatch) {
    const n = parseInt(codeMatch[1], 10);
    if (n >= 30 && n <= 49) return 'wave_2_northeast';
    if (n >= 50 && n <= 58) return 'wave_2_north';
    return 'wave_3_national';
  }

  if (NORTHEAST_PROVINCE_NAMES.includes(v)) return 'wave_2_northeast';
  if (NORTH_PROVINCE_NAMES.includes(v)) return 'wave_2_north';

  return 'wave_3_national';
}

// ─── Payload ─────────────────────────────────────────────────────────────────

/**
 * Drops undefined keys so an upsert never overwrites a stored value with null.
 *
 * /auth/callback writes grade_level, province, gpa and consent for anyone
 * arriving from the /start preview. Sending an empty wizard field as null would
 * wipe exactly the answers that made onboarding skippable.
 */
function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * The row written to `profiles`, built identically on both sides of the wire.
 *
 * `partial` is what makes STEP 4.1 possible: the wizard calls this after every
 * step with only the answers given so far, so a failure at step 9 cannot destroy
 * steps 1–8 — they are already rows in the database. At submit it is called once
 * more with everything.
 */
export function buildProfilePayload(
  userId: string,
  answers: Partial<SetupAnswers>,
  opts: { consentVersion: string; now?: string } = { consentVersion: '' },
): Record<string, unknown> {
  const now = opts.now ?? new Date().toISOString();
  const gpaRaw = String(answers.gpa ?? '').trim();
  const gpaNum = gpaRaw ? Number(gpaRaw) : null;
  const province = String(answers.province ?? '').trim();
  // A stale tab may still hold 'M6' from the retired vocabulary; upgrade rather
  // than reject, so a student who started before the deploy still lands.
  const grade = canonicalizeGradeLevel(answers.gradeLevel);

  /*
   * Written whenever grade_level is written, never left to drift.
   *
   * coherentGradeYear returns null for a year outside the level's range or a
   * level with no years at all — exactly the shape a stale value takes after a
   * student changes level without having re-answered the year yet (ม.6 → ม.2
   * leaves grade_year=6 in React state until this runs). Writing that null is
   * what clears it; leaving the key out would let the stale year sit in the
   * database, coherent with nothing.
   *
   * Only computed when grade is non-null, matching grade_level's own
   * undefined-when-blank behaviour below: a call that has not reached the
   * grade-level step yet must not touch either column.
   */
  const gradeYear = grade !== null ? coherentGradeYear(grade, answers.gradeYear) : undefined;

  return compact({
    id:                          userId,
    display_name:                String(answers.displayName ?? '').trim() || undefined,
    grade_level:                 grade ?? undefined,
    grade_year:                  gradeYear,
    province:                    province || undefined,
    gpa:                         Number.isFinite(gpaNum as number) ? gpaNum ?? undefined : undefined,
    income_bracket:              answers.incomeBracket,
    welfare_card:                answers.welfareCard,
    fields_of_interest:          answers.fields && answers.fields.length > 0 ? answers.fields : undefined,
    prior_scholarship_knowledge: answers.priorKnowledge ?? undefined,
    // v16 renamed this. The pre-registered recruitment_source (§5.4) is a
    // different variable, derived from utm_campaign server-side; writing a
    // self-report slug there violates its CHECK, by design.
    heard_about_us:              answers.heardAboutUs || undefined,
    signup_cohort:               province ? determineSignupCohort(province) : undefined,
    // Consent may already be recorded from /auth — never downgrade it to null.
    consent_version:             answers.consentTerms ? opts.consentVersion : undefined,
    consent_at:                  answers.consentTerms ? now : undefined,
    research_opt_in:             answers.researchOptIn,
    guardian_acknowledged:       answers.guardianAcknowledged,
    acquisition_source:          answers.acquisitionSource || undefined,
    updated_at:                  now,
  });
}
