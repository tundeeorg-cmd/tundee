/**
 * Content-based scorer for the TunDee recommender (STEP 2).
 *
 * Works from day one with zero training data (cold-start safe).
 * Implements the pluggable Scorer interface so a collaborative-filtering
 * model can be dropped in later without changing the pipeline.
 *
 * Scoring criteria (max 1.0 after normalisation):
 *   GPA margin      0–0.25   — how far above the min GPA
 *   Income fit      0–0.20   — how far below the income cap
 *   Welfare match   0–0.10   — welfare card holder + targets_low_income
 *   Field match     0–0.20   — intended field overlaps scholarship fields
 *   Region match    0–0.15   — scholarship region includes student's region
 *   Amount bonus    0–0.05   — light preference for larger award amounts
 *   Urgency bonus   0–0.05   — scholarships closing sooner rank slightly higher
 *
 * Total max = 1.00 (normalised from a raw 1.0 scale)
 */

import type { TdScholarship } from '@/lib/tdScholarships/types';
import type { RecommenderProfile, Scorer, ScorerResult } from './types';

// Monthly income ceiling per bracket (THB) — duplicated here for scorer independence
const INCOME_CEILING_MONTHLY: Record<number, number> = {
  1: 5_000,
  2: 10_000,
  3: 15_000,
  4: 20_000,
  5: 30_000,
  6: 50_000,
  7: 999_999,
};

// Regions that map to Northeast/South Thailand
const NORTHEAST_PROVINCES = new Set([
  'นครราชสีมา', 'ขอนแก่น', 'อุดรธานี', 'อุบลราชธานี', 'บึงกาฬ', 'เลย', 'หนองคาย',
  'หนองบัวลำภู', 'นครพนม', 'มุกดาหาร', 'สกลนคร', 'กาฬสินธุ์', 'ร้อยเอ็ด', 'มหาสารคาม',
  'ชัยภูมิ', 'บุรีรัมย์', 'สุรินทร์', 'ศรีสะเกษ', 'ยโสธร', 'อำนาจเจริญ',
]);

const SOUTH_PROVINCES = new Set([
  'สงขลา', 'นครศรีธรรมราช', 'สุราษฎร์ธานี', 'ภูเก็ต', 'กระบี่', 'ตรัง', 'พัทลุง',
  'ระนอง', 'ชุมพร', 'พังงา', 'นราธิวาส', 'ปัตตานี', 'ยะลา', 'สตูล',
]);

/** Heuristic bias prior — probability that a national scholarship under-surfaces
 *  disadvantaged students. Updated with real CTR data once collected.
 *  Higher = more likely to need correction (0=no bias, 1=fully biased).
 */
export function computeBiasPrior(s: TdScholarship): number {
  // Scholarships explicitly targeting low-income → already favourable
  if (s.targets_low_income) return 0.3;

  const regionElig = (s.region_eligibility ?? '').toLowerCase();
  const isNational = !regionElig
    || regionElig.includes('national')
    || regionElig.includes('ทั่วประเทศ')
    || regionElig.includes('all');

  // National scholarships from prestigious funders: mild historical bias toward
  // urban/Bangkok students (prep-school advantage in applications)
  if (isNational) return 0.65;

  // Region-restricted scholarships already self-select for a region
  if (regionElig.includes('northeast') || regionElig.includes('อีสาน') || regionElig.includes('ภาคตะวันออกเฉียงเหนือ')) return 0.35;
  if (regionElig.includes('south') || regionElig.includes('ใต้') || regionElig.includes('ภาคใต้')) return 0.40;

  return 0.5; // neutral default for other region-specific scholarships
}

function computeRegionScore(s: TdScholarship, profile: RecommenderProfile): { score: number; reasons: string[]; reasons_en: string[] } {
  const regionElig = (s.region_eligibility ?? '').toLowerCase();
  const reasons: string[] = [];
  const reasons_en: string[] = [];

  if (!regionElig || regionElig.includes('national') || regionElig.includes('ทั่วประเทศ') || regionElig.includes('all')) {
    return { score: 0.07, reasons, reasons_en };  // slight penalty vs targeted; still eligible
  }

  const studentRegion = (profile.region ?? '').toLowerCase();
  const province      = profile.province_id ?? '';
  const isNE = studentRegion === 'northeast' || NORTHEAST_PROVINCES.has(province);
  const isSouth = studentRegion === 'south' || SOUTH_PROVINCES.has(province);

  if (
    (isNE && (regionElig.includes('northeast') || regionElig.includes('อีสาน')))
    || (isSouth && (regionElig.includes('south') || regionElig.includes('ใต้')))
    || regionElig.includes(province.toLowerCase())
    || regionElig.includes(studentRegion)
  ) {
    reasons.push('ภูมิภาคตรงกัน');
    reasons_en.push('Region match');
    return { score: 0.15, reasons, reasons_en };
  }

  return { score: 0.07, reasons, reasons_en };
}

