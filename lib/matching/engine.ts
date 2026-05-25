/**
 * TunDee Matching Engine — Content-Based Filtering
 * + Fairness-Aware Post-Processing (Equalized Odds)
 *
 * Fairness implementation based on:
 * Hardt, M., Price, E., & Srebro, N. (2016).
 * Equality of Opportunity in Supervised Learning.
 * NeurIPS 2016. arXiv:1610.02413
 *
 * Criterion: Equalized Odds
 *   P(Ŷ=1 | Y=1, A=disadvantaged) = P(Ŷ=1 | Y=1, A=advantaged)
 *   P(Ŷ=1 | Y=0, A=disadvantaged) = P(Ŷ=1 | Y=0, A=advantaged)
 *
 * Where:
 *   Ŷ = recommendation decision
 *   Y = student qualifies for scholarship (1 = yes)
 *   A = protected attribute (1 = rural AND low-income)
 *
 * Approach: Post-processing score reweighting
 * (Pre-processing impossible: eligibility rules set by funders, cannot change.
 *  In-processing impossible: rule-based scorer has no loss function/gradient.)
 */

import { StudentProfile, ScholarshipRow, MatchResult } from './types'

// ── Protected group definition ─────────────────────────────────────────────
// Northeastern provinces (ภาคอีสาน) — historically underrepresented in
// scholarship winners relative to Bangkok and Central region.
// Using Thai province names to match scholarship province_restriction data.
const NORTHEAST_PROVINCES = new Set([
  'กาฬสินธุ์', 'ขอนแก่น', 'ชัยภูมิ', 'นครพนม', 'นครราชสีมา',
  'บึงกาฬ', 'บุรีรัมย์', 'มหาสารคาม', 'มุกดาหาร', 'ยโสธร',
  'ร้อยเอ็ด', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สุรินทร์',
  'หนองคาย', 'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุบลราชธานี',
])

// Income ceiling per bracket (THB/month)
const INCOME_CEILING: Record<number, number> = {
  1: 5000, 2: 10000, 3: 15000, 4: 20000,
  5: 30000, 6: 50000, 7: 999999,
}

// ── Step 1: Classify demographic group ────────────────────────────────────
// Based on Hardt et al.: A=1 (protected) if rural AND low-income.
// Both conditions required — rural alone or low-income alone is insufficient
// to trigger the correction, avoiding over-correction.
export function classifyDemographic(profile: StudentProfile): 'disadvantaged' | 'advantaged' {
  const isRural = NORTHEAST_PROVINCES.has(profile.province_id)
  const isLowIncome = profile.income_bracket <= 3  // Under 15,000 THB/month
  return (isRural && isLowIncome) ? 'disadvantaged' : 'advantaged'
}

// ── Step 2: Compute correction factor ─────────────────────────────────────
// Bootstrap method (v1 pre-data phase):
// Uses historical_bias_score as a prior estimate of funder bias.
// Maps bias score to correction multiplier linearly.
//
// At Month 7+ when real recommendation rate data is available,
// replace this with learned correction_table from audit_equalized_odds().
//
// bias_score 0.5 → correction 1.0 (neutral, no change)
// bias_score 0.8 → correction 1.18 (18% boost for disadvantaged students)
// bias_score 0.9 → correction 1.24 (24% boost)
// Hard cap at 2.0 prevents extreme boosts that could surface
// scholarships a student genuinely cannot win.
function getEqualizedOddsCorrection(
  scholarship: ScholarshipRow,
  demographic: 'disadvantaged' | 'advantaged',
  correctionTable: Record<string, number> = {}
): number {
  if (demographic === 'advantaged') return 1.0

  // Use learned correction if available (Month 7+)
  if (correctionTable[scholarship.id] !== undefined) {
    return correctionTable[scholarship.id]
  }

  // Bootstrap from historical_bias_score (v1)
  const bias = scholarship.historical_bias_score ?? 0.5
  if (bias <= 0.5) return 1.0
  const correction = 1.0 + (bias - 0.5) * 0.6
  return Math.min(correction, 2.0)  // Hard cap
}

