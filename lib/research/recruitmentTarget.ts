/**
 * Recruitment target and readout shapes.
 *
 * Separate from app/api/admin/recruitment/route.ts because a Next.js route file
 * may only export route handlers and a fixed set of config fields — exporting
 * a constant from one fails the build (though not `tsc --noEmit`, which does
 * not know the App Router's rules).
 *
 * Keeping it here also means the target has one definition shared by the API,
 * the dashboard and the tests, rather than three that can drift.
 */

/**
 * PREREG §7.2: 294 completed profiles per arm inside the target population
 * (region_group 'northeast' AND income_bracket <= 3), i.e. 588 in total.
 *
 * Derived from a pooled two-proportion calculation at p1 = 0.20, MDE = 10pp,
 * alpha = 0.05, power = 0.80, which gives 293.15 and rounds up.
 *
 * The target is defined on the ARM, aggregated across income brackets 1–3 —
 * not per crosstab cell. A per-cell target would invent a commitment the
 * pre-registration never made.
 */
export const TARGET_PER_ARM = 294;

export interface RecruitmentCell {
  region_group: string | null;
  income_bracket: number | null;
  ranking_variant: string | null;
  recruitment_source: string | null;
  is_target_population: boolean | null;
  enrolled: number;
}

export interface RecruitmentProgress {
  /** Progress against the pre-registered target, target population only. */
  targetPopulation: {
    baseline: number;
    fairness_adjusted: number;
    targetPerArm: number;
    percentComplete: number;
  };
  /** Full crosstab, counts only — no outcome column exists to add. */
  cells: RecruitmentCell[];
  /** How people were reached. Independent of who they are (PREREG §5.4). */
  byRecruitmentSource: Record<string, number>;
  /** Everyone randomized, target population or not. */
  totalRandomized: number;
}
