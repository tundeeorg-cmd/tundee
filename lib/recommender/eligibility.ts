/**
 * Hard eligibility filter for the TunDee recommender (STEP 1).
 *
 * Every scholarship that fails any hard rule is removed from the candidate set
 * before scoring. Only displayed, open scholarships with deadline ≥ today enter.
 */

import type { TdScholarship } from '@/lib/tdScholarships/types';
import type { RecommenderProfile } from './types';
import { normalizeGradeLevel, normalizeScholarshipLevel, levelsAreCompatible } from './gradeLevel';

// Monthly income ceiling per bracket (THB)
const INCOME_CEILING_MONTHLY: Record<number, number> = {
  1: 5_000,
  2: 10_000,
  3: 15_000,
  4: 20_000,
  5: 30_000,
  6: 50_000,
  7: 999_999,
};

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

/**
 * Returns eligible=true if the scholarship is a valid candidate for this student.
 * Called once per scholarship per recommendation request; must be fast.
 */
export function isEligible(
  s: TdScholarship,
  profile: RecommenderProfile,
  nowDate: Date = new Date(),
): EligibilityResult {

  // 1. Must be displayed (admin-approved and meets display gate)
  if (!s.is_displayed) return { eligible: false, reason: 'not_displayed' };

  // 2. Must have Open status
  if (s.status && s.status !== 'Open') {
    return { eligible: false, reason: `status_${s.status ?? 'unknown'}` };
  }

  // 3. Deadline must not be in the past
  if (s.deadline_date) {
    const deadline = new Date(s.deadline_date);
    if (deadline < nowDate) return { eligible: false, reason: 'past_deadline' };
  }

  // 4. GPA minimum
  if (s.min_gpa != null && profile.gpa < s.min_gpa) {
    return { eligible: false, reason: 'gpa_below_minimum' };
  }

  // 5. Income cap (scholarship stores annual THB; convert profile bracket to annual)
  //
  // An unknown bracket does not disqualify. The old fallback resolved missing
  // income to 999,999/month — the richest bracket there is — so a student who
  // simply had not answered the question was ruled out of the scholarships with
  // an income ceiling. Those are the need-based ones, and the students who leave
  // income blank are disproportionately the ones they exist for.
  //
  // Not knowing is not the same as knowing they earn too much. A cap is
  // something a student can read and check for themselves; a scholarship they
  // were never shown is not.
  if (s.income_cap_thb != null && profile.income_bracket != null) {
    const monthlyBracketCeiling = INCOME_CEILING_MONTHLY[profile.income_bracket];
    // An out-of-range bracket is unknown too, not rich.
    if (monthlyBracketCeiling != null) {
      const annualBracketCeiling = monthlyBracketCeiling * 12;
      // Student is ineligible only when even their bracket's FLOOR exceeds the cap.
      // Conservative: treat the bracket ceiling as the student's income.
      if (annualBracketCeiling > s.income_cap_thb) {
        return { eligible: false, reason: 'income_exceeds_cap' };
      }
    }
  }

  // 6. Level match — both sides go through lib/recommender/gradeLevel.ts so the
  //    values /profile/setup stores ('M4-M6', 'vocational', …) are understood.
  const schBucket = normalizeScholarshipLevel(s.level);
  if (schBucket && schBucket !== 'multiple') {
    const studentBuckets = [
      normalizeGradeLevel(profile.grade_level),
      normalizeGradeLevel(profile.intended_level),
    ];
    if (!levelsAreCompatible(schBucket, studentBuckets)) {
      return { eligible: false, reason: 'level_mismatch' };
    }
  }

  // 7. Field of study — hard mismatch only when scholarship specifies non-"any" fields
  //    and student has declared a specific field that doesn't overlap
  if (s.field_of_study) {
    const schFields = s.field_of_study
      .split(',')
      .map(f => f.trim().toLowerCase())
      .filter(Boolean);

    const isOpenField = schFields.length === 0
      || schFields.some(f => f === 'any' || f === 'all' || f === 'ทุกสาขา' || f === 'ทุกคณะ');

    if (!isOpenField) {
      const studentFields = [
        ...(profile.fields_of_interest ?? []).map(f => f.toLowerCase()),
        ...(profile.intended_field ? [profile.intended_field.toLowerCase()] : []),
      ];

      // Only hard-disqualify if student has declared fields AND none match
      if (studentFields.length > 0 && !studentFields.some(f => f === 'any' || schFields.includes(f))) {
        return { eligible: false, reason: 'field_mismatch' };
      }
    }
  }

  return { eligible: true };
}

/**
 * Filters an array of scholarships to eligible candidates for this profile.
 * Returns the eligible subset; preserves order.
 */
export function filterEligible(
  scholarships: TdScholarship[],
  profile: RecommenderProfile,
  nowDate?: Date,
): TdScholarship[] {
  return scholarships.filter(s => isEligible(s, profile, nowDate).eligible);
}