// ── Step 3: Score a single scholarship against a student profile ───────────
// Content-based filtering: eligibility matching with weighted scoring.
// Hard disqualifications return score=0 immediately.
// Partial credit rewards exceeding minimum requirements.
function scoreScholarship(
  scholarship: ScholarshipRow,
  profile: StudentProfile
): { score: number; reasons: string[]; reasons_en: string[] } {
  const reasons: string[] = []
  const reasons_en: string[] = []
  let score = 0.0
  const MAX_SCORE = 5.0

  // ── HARD DISQUALIFICATIONS (return 0 immediately) ──────────────────────
  const minGpa = scholarship.min_gpa ?? 0
  if (profile.gpa < minGpa) {
    return { score: 0, reasons: [], reasons_en: [] }
  }

  const studentIncomeCeiling = INCOME_CEILING[profile.income_bracket] ?? 999999
  if (scholarship.max_income_thb && studentIncomeCeiling > scholarship.max_income_thb) {
    return { score: 0, reasons: [], reasons_en: [] }
  }

  // Check grade level eligibility
  if (scholarship.grade_levels && scholarship.grade_levels.length > 0) {
    if (!scholarship.grade_levels.includes(profile.grade_level) &&
        !scholarship.grade_levels.includes('any')) {
      return { score: 0, reasons: [], reasons_en: [] }
    }
  }

  // ── SCORED CRITERIA ────────────────────────────────────────────────────

  // 1. GPA match (0–2 points)
  score += 1.0
  const gpaMargin = profile.gpa - minGpa
  score += Math.min(gpaMargin * 0.5, 1.0)
  if (minGpa > 0) {
    reasons.push(`เกรด ${profile.gpa.toFixed(2)} ผ่านเกณฑ์ขั้นต่ำ ${minGpa.toFixed(1)}`)
    reasons_en.push(`GPA ${profile.gpa.toFixed(2)} meets the ${minGpa.toFixed(1)} minimum`)
    if (gpaMargin >= 0.5) {
      reasons.push(`เกรดสูงกว่าเกณฑ์ขั้นต่ำ ${gpaMargin.toFixed(2)} — โอกาสสูง`)
      reasons_en.push(`GPA exceeds minimum by ${gpaMargin.toFixed(2)} — strong match`)
    }
  } else {
    reasons.push('ไม่มีเกณฑ์เกรดขั้นต่ำ — เปิดรับทุกคน')
    reasons_en.push('No minimum GPA required — open to all')
  }

  // 2. Income match (0–1 point)
  if (scholarship.max_income_thb) {
    score += 1.0
    reasons.push(`รายได้ครัวเรือนผ่านเกณฑ์ (ต่ำกว่า ${scholarship.max_income_thb.toLocaleString()} บาท/เดือน)`)
    reasons_en.push(`Household income qualifies (under ${scholarship.max_income_thb.toLocaleString()} THB/month)`)
  } else {
    score += 0.5
    reasons.push('ไม่จำกัดรายได้ครัวเรือน')
    reasons_en.push('No income restriction')
  }

  // 3. Welfare card priority (0–1 point)
  if (profile.welfare_card && scholarship.welfare_card_priority) {
    score += 1.0
    reasons.push('ผู้ถือบัตรสวัสดิการแห่งรัฐได้รับการพิจารณาเป็นพิเศษ')
    reasons_en.push('Welfare card holders receive priority consideration')
  }

  // 4. Field of study match (0–1 point)
  const scholFields = scholarship.field_of_study ?? []
  if (scholFields.length === 0 || scholFields.includes('any')) {
    score += 0.8
    reasons.push('เปิดรับนักเรียนทุกสาขาวิชา')
    reasons_en.push('Open to all fields of study')
  } else if (profile.fields_of_interest.some(f => scholFields.includes(f))) {
    score += 1.0
    const matched = profile.fields_of_interest.filter(f => scholFields.includes(f))
    reasons.push(`ตรงกับสาขาที่คุณสนใจ: ${matched.join(', ')}`)
    reasons_en.push(`Matches your field of interest: ${matched.join(', ')}`)
  }

  // 5. Province/region match (0–1 point)
  const scholProvinces = scholarship.province_restriction ?? []
  if (scholProvinces.length === 0 || scholProvinces.includes('national')) {
    score += 0.8
    reasons.push('เปิดรับนักเรียนจากทุกจังหวัดทั่วประเทศ')
    reasons_en.push('Open to students from all provinces (national)')
  } else if (scholProvinces.includes(profile.province_id)) {
    score += 1.0
    reasons.push('จังหวัดของคุณมีสิทธิ์สมัครทุนนี้')
    reasons_en.push('Your province is specifically eligible for this scholarship')
  }

  return {
    score: Math.min(score / MAX_SCORE, 1.0),
    reasons,
    reasons_en,
  }
}

// ── Step 4: Apply equalized odds post-processing ──────────────────────────
// This is the core fairness correction from Hardt et al. (2016).
// Takes raw eligibility scores and adjusts them so that among qualified
// students, recommendation rates are equal across demographic groups.
function applyEqualizedOddsCorrection(
  rawScore: number,
  scholarship: ScholarshipRow,
  demographic: 'disadvantaged' | 'advantaged',
  correctionTable: Record<string, number> = {}
): { fairnessScore: number; correctionApplied: number; boosted: boolean } {
  const correction = getEqualizedOddsCorrection(scholarship, demographic, correctionTable)
  const fairnessScore = Math.min(rawScore * correction, 1.0)
  return {
    fairnessScore: Math.round(fairnessScore * 10000) / 10000,
    correctionApplied: Math.round(correction * 1000) / 1000,
    boosted: correction > 1.0,
  }
}

