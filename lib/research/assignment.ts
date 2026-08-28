/**
 * Randomization for the fairness-ranking trial.
 *
 * Implements §4 and §5 of research/PREREGISTRATION.md (commit 4a3cc5b).
 *
 * SERVER ONLY. RANDOMIZATION_SALT must never reach the browser — a client that
 * can see the salt can compute every user's arm. This module imports
 * node:crypto, so a client bundle importing it fails at build time rather than
 * leaking quietly.
 *
 * Replaces two earlier mechanisms that ran side by side and disagreed:
 *
 *   assignAbArm()        → profiles.ab_arm            parity of the 2nd hex char
 *   getOrAssignVariant() → experiment_assignment      parity of the 8th hex char
 *
 * Those agree ~50% of the time, i.e. at chance. Treatment was driven by the
 * second while every outcome event was labelled with the first, so the recorded
 * arm was uncorrelated with the ranking the user actually saw. Both are
 * superseded here. Neither is back-filled: pilot-era rows keep their history
 * and are excluded from analysis (§5.6, §9.1).
 */

import { createHmac } from 'node:crypto';

/** Stamped on every assignment. Bump only for a genuine algorithm change. */
export const ASSIGNMENT_ALGORITHM_VERSION = 'v2-hmac-stratified-2026-08';

export type RankingVariant = 'baseline' | 'fairness_adjusted';
export type RegionGroup = 'northeast' | 'bangkok_metro' | 'other';
export type RecruitmentSource = 'isaan_2026' | 'bkk_2026' | 'organic';

/**
 * The 20 Isan provinces (PREREG §5.1).
 *
 * Mirrored in two other places that must not drift:
 *   • public.tundee_region_group()  — scripts/20260828_v16_*.sql
 *   • NORTHEAST_PROVINCES           — lib/matching/engine.ts
 */
export const NORTHEAST_PROVINCES: ReadonlySet<string> = new Set([
  'กาฬสินธุ์', 'ขอนแก่น', 'ชัยภูมิ', 'นครพนม', 'นครราชสีมา',
  'บึงกาฬ', 'บุรีรัมย์', 'มหาสารคาม', 'มุกดาหาร', 'ยโสธร',
  'ร้อยเอ็ด', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สุรินทร์',
  'หนองคาย', 'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุบลราชธานี',
]);

/** PREREG §5.1. Bangkok metropolitan region. */
export const BANGKOK_METRO_PROVINCES: ReadonlySet<string> = new Set([
  'กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ',
]);

/**
 * PREREG §5.1 — a property of the USER, from their declared province.
 * Never derived from the ad campaign they arrived through.
 */
export function regionGroup(province: string | null | undefined): RegionGroup | null {
  if (!province) return null;
  if (NORTHEAST_PROVINCES.has(province)) return 'northeast';
  if (BANGKOK_METRO_PROVINCES.has(province)) return 'bangkok_metro';
  return 'other';
}

/**
 * PREREG §5.3. income_bracket <= 3 is declared monthly household income at or
 * below THB 15,000 (INCOME_OPTIONS, app/profile/setup/page.tsx).
 */
export function isTargetPopulation(
  province: string | null | undefined,
  incomeBracket: number | null | undefined,
): boolean {
  if (incomeBracket == null) return false;
  return regionGroup(province) === 'northeast' && incomeBracket <= 3;
}

/**
 * PREREG §5.5 — a property of the person, computed for users in BOTH arms.
 *
 * Identical to classifyDemographic() in lib/matching/engine.ts ('disadvantaged'
 * = rural AND low-income, per Hardt et al.). Eligibility is not treatment:
 * an eligible user in the baseline arm receives an unmodified ranking.
 */
export function computeFairnessEligible(
  province: string | null | undefined,
  incomeBracket: number | null | undefined,
): boolean {
  return isTargetPopulation(province, incomeBracket);
}

/**
 * PREREG §5.4 — how the user was REACHED, from utm_campaign. A closed set:
 * anything unrecognised or absent is 'organic'.
 *
 * Deliberately independent of regionGroup(). A student in Khon Kaen who clicks
 * the Bangkok ad is region_group 'northeast', recruitment_source 'bkk_2026'.
 */
export function recruitmentSourceFrom(
  utmCampaign: string | null | undefined,
): RecruitmentSource {
  if (utmCampaign === 'isaan_2026') return 'isaan_2026';
  if (utmCampaign === 'bkk_2026') return 'bkk_2026';
  return 'organic';
}

/**
 * The stratum a user randomizes within (PREREG §4): region_group × income_bracket.
 * Folding it into the hash input makes each stratum randomize independently,
 * so balance holds within stratum rather than only overall.
 */
export function stratumKey(
  province: string | null | undefined,
  incomeBracket: number | null | undefined,
): string {
  return `${regionGroup(province) ?? 'unknown'}|${incomeBracket ?? 'unknown'}`;
}

/**
 * PREREG §4. Deterministic, salted, stratified 50/50.
 *
 * Deterministic rather than a random draw so assignment is reproducible and
 * auditable from user_id alone, and so a lost assignment row resolves to the
 * same arm rather than silently re-randomizing the user.
 *
 * The salt is fixed before the first assignment and NEVER changed. Changing it
 * re-randomizes every already-assigned user and destroys the correspondence
 * between recorded arms and delivered treatment.
 *
 * @throws if the salt is missing or too short to be a real secret.
 */
export function computeRankingVariant(
  userId: string,
  stratum: string,
  salt: string,
): RankingVariant {
  if (!salt || salt.length < 16) {
    throw new Error(
      'RANDOMIZATION_SALT is missing or shorter than 16 characters. ' +
      'Assignment must not proceed with a weak or absent salt (PREREG §4).',
    );
  }

  // HMAC rather than a bare hash: the salt is a key, not a prefix, so the
  // construction does not leak to length-extension and the arm cannot be
  // computed by anyone without it.
  const mac = createHmac('sha256', salt)
    .update(`${userId}|${stratum}`)
    .digest();

  // Low bit of the first byte. Uniform for a cryptographic MAC.
  return (mac[0] & 1) === 0 ? 'baseline' : 'fairness_adjusted';
}

/** Reads the salt from the environment, failing loudly rather than defaulting. */
export function randomizationSalt(): string {
  const salt = process.env.RANDOMIZATION_SALT;
  if (!salt) {
    throw new Error(
      'RANDOMIZATION_SALT is not set. Randomization cannot proceed without it ' +
      '(PREREG §4). Set it once and never change it.',
    );
  }
  return salt;
}