function computeFieldScore(s: TdScholarship, profile: RecommenderProfile): { score: number; reasons: string[]; reasons_en: string[] } {
  const reasons: string[] = [];
  const reasons_en: string[] = [];

  const schFieldsRaw = (s.field_of_study ?? '');
  if (!schFieldsRaw) return { score: 0.10, reasons, reasons_en };  // open = moderate score

  const schFields = schFieldsRaw.split(',').map(f => f.trim().toLowerCase()).filter(Boolean);
  const isOpen = schFields.some(f => f === 'any' || f === 'all' || f === 'ทุกสาขา' || f === 'ทุกคณะ');
  if (isOpen) return { score: 0.10, reasons, reasons_en };

  const studentFields = [
    ...(profile.fields_of_interest ?? []).map(f => f.toLowerCase()),
    ...(profile.intended_field ? [profile.intended_field.toLowerCase()] : []),
  ];

  if (studentFields.length === 0) return { score: 0.07, reasons, reasons_en };

  const exactMatch = studentFields.some(f => schFields.includes(f));
  if (exactMatch) {
    reasons.push('สาขาวิชาตรงกัน');
    reasons_en.push('Field of study match');
    return { score: 0.20, reasons, reasons_en };
  }

  return { score: 0.05, reasons, reasons_en };  // field declared but doesn't match (still eligible — caught in eligibility layer for hard mismatches)
}

function urgencyBonus(s: TdScholarship, nowDate: Date): number {
  if (!s.deadline_date) return 0;
  const daysLeft = (new Date(s.deadline_date).getTime() - nowDate.getTime()) / 86_400_000;
  if (daysLeft < 0) return 0;
  if (daysLeft <= 14) return 0.05;
  if (daysLeft <= 30) return 0.03;
  if (daysLeft <= 60) return 0.01;
  return 0;
}

export class ContentBasedScorer implements Scorer {
  private nowDate: Date;

  constructor(nowDate: Date = new Date()) {
    this.nowDate = nowDate;
  }

  score(s: TdScholarship, profile: RecommenderProfile): ScorerResult | null {
    const reasons: string[]    = [];
    const reasons_en: string[] = [];
    let total = 0;

    // ── GPA margin (0–0.25) ──────────────────────────────────────────────
    const minGpa = s.min_gpa ?? 0;
    const gpaMargin = Math.max(0, profile.gpa - minGpa);
    const gpaScore  = Math.min(gpaMargin / 2.0, 1.0) * 0.25;
    total += gpaScore;
    if (minGpa > 0 && profile.gpa >= minGpa) {
      reasons.push(`GPA ${profile.gpa.toFixed(1)} ≥ ขั้นต่ำ ${minGpa}`);
      reasons_en.push(`GPA ${profile.gpa.toFixed(1)} meets ${minGpa} minimum`);
    }

    // ── Income fit (0–0.20) ──────────────────────────────────────────────
    const incCap = s.income_cap_thb;
    if (incCap) {
      const monthlyBracketCeil = INCOME_CEILING_MONTHLY[profile.income_bracket] ?? 999_999;
      const annualBracketCeil  = monthlyBracketCeil * 12;
      // The more room below the cap, the better the fit
      const headroom    = Math.max(0, incCap - annualBracketCeil);
      const incScore    = Math.min(headroom / 600_000, 1.0) * 0.20;
      total += incScore;
      if (incScore > 0) {
        reasons.push('รายได้ครอบครัวตรงตามเกณฑ์ทุน');
        reasons_en.push('Household income within scholarship limit');
      }
    } else {
      total += 0.10;  // no cap = moderate fit
    }

    // ── Welfare card match (0–0.10) ──────────────────────────────────────
    if (profile.welfare_card && s.targets_low_income) {
      total += 0.10;
      reasons.push('มีบัตรสวัสดิการ + ทุนเพื่อผู้มีรายได้น้อย');
      reasons_en.push('Welfare card holder — scholarship targets low-income students');
    } else if (profile.welfare_card || s.targets_low_income) {
      total += 0.05;
    }

    // ── Field match (0–0.20) ─────────────────────────────────────────────
    const { score: fieldScore, reasons: fR, reasons_en: fRen } = computeFieldScore(s, profile);
    total += fieldScore;
    reasons.push(...fR); reasons_en.push(...fRen);

    // ── Region match (0–0.15) ────────────────────────────────────────────
    const { score: regionScore, reasons: rR, reasons_en: rRen } = computeRegionScore(s, profile);
    total += regionScore;
    reasons.push(...rR); reasons_en.push(...rRen);

    // ── Amount bonus (0–0.05) ────────────────────────────────────────────
    const amount = parseFloat(s.award_amount_thb ?? '0') || 0;
    total += Math.min(amount / 400_000, 1.0) * 0.05;

    // ── Urgency bonus (0–0.05) ───────────────────────────────────────────
    const urgency = urgencyBonus(s, this.nowDate);
    total += urgency;
    if (urgency > 0) {
      reasons.push('ใกล้ถึงกำหนดสมัคร');
      reasons_en.push('Deadline coming soon');
    }

    const score = Math.min(total, 1.0);

    // Build single-sentence explanation
    const topReasonTH = reasons[0] ?? 'ตรงตามเกณฑ์คุณสมบัติ';
    const topReasonEN = reasons_en[0] ?? 'Matches your profile';
    const explanation    = `ทุนนี้เหมาะกับคุณเพราะ${topReasonTH}`;
    const explanation_en = `Recommended because: ${topReasonEN}`;

    return { score, reasons, reasons_en, explanation, explanation_en };
  }
}