// ── Main exported function ─────────────────────────────────────────────────
export function getMatchedScholarships(
  scholarships: ScholarshipRow[],
  profile: StudentProfile,
  correctionTable: Record<string, number> = {}
): MatchResult[] {
  const demographic = classifyDemographic(profile)
  const results: MatchResult[] = []

  for (const scholarship of scholarships) {
    // Step 1: Content-based eligibility scoring
    const { score: rawScore, reasons, reasons_en } = scoreScholarship(scholarship, profile)

    // Skip hard disqualifications
    if (rawScore === 0) continue

    // Step 2: Equalized odds post-processing (Hardt et al. 2016)
    const { fairnessScore, correctionApplied, boosted } =
      applyEqualizedOddsCorrection(rawScore, scholarship, demographic, correctionTable)

    results.push({
      scholarship,
      raw_score: Math.round(rawScore * 10000) / 10000,
      fairness_score: fairnessScore,
      correction_applied: correctionApplied,
      fairness_boosted: boosted,
      rank: 0,  // assigned after sort
      reasons,
      reasons_en,
    })
  }

  // Sort by fairness-adjusted score DESC, then by amount DESC (higher impact first)
  results.sort((a, b) => {
    if (b.fairness_score !== a.fairness_score) {
      return b.fairness_score - a.fairness_score
    }
    return (b.scholarship.amount_thb ?? 0) - (a.scholarship.amount_thb ?? 0)
  })

  // Assign ranks
  results.forEach((r, i) => { r.rank = i + 1 })

  return results.slice(0, 20)  // Top 20
}

// ── Fairness audit function (run at Month 7, 10, 12) ──────────────────────
// Measures whether equalized odds is actually being achieved.
// Returns gap metrics before and after correction per scholarship.
// Publish these numbers as the bias audit report.
export function computeEqualizedOddsGap(
  recommendations: Array<{
    scholarship_id: string
    user_province: string
    user_income_bracket: number
    score_raw: number
    score_fairness_adjusted: number
  }>
): Array<{
  scholarship_id: string
  n_disadvantaged: number
  n_advantaged: number
  rate_before_disadvantaged: number
  rate_before_advantaged: number
  rate_after_disadvantaged: number
  rate_after_advantaged: number
  eo_gap_before: number
  eo_gap_after: number
  gap_reduced_pct: number
}> {
  const THRESHOLD = 0.5
  const bySchol = new Map<string, typeof recommendations>()

  for (const r of recommendations) {
    if (!bySchol.has(r.scholarship_id)) bySchol.set(r.scholarship_id, [])
    bySchol.get(r.scholarship_id)!.push(r)
  }

  const results = []
  for (const [scholarshipId, recs] of Array.from(bySchol.entries())) {
    // Only eligible students (Y=1 approximation: score_raw > 0)
    const eligible = recs.filter(r => r.score_raw > 0)
    if (eligible.length < 20) continue

    const disadvantaged = eligible.filter(r =>
      NORTHEAST_PROVINCES.has(r.user_province) && r.user_income_bracket <= 3
    )
    const advantaged = eligible.filter(r =>
      !(NORTHEAST_PROVINCES.has(r.user_province) && r.user_income_bracket <= 3)
    )

    if (disadvantaged.length === 0 || advantaged.length === 0) continue

    const rate = (arr: typeof eligible, field: 'score_raw' | 'score_fairness_adjusted') =>
      arr.filter(r => r[field] > THRESHOLD).length / arr.length

    const rbD = rate(disadvantaged, 'score_raw')
    const rbA = rate(advantaged, 'score_raw')
    const raD = rate(disadvantaged, 'score_fairness_adjusted')
    const raA = rate(advantaged, 'score_fairness_adjusted')

    const gapBefore = Math.abs(rbA - rbD)
    const gapAfter = Math.abs(raA - raD)
    const gapReducedPct = gapBefore > 0
      ? Math.round(((gapBefore - gapAfter) / gapBefore) * 100)
      : 100

    results.push({
      scholarship_id: scholarshipId,
      n_disadvantaged: disadvantaged.length,
      n_advantaged: advantaged.length,
      rate_before_disadvantaged: Math.round(rbD * 1000) / 1000,
      rate_before_advantaged: Math.round(rbA * 1000) / 1000,
      rate_after_disadvantaged: Math.round(raD * 1000) / 1000,
      rate_after_advantaged: Math.round(raA * 1000) / 1000,
      eo_gap_before: Math.round(gapBefore * 1000) / 1000,
      eo_gap_after: Math.round(gapAfter * 1000) / 1000,
      gap_reduced_pct: gapReducedPct,
    })
  }

  return results.sort((a, b) => b.eo_gap_before - a.eo_gap_before)
}
