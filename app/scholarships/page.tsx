'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import ScholarshipCard from '@/components/ScholarshipCard';
import ScholarshipFilters from '@/components/ScholarshipFilters';
import { useLang } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { translations } from '@/lib/translations';
import { getDeadlineInfo } from '@/lib/deadline';
import type { FilterState, Scholarship } from '@/lib/types';
import type { User } from '@supabase/supabase-js';
import SaveButton from '@/components/SaveButton';
import { logMatchingResultsViewed, logSearchPerformed } from '@/lib/research/events';

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'matches' | 'browse';
type BrowseSortKey = 'amount' | 'deadline' | 'name';
type MatchSortKey = 'match' | 'amount' | 'deadline' | 'name';
type MinScore = 0 | 0.5 | 0.7 | 0.9;

interface StudentProfile {
  province_id: string;
  income_bracket: number;
  gpa: number;
  fields_of_interest: string[];
  welfare_card: boolean;
  grade_level: string;
}

type ScoredScholarship = Scholarship & {
  rawScore: number;
  fairnessScore: number;
  boosted: boolean;
  reasons: string[];
  reasons_en: string[];
};

const EMPTY_FILTERS: FilterState = {
  funderType: '',
  minGpa: null,
  fieldOfStudy: '',
  province: '',
  welfareCard: false,
  gradeLevel: '',
};

// ── Scoring constants ─────────────────────────────────────────────────────────

// Northeast Thai provinces (Isan) Thai names matching what profiles table stores
const NORTHEAST = new Set([
  'นครราชสีมา', 'บุรีรัมย์', 'สุรินทร์', 'ศรีสะเกษ', 'อุบลราชธานี',
  'ยโสธร', 'ชัยภูมิ', 'อำนาจเจริญ', 'หนองบัวลำภู', 'ขอนแก่น',
  'อุดรธานี', 'เลย', 'หนองคาย', 'มหาสารคาม', 'ร้อยเอ็ด',
  'กาฬสินธุ์', 'สกลนคร', 'นครพนม', 'มุกดาหาร', 'บึงกาฬ',
]);

// Upper bound of each income bracket in THB/month
const INCOME_CEILING: Record<number, number> = {
  1: 5_000,
  2: 10_000,
  3: 15_000,
  4: 20_000,
  5: 30_000,
  6: 50_000,
  7: 999_999,
};

// ── Score colour helper ───────────────────────────────────────────────────────
function getScoreColor(score: number) {
  if (score >= 0.85) return { bar: '#22C55E', text: '#16A34A', label: { th: 'ตรงมาก', en: 'Excellent' } };
  if (score >= 0.70) return { bar: '#2E6BE6', text: '#1E57CC', label: { th: 'ตรงดี',  en: 'Good'      } };
  if (score >= 0.50) return { bar: '#F97316', text: '#EA580C', label: { th: 'พอดี',   en: 'Fair'      } };
  return               { bar: '#94A3B8', text: '#64748B', label: { th: 'น้อย',   en: 'Low'       } };
}

// ── Inline scoring engine ─────────────────────────────────────────────────────
// Returns null when the scholarship hard-disqualifies the student.
// Scores are intentionally differentiated so broad/open scholarships rank lower.
function scoreOne(s: Record<string, unknown>, p: StudentProfile): ScoredScholarship | null {
  const MAX = 10.0;
  let score = 0;
  const reasons: string[] = [];
  const reasons_en: string[] = [];

  // ── Hard disqualifiers ─────────────────────────────────────────────────────
  const minGpa = (s.min_gpa as number | null) ?? 0;
  if (minGpa > 0 && p.gpa < minGpa) return null;

  const inc = INCOME_CEILING[p.income_bracket] ?? 999_999;
  const maxIncome = (s.max_income_thb as number | null) ?? null;
  if (maxIncome !== null && inc > maxIncome) return null;

  // ── GPA (0–3 pts) ──────────────────────────────────────────────────────────
  if (minGpa === 0) {
    score += 1.5;
    reasons.push('ไม่มีเกณฑ์เกรดขั้นต่ำ เปิดรับทุกคน');
    reasons_en.push('No minimum GPA open to all');
  } else {
    const margin = p.gpa - minGpa;
    score += 2.0 + Math.min(margin * 1.5, 1.0);
    reasons.push(`เกรด ${p.gpa.toFixed(2)} ผ่านเกณฑ์ขั้นต่ำ ${minGpa}`);
    reasons_en.push(`GPA ${p.gpa.toFixed(2)} meets the ${minGpa} minimum`);
    if (margin >= 0.5) {
      reasons.push(`เกรดสูงกว่าเกณฑ์ ${margin.toFixed(2)} โอกาสสูง`);
      reasons_en.push(`GPA exceeds minimum by ${margin.toFixed(2)} strong chance`);
    }
  }

  // ── Income (0–2 pts) ───────────────────────────────────────────────────────
  if (maxIncome === null) {
    score += 0.5;
    reasons.push('ไม่จำกัดรายได้ครัวเรือน');
    reasons_en.push('No income restriction');
  } else {
    const ratio = inc / maxIncome;
    if (ratio <= 0.5) {
      score += 2.0;
      reasons.push('รายได้ครัวเรือนต่ำกว่าเกณฑ์มาก โอกาสสูง');
      reasons_en.push('Income well below limit strong match');
    } else {
      score += 1.5;
      reasons.push('รายได้ครัวเรือนผ่านเกณฑ์');
      reasons_en.push('Household income qualifies');
    }
  }

  // ── Welfare card (0–1 pt) ─────────────────────────────────────────────────
  if (p.welfare_card && s.welfare_card_priority) {
    score += 1.0;
    reasons.push('ผู้ถือบัตรสวัสดิการได้รับสิทธิพิเศษ');
    reasons_en.push('Welfare card holders receive priority');
  }

  // ── Field of study (0–2 pts) ──────────────────────────────────────────────
  const sFields = (s.field_of_study as string[] | null) ?? [];
  const pFields = p.fields_of_interest ?? ['any'];
  if (!sFields.length || sFields.includes('any')) {
    score += 0.5;
    reasons.push('เปิดรับทุกสาขาวิชา');
    reasons_en.push('Open to all fields of study');
  } else if (pFields.includes('any') || pFields.some((f) => sFields.includes(f))) {
    score += 2.0;
    const matched = pFields.filter((f) => sFields.includes(f));
    if (matched.length > 0) {
      reasons.push(`ตรงกับสาขา: ${matched.join(', ')}`);
      reasons_en.push(`Matches your field: ${matched.join(', ')}`);
    } else {
      reasons.push('สาขาวิชาตรงกับที่คุณสนใจ');
      reasons_en.push('Field of study matches your interests');
    }
  } else {
    return null; // field mismatch → disqualify
  }

  // ── Province (0–2 pts) ────────────────────────────────────────────────────
  const sProvs = (s.province_restriction as string[] | null) ?? [];
  if (!sProvs.length || sProvs.includes('national')) {
    score += 0.5;
    reasons.push('เปิดรับนักเรียนจากทุกจังหวัด');
    reasons_en.push('Open to all provinces');
  } else if (p.province_id && sProvs.includes(p.province_id)) {
    score += 2.0;
    reasons.push('ทุนนี้มีสำหรับจังหวัดของคุณโดยเฉพาะ');
    reasons_en.push('This scholarship is specifically for your province');
  } else {
    return null; // province mismatch → disqualify
  }

  // ── Grade level (0–1 pt) ──────────────────────────────────────────────────
  const sGrades = (s.grade_levels as string[] | null) ?? [];
  if (!sGrades.length || sGrades.includes('any')) {
    score += 0.3;
  } else if (p.grade_level && sGrades.includes(p.grade_level)) {
    score += 1.0;
    reasons.push('ตรงกับระดับชั้นของคุณ');
    reasons_en.push('Matches your grade level');
  }

  // ── Amount bonus (0–0.5 pts) ──────────────────────────────────────────────
  const amount = (s.amount_thb as number | null) ?? 0;
  if (amount > 0) {
    score += Math.min(amount / 200_000, 0.5);
  }

  const raw = Math.min(score / MAX, 1.0);

  // ── Equalized odds correction (Hardt, Price, Srebro NeurIPS 2016) ────────
  const isRural = NORTHEAST.has(p.province_id ?? '');
  const isLow   = (p.income_bracket ?? 7) <= 3;
  const bias    = (s.historical_bias_score as number | null) ?? 0.5;

  let fairness = raw;
  let boosted  = false;
  if (isRural && isLow && bias > 0.6) {
    const correction = Math.min(1.0 + (bias - 0.5) * 0.6, 2.0);
    fairness = Math.min(raw * correction, 1.0);
    boosted  = fairness > raw + 0.005;
  }

  return {
    ...(s as unknown as Scholarship),
    rawScore:      Math.round(raw      * 1000) / 1000,
    fairnessScore: Math.round(fairness * 1000) / 1000,
    boosted,
    reasons,
    reasons_en,
  };
}

// ── Browse tab helpers ────────────────────────────────────────────────────────
function sortByAmount(scholarships: Scholarship[]): Scholarship[] {
  return [...scholarships].sort((a, b) => {
    if (a.amount_thb === null && b.amount_thb === null) return 0;
    if (a.amount_thb === null) return 1;
    if (b.amount_thb === null) return -1;
    return b.amount_thb - a.amount_thb;
  });
}

function sortByDeadline(scholarships: Scholarship[]): Scholarship[] {
  return [...scholarships].sort((a, b) => {
    const daysA = getDeadlineInfo(a.deadline_date).days;
    const daysB = getDeadlineInfo(b.deadline_date).days;
    if (daysA === null && daysB === null) return 0;
    if (daysA === null) return 1;
    if (daysB === null) return -1;
    if (daysA < 0 && daysB >= 0) return 1;
    if (daysA >= 0 && daysB < 0) return -1;
    return daysA - daysB;
  });
}

function sortByName(scholarships: Scholarship[], lang: string): Scholarship[] {
  return [...scholarships].sort((a, b) => {
    const nameA = lang === 'th' ? (a.name_th ?? '') : (a.name_en ?? a.name_th ?? '');
    const nameB = lang === 'th' ? (b.name_th ?? '') : (b.name_en ?? b.name_th ?? '');
    return nameA.localeCompare(nameB, lang === 'th' ? 'th' : 'en');
  });
}

function searchFilter(scholarships: Scholarship[], query: string, _lang: string): Scholarship[] {
  if (!query.trim()) return scholarships;
  const q = query.trim().toLowerCase();
  return scholarships.filter((s) => {
    const nameTh   = (s.name_th ?? '').toLowerCase();
    const nameEn   = (s.name_en ?? '').toLowerCase();
    const funderTh = (s.funder_name_th ?? '').toLowerCase();
    const funderEn = (s.funder_name_en ?? '').toLowerCase();
    const descTh   = ((s as Scholarship & { description_th?: string }).description_th ?? '').toLowerCase();
    const descEn   = ((s as Scholarship & { description_en?: string }).description_en ?? '').toLowerCase();
    return nameTh.includes(q) || nameEn.includes(q) || funderTh.includes(q) ||
           funderEn.includes(q) || descTh.includes(q) || descEn.includes(q);
  });
}

function applyFilters(scholarships: Scholarship[], f: FilterState): Scholarship[] {
  return scholarships.filter((s) => {
    if (s.is_active === false) return false;
    if (f.funderType && s.funder_type !== f.funderType) return false;
    if (f.minGpa !== null && s.min_gpa !== null && s.min_gpa > f.minGpa) return false;
    if (f.fieldOfStudy) {
      const fields = s.field_of_study ?? [];
      if (!fields.includes('any') && !fields.some((fd) => fd.includes(f.fieldOfStudy) || f.fieldOfStudy.includes(fd))) return false;
    }
    if (f.province) {
      const provinces = s.province_restriction ?? [];
      if (!provinces.includes('national') && !provinces.includes(f.province)) return false;
    }
    if (f.welfareCard && !s.welfare_card_priority) return false;
    if (f.gradeLevel) {
      const gl = s.grade_levels ?? [];
      if (gl.length > 0) {
        const g = f.gradeLevel;
        const GRADE_GROUPS: Record<string, string[]> = {
          'ม.ต้น':    ['M1', 'M2', 'M3', 'ม.ต้น', 'ม.1', 'ม.2', 'ม.3'],
          'ม.ปลาย':   ['M4', 'M5', 'M6', 'ม.ปลาย', 'ม.4', 'ม.5', 'ม.6'],
          'ปวช./ปวส.': ['vocational', 'ปวช.', 'ปวส.', 'ม.ปลาย'],
          uni:         ['uni'],
          graduate:    ['graduate'],
        };
        const matchKeys = GRADE_GROUPS[g] ?? [g];
        if (!gl.some((level) => matchKeys.includes(level))) return false;
      }
    }
    return true;
  });
}

// ── Empty state (DB returned 0 rows) ─────────────────────────────────────────
function EmptyState({ lang }: { lang: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="text-6xl mb-6">🎓</div>
      <h2 className="text-xl font-semibold text-[#1D1D1F] dark:text-white mb-3"
          style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
        {lang === 'th' ? 'ยังไม่พบทุนการศึกษา' : 'No scholarships found'}
      </h2>
      <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] max-w-sm leading-relaxed mb-6"
         style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
        {lang === 'th' ? 'กรุณา refresh หน้า หรือติดต่อผู้ดูแลระบบ' : 'Try refreshing the page, or contact the site admin.'}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="text-sm font-semibold text-white bg-[#2E6BE6] hover:bg-[#1E57CC] transition-colors px-6 py-2.5 rounded-full"
      >
        {lang === 'th' ? 'รีเฟรชหน้านี้' : 'Refresh page'}
      </button>
    </div>
  );
}

// ── Score tooltip ─────────────────────────────────────────────────────────────
function ScoreTooltip({ lang }: { lang: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-4 h-4 rounded-full bg-[#E5E5EA] dark:bg-[#3a3a3c] text-[#6E6E73] dark:text-[#8E8E93] text-[10px] font-bold flex items-center justify-center hover:bg-[#2E6BE6]/20 hover:text-[#2E6BE6] transition-colors ml-1 shrink-0"
        aria-label="Score info"
      >
        i
      </button>
      {open && (
        <div className="absolute bottom-6 left-0 z-30 w-52 bg-[#1D1D1F] text-white text-xs leading-relaxed rounded-lg p-3 shadow-xl pointer-events-none">
          {lang === 'th' ? (
            <>
              <p className="font-semibold mb-1">คะแนนความเหมาะสมคำนวณจาก:</p>
              <p className="text-[#aeaeb2]">เกรด • รายได้ • สาขาวิชา • จังหวัด • บัตรสวัสดิการ</p>
              <p className="text-[#aeaeb2] mt-1">ยิ่งตรงกับคุณมาก คะแนนยิ่งสูง</p>
            </>
          ) : (
            <>
              <p className="font-semibold mb-1">Match score is calculated from:</p>
              <p className="text-[#aeaeb2]">GPA • Income • Field • Province • Welfare card</p>
              <p className="text-[#aeaeb2] mt-1">The more it fits your profile, the higher the score.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Match score bar ───────────────────────────────────────────────────────────
function MatchScoreBar({ scholarship, lang }: { scholarship: ScoredScholarship; lang: string }) {
  const pct   = Math.round(scholarship.fairnessScore * 100);
  const color = getScoreColor(scholarship.fairnessScore);

  return (
    <div className="mt-2 pt-3 border-t border-[#F5F5F7] dark:border-[#232B3E]">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center">
          <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
            {lang === 'th' ? 'ความเหมาะสม' : 'Match score'}
          </span>
          <ScoreTooltip lang={lang} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold" style={{ color: color.text }}>{pct}%</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: color.bar + '20', color: color.text }}>
            {color.label[lang as 'th' | 'en']}
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-[#F7F9FC] dark:bg-[#232B3E] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color.bar }}
        />
      </div>
      {scholarship.boosted && (
        <p className="mt-1.5 text-[10px] text-[#2E6BE6] font-medium">
          ⚖️ {lang === 'th' ? 'ปรับความเป็นธรรมแล้ว' : 'Fairness-adjusted'}
        </p>
      )}
    </div>
  );
}

// ── Match card ────────────────────────────────────────────────────────────────
function MatchCard({
  scholarship: s,
  rank,
  lang,
}: {
  scholarship: ScoredScholarship;
  rank: number;
  lang: string;
}) {
  const name   = lang === 'th' ? s.name_th : (s.name_en ?? s.name_th);
  const funder = lang === 'th' ? s.funder_name_th : (s.funder_name_en ?? s.funder_name_th);
  const reasons = lang === 'th' ? s.reasons : s.reasons_en;
  const color  = getScoreColor(s.fairnessScore);

  const { label: deadlineLabel, labelEn: deadlineLabelEn, color: deadlineColorKey } = getDeadlineInfo(s.deadline_date);

  function storeMatchData() {
    try {
      sessionStorage.setItem(`tundee_match_${s.id}`, JSON.stringify({
        raw_score: s.rawScore,
        fairness_score: s.fairnessScore,
        correction_applied: 0,
        fairness_boosted: s.boosted,
        reasons: s.reasons,
        reasons_en: s.reasons_en,
      }));
    } catch { /* sessionStorage unavailable */ }
  }

  return (
    <article className="bg-white dark:bg-[#161B27] border border-[#E5E5EA] dark:border-[#232B3E] rounded-[12px] p-5 flex flex-col gap-3 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] transition-shadow duration-200">

      {/* Header row: rank + name + amount + save */}
      <div className="flex items-start gap-2">
        {/* Rank circle */}
        <span className="w-6 h-6 rounded-full bg-[#2E6BE6] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
          {rank}
        </span>

        {/* Name + funder */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-white leading-snug line-clamp-2"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
            {name}
          </h3>
          {funder && (
            <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] truncate mt-0.5">{funder}</p>
          )}
        </div>

        {/* Amount + score badge + save */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {s.amount_thb ? (
            <span className="text-sm font-bold text-[#2E6BE6]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              ฿{s.amount_thb.toLocaleString('th-TH')}
            </span>
          ) : (
            <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
              {lang === 'th' ? 'ติดต่อโดยตรง' : 'Contact funder'}
            </span>
          )}
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: color.bar + '20', color: color.text }}>
            {Math.round(s.fairnessScore * 100)}% {color.label[lang as 'th' | 'en']}
          </span>
          <SaveButton scholarshipId={s.id} size="sm" />
        </div>
      </div>

      {/* Reasons */}
      {reasons.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-wider">
            {lang === 'th' ? 'ทำไมถึงตรงกับคุณ' : 'Why this matched you'}
          </p>
          <ul className="space-y-0.5">
            {reasons.slice(0, 3).map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[#6E6E73] dark:text-[#8E8E93]">
                <span className="text-[#2E6BE6] mt-0.5 shrink-0">✓</span>
                <span style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Score bar */}
      <MatchScoreBar scholarship={s} lang={lang} />

      {/* Footer: deadline + detail link */}
      <div className="flex items-center justify-between pt-1">
        {s.deadline_date ? (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            deadlineColorKey === 'red' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
            deadlineColorKey === 'orange' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' :
            'bg-[#F7F9FC] dark:bg-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93]'
          }`}>
            {lang === 'th' ? deadlineLabel : deadlineLabelEn}
          </span>
        ) : (
          <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
            {lang === 'th' ? 'ตรวจสอบเว็บไซต์' : 'Check website'}
          </span>
        )}
        <Link
          href={`/scholarships/${s.id}`}
          onClick={storeMatchData}
          className="text-xs text-[#2E6BE6] font-semibold hover:underline"
        >
          {lang === 'th' ? 'ดูรายละเอียด →' : 'View details →'}
        </Link>
      </div>
    </article>
  );
}

// ── Match controls (sort + score filter) ─────────────────────────────────────
interface MatchControlsProps {
  total: number;
  visibleCount: number;
  sortBy: MatchSortKey;
  setSortBy: (v: MatchSortKey) => void;
  minScore: MinScore;
  setMinScore: (v: MinScore) => void;
  lang: string;
}

function MatchControls({ total, visibleCount, sortBy, setSortBy, minScore, setMinScore, lang }: MatchControlsProps) {
  const SORT_OPTS: { key: MatchSortKey; th: string; en: string }[] = [
    { key: 'match',    th: '🎯 ความเหมาะสม',  en: '🎯 Best Match'    },
    { key: 'amount',   th: '💰 เงินมากสุด',    en: '💰 Most Money'    },
    { key: 'deadline', th: '📅 ใกล้หมดเขต',   en: '📅 Deadline Soon' },
    { key: 'name',     th: 'ก–ฮ ชื่อ',        en: 'A–Z Name'         },
  ];

  const SCORE_OPTS: { key: MinScore; th: string; en: string }[] = [
    { key: 0,   th: 'ทั้งหมด', en: 'All'  },
    { key: 0.5, th: '50%+',    en: '50%+' },
    { key: 0.7, th: '70%+',    en: '70%+' },
    { key: 0.9, th: '90%+',    en: '90%+' },
  ];

  return (
    <div className="mb-6 space-y-4 bg-[#F7F9FC] dark:bg-[#161B27] rounded-xl p-4 border border-[#E5E5EA] dark:border-[#232B3E]">
      {/* Result summary */}
      <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]"
         style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
        {visibleCount === total ? (
          lang === 'th'
            ? `พบ ${total} ทุนที่ตรงกับคุณ`
            : `Found ${total} scholarships matching your profile`
        ) : (
          lang === 'th'
            ? `แสดง ${visibleCount} ทุน (คะแนน ${Math.round(minScore * 100)}%+) จากทั้งหมด ${total} ทุน`
            : `Showing ${visibleCount} scholarships (score ${Math.round(minScore * 100)}%+) of ${total} total`
        )}
      </p>

      {/* Sort */}
      <div>
        <p className="text-[10px] text-[#aeaeb2] mb-2 font-semibold uppercase tracking-widest">
          {lang === 'th' ? 'เรียงตาม' : 'Sort by'}
        </p>
        <div className="flex flex-wrap gap-2">
          {SORT_OPTS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                sortBy === opt.key
                  ? 'bg-[#2E6BE6] text-white shadow-sm'
                  : 'bg-white dark:bg-[#232B3E] border border-[#E5E5EA] dark:border-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6] hover:text-[#2E6BE6]'
              }`}
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
            >
              {lang === 'th' ? opt.th : opt.en}
            </button>
          ))}
        </div>
      </div>

      {/* Score filter */}
      <div>
        <p className="text-[10px] text-[#aeaeb2] mb-2 font-semibold uppercase tracking-widest">
          {lang === 'th' ? 'แสดงเฉพาะ' : 'Show only'}
        </p>
        <div className="flex flex-wrap gap-2">
          {SCORE_OPTS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setMinScore(opt.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                minScore === opt.key
                  ? 'bg-[#1D1D1F] dark:bg-[#F7F9FC] text-white dark:text-[#1D1D1F]'
                  : 'bg-white dark:bg-[#232B3E] border border-[#E5E5EA] dark:border-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#1D1D1F] dark:hover:border-[#F5F5F7]'
              }`}
            >
              {lang === 'th' ? opt.th : opt.en}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BrowsePage() {
  const { lang } = useLang();
  const b = translations.browse;
  const supabase = createClient();

  const [user, setUser]                 = useState<User | null>(null);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading]           = useState(true);
  const [fetchError, setFetchError]     = useState<string | null>(null);
  const [filters, setFilters]           = useState<FilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen]   = useState(false);
  const [activeTab, setActiveTab]       = useState<Tab>('browse');
  const [browseSortKey, setBrowseSortKey] = useState<BrowseSortKey>('deadline');
  const [matchSortBy, setMatchSortBy]   = useState<MatchSortKey>('match');
  const [matchMinScore, setMatchMinScore] = useState<MinScore>(0);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [userProfile, setUserProfile]   = useState<StudentProfile | null>(null);
  const [searchQuery, setSearchQuery]   = useState('');

  // ── Data load ───────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('scholarships')
          .select('*')
          .order('amount_thb', { ascending: false, nullsFirst: false });
        if (fetchErr) {
          console.error('[TunDee] scholarships fetch error:', fetchErr.message);
          setFetchError('exception');
        } else {
          const active = (data || []).filter(
            (s) => (s as { is_active?: boolean | null }).is_active !== false
          ) as Scholarship[];
          setScholarships(active);
          if (active.length === 0) setFetchError('no_data');
        }
      } catch (err) {
        console.error('[TunDee] scholarships unexpected error:', err);
        setFetchError('exception');
      } finally {
        setLoading(false);
      }
    })();

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) return;
      const authUser = data.session.user;
      setUser(authUser);
      setActiveTab('matches');
      setMatchesLoading(true);

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        if (profile) {
          setUserProfile({
            province_id:       profile.province_id      ?? '',
            income_bracket:    profile.income_bracket   ?? 4,
            gpa:               parseFloat(profile.gpa ?? '3.0'),
            fields_of_interest: profile.fields_of_interest ?? ['any'],
            welfare_card:      profile.welfare_card     ?? false,
            grade_level:       profile.grade_level      ?? '',
          });

          // (last_active_at removed column does not exist in profiles table)
        }
      } catch {
        // silently ignore
      } finally {
        setMatchesLoading(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Compute matches inline ──────────────────────────────────────────────────
  const allMatches = useMemo((): ScoredScholarship[] => {
    if (!userProfile || scholarships.length === 0) return [];
    const results: ScoredScholarship[] = [];
    for (const s of scholarships) {
      if (s.is_active === false) continue;
      const scored = scoreOne(s as unknown as Record<string, unknown>, userProfile);
      if (scored) results.push(scored);
    }
    // Sort by fairness score descending initially for rank assignment
    results.sort((a, b) => b.fairnessScore - a.fairnessScore || (b.amount_thb ?? 0) - (a.amount_thb ?? 0));
    return results;
  }, [userProfile, scholarships]);

  // ── Apply match filter + sort ───────────────────────────────────────────────
  const visibleMatches = useMemo((): (ScoredScholarship & { displayRank: number })[] => {
    const filtered = allMatches.filter((s) => s.fairnessScore >= matchMinScore);

    const sorted = [...filtered].sort((a, b) => {
      switch (matchSortBy) {
        case 'match':
          return b.fairnessScore - a.fairnessScore || (b.amount_thb ?? 0) - (a.amount_thb ?? 0);
        case 'amount':
          if (!a.amount_thb && !b.amount_thb) return 0;
          if (!a.amount_thb) return 1;
          if (!b.amount_thb) return -1;
          return b.amount_thb - a.amount_thb;
        case 'deadline': {
          if (!a.deadline_date && !b.deadline_date) return 0;
          if (!a.deadline_date) return 1;
          if (!b.deadline_date) return -1;
          return new Date(a.deadline_date).getTime() - new Date(b.deadline_date).getTime();
        }
        case 'name':
          return (a.name_th ?? '').localeCompare(b.name_th ?? '', 'th');
        default:
          return 0;
      }
    });

    return sorted.map((s, i) => ({ ...s, displayRank: i + 1 }));
  }, [allMatches, matchSortBy, matchMinScore]);

  // ── Log recommendations + research tracking ─────────────────────────────────
  useEffect(() => {
    if (allMatches.length === 0) return;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const top10 = allMatches.slice(0, 10);

        // Upsert recommendations with full research metadata (IV treatment variable)
        const rows = allMatches.map((s, i) => ({
          user_id:                    session.user.id,
          scholarship_id:             s.id,
          score_raw:                  s.rawScore,
          score_fairness_adjusted:    s.fairnessScore,
          rank:                       i + 1,
          reasons_json:               { reasons: s.reasons, reasons_en: s.reasons_en, boosted: s.boosted },
          fairness_correction_applied: s.boosted ?? false,
          correction_multiplier:      s.boosted ? s.fairnessScore / s.rawScore : null,
          algorithm_version:          'v1',
          generated_at:               new Date().toISOString(),
        }));
        await supabase.from('recommendations').upsert(rows, { onConflict: 'user_id,scholarship_id' });

        // Mark applications as "was_recommended" for top 10 — key PSM variable
        for (const s of top10) {
          const rank = allMatches.findIndex((m) => m.id === s.id) + 1;
          await supabase.from('applications').upsert(
            {
              user_id:             session.user.id,
              scholarship_id:      s.id,
              was_recommended:     true,
              recommendation_rank: rank,
            },
            { onConflict: 'user_id,scholarship_id' }
          );
        }

        // Research: log matching results viewed (fire-and-forget)
        logMatchingResultsViewed(allMatches.length, allMatches[0]?.id);
      } catch { /* silently ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatches]);

  // ── Browse tab derived data ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let base = applyFilters(scholarships, filters);
    base = searchFilter(base, searchQuery, lang);
    if (browseSortKey === 'deadline') return sortByDeadline(base);
    if (browseSortKey === 'amount')   return sortByAmount(base);
    return sortByName(base, lang);
  }, [scholarships, filters, browseSortKey, searchQuery, lang]);

  // ── Research: log search queries ────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.length >= 2) {
      logSearchPerformed(searchQuery, filtered.length);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filtered.length]);

  const isDataEmpty = !loading && scholarships.length === 0;

  const urgentScholarships = useMemo(() => {
    return scholarships.filter((s) => {
      const info = getDeadlineInfo(s.deadline_date);
      return info.days !== null && info.days >= 0 && info.days <= 7;
    });
  }, [scholarships]);

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-white dark:bg-[#000000] min-h-screen">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="bg-[#F7F9FC] dark:bg-[#161B27] border-b border-[#E5E5EA] dark:border-[#232B3E]">
        <div className="max-w-[1200px] mx-auto px-6 py-12">
          <h1
            className="text-3xl md:text-4xl text-[#1D1D1F] dark:text-white mb-3"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif', fontWeight: 300 }}
          >
            {b.title[lang]}
          </h1>
          <p className="text-[#6E6E73] dark:text-[#8E8E93]">{b.subtitle[lang]}</p>

          {user && (
            <div className="flex gap-1 mt-6 bg-[#EAEAEC] dark:bg-[#232B3E] rounded-[10px] p-1 w-fit">
              {(['matches', 'browse'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-5 py-2 text-sm font-medium rounded-[8px] transition-all duration-200 ${
                    activeTab === t
                      ? 'bg-white dark:bg-[#161B27] text-[#1D1D1F] dark:text-white shadow-sm'
                      : 'text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white'
                  }`}
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
                >
                  {t === 'matches' ? b.tabMatches[lang] : b.tabBrowse[lang]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-10">

        {/* ── Login banner ─────────────────────────────────────────────────── */}
        {!user && !loading && scholarships.length > 0 && (
          <div className="mb-8 flex items-center justify-between gap-4 bg-[#EFF4FF] dark:bg-[#162552] border border-[#2E6BE6]/30 rounded-[12px] px-6 py-4">
            <p className="text-sm text-[#1D1D1F] dark:text-[#F5F5F7]"
               style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
              {b.loginBanner[lang]}
            </p>
            <a href="/auth?from=signup" className="text-sm font-semibold text-[#2E6BE6] hover:underline shrink-0">
              {b.loginBannerCta[lang]}
            </a>
          </div>
        )}

        {/* ── Urgent deadline banner ───────────────────────────────────────── */}
        {!loading && urgentScholarships.length > 0 && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
            <span className="text-xl shrink-0">⚡</span>
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                {lang === 'th'
                  ? `${urgentScholarships.length} ทุนกำลังจะหมดเขตใน 7 วัน`
                  : `${urgentScholarships.length} scholarship${urgentScholarships.length > 1 ? 's' : ''} closing within 7 days`}
              </p>
              <p className="text-xs text-red-600 dark:text-red-500 mt-0.5 line-clamp-1">
                {urgentScholarships.map((s) => lang === 'th' ? s.name_th : (s.name_en ?? s.name_th)).join(' · ')}
              </p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MY MATCHES TAB
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'matches' && user && (
          <div>
            {matchesLoading ? (
              /* Skeleton */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-64 bg-[#F7F9FC] dark:bg-[#161B27] rounded-[12px] animate-pulse" />
                ))}
              </div>

            ) : !userProfile ? (
              /* No profile yet */
              <div className="flex flex-col items-center py-24 text-center">
                <div className="text-5xl mb-5">📋</div>
                <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2"
                    style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
                  {b.completeProfile[lang]}
                </h3>
                <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] max-w-xs mb-6">{b.completeProfileSub[lang]}</p>
                <Link href="/profile/setup"
                      className="bg-[#2E6BE6] text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-[#1E57CC] transition-colors">
                  {lang === 'th' ? 'กรอกโปรไฟล์' : 'Set up profile'}
                </Link>
              </div>

            ) : allMatches.length === 0 ? (
              /* Engine found nothing */
              <div className="flex flex-col items-center py-20 text-center">
                <div className="text-5xl mb-5">🔍</div>
                <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2"
                    style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
                  {lang === 'th' ? 'ไม่พบทุนที่ตรงกับโปรไฟล์ปัจจุบัน' : 'No matches for your current profile'}
                </h3>
                <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] max-w-xs mb-6 leading-relaxed">
                  {lang === 'th'
                    ? 'ลองปรับเกรดหรือเพิ่มสาขาที่สนใจในโปรไฟล์ของคุณ'
                    : 'Try updating your GPA or adding more fields of interest in your profile'}
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <Link href="/profile/setup"
                        className="px-5 py-2.5 bg-[#2E6BE6] text-white rounded-full text-sm font-semibold hover:bg-[#1E57CC] transition-colors">
                    {lang === 'th' ? 'อัปเดตโปรไฟล์' : 'Update Profile'}
                  </Link>
                  <button
                    onClick={() => setActiveTab('browse')}
                    className="px-5 py-2.5 border border-[#E5E5EA] dark:border-[#232B3E] rounded-full text-sm text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6] hover:text-[#2E6BE6] transition-colors"
                  >
                    {lang === 'th' ? 'ดูทุนทั้งหมด' : 'Browse All'}
                  </button>
                </div>
              </div>

            ) : (
              <>
                {/* Controls */}
                <MatchControls
                  total={allMatches.length}
                  visibleCount={visibleMatches.length}
                  sortBy={matchSortBy}
                  setSortBy={setMatchSortBy}
                  minScore={matchMinScore}
                  setMinScore={setMatchMinScore}
                  lang={lang}
                />

                {/* Empty after filter */}
                {visibleMatches.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-center">
                    <div className="text-5xl mb-5">🔍</div>
                    <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2"
                        style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
                      {lang === 'th'
                        ? `ไม่มีทุนที่ตรงถึง ${Math.round(matchMinScore * 100)}%`
                        : `No scholarships match ${Math.round(matchMinScore * 100)}%+ for your profile`}
                    </h3>
                    <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-5">
                      {lang === 'th' ? 'ลองดูทุนที่ตรงในระดับที่ต่ำกว่า' : 'Try a lower score threshold'}
                    </p>
                    <button
                      onClick={() => setMatchMinScore(matchMinScore === 0.9 ? 0.7 : matchMinScore === 0.7 ? 0.5 : 0)}
                      className="px-5 py-2.5 bg-[#2E6BE6] text-white rounded-full text-sm font-semibold hover:bg-[#1E57CC] transition-colors"
                    >
                      {matchMinScore === 0.9
                        ? (lang === 'th' ? 'ดูทุน 70%+' : 'Show 70%+ matches')
                        : matchMinScore === 0.7
                        ? (lang === 'th' ? 'ดูทุน 50%+' : 'Show 50%+ matches')
                        : (lang === 'th' ? 'ดูทุนทั้งหมด' : 'Show all matches')}
                    </button>
                  </div>
                ) : (
                  /* Match grid */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleMatches.map((s) => (
                      <MatchCard key={s.id} scholarship={s} rank={s.displayRank} lang={lang} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            BROWSE ALL TAB
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'browse' && (
          isDataEmpty ? (
            <EmptyState lang={lang} />
          ) : (
            <div className="flex gap-8">
              {/* Sidebar desktop */}
              <aside className="hidden md:block w-72 shrink-0">
                <div className="sticky top-24">
                  <ScholarshipFilters filters={filters} onChange={setFilters} resultCount={filtered.length} />
                </div>
              </aside>

              <div className="flex-1 min-w-0">
                {/* Mobile filter toggle */}
                <button
                  className="md:hidden flex items-center gap-2 text-sm font-medium text-[#1D1D1F] dark:text-white border border-[#E5E5EA] dark:border-[#232B3E] rounded-lg px-4 py-2 mb-6 w-full justify-center"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                  </svg>
                  {b.filters[lang]} {filtered.length > 0 && `(${filtered.length})`}
                </button>

                {filtersOpen && (
                  <div className="md:hidden mb-6">
                    <ScholarshipFilters filters={filters} onChange={setFilters} resultCount={filtered.length} />
                  </div>
                )}

                {/* Search */}
                <div className="mb-5 relative">
                  <div className="relative">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ADADB8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={lang === 'th' ? 'ค้นหาชื่อทุน หรือผู้ให้ทุน...' : 'Search by scholarship or funder name...'}
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-[#E5E5EA] dark:border-[#232B3E] rounded-[10px] bg-white dark:bg-[#161B27] text-[#1D1D1F] dark:text-white placeholder-[#ADADB8] focus:outline-none focus:border-[#2E6BE6] transition-colors"
                      style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#ADADB8] hover:text-[#6E6E73] transition-colors"
                        aria-label="Clear search"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {searchQuery && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-[#6E6E73]">{lang === 'th' ? 'ค้นหา:' : 'Searching:'}</span>
                      <span className="inline-flex items-center gap-1 text-xs bg-[#EFF4FF] border border-[#2E6BE6]/30 text-[#2E6BE6] px-2.5 py-0.5 rounded-full font-medium">
                        {searchQuery}
                        <button onClick={() => setSearchQuery('')} className="ml-0.5 hover:text-[#1E57CC]">×</button>
                      </span>
                    </div>
                  )}
                </div>

                {/* Results header + sort */}
                <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                  <span className="text-sm text-[#6E6E73] dark:text-[#8E8E93]">
                    {loading
                      ? (lang === 'th' ? 'กำลังโหลด...' : 'Loading...')
                      : `${filtered.length} ${b.results[lang]}`}
                  </span>
                  {!loading && (
                    <div className="flex items-center gap-2 text-xs text-[#6E6E73]">
                      <span className="hidden sm:inline">{b.sortLabel[lang]}:</span>
                      <div className="flex gap-1 bg-[#F7F9FC] dark:bg-[#232B3E] rounded-lg p-0.5">
                        {(['deadline', 'amount', 'name'] as BrowseSortKey[]).map((key) => (
                          <button
                            key={key}
                            onClick={() => setBrowseSortKey(key)}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                              browseSortKey === key
                                ? 'bg-white dark:bg-[#161B27] text-[#1D1D1F] dark:text-white shadow-sm'
                                : 'text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white'
                            }`}
                          >
                            {key === 'deadline' ? b.sortDeadline[lang] : key === 'amount' ? b.sortAmount[lang] : (lang === 'th' ? 'ก–ฮ' : 'A–Z')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-52 bg-[#F7F9FC] dark:bg-[#161B27] rounded-[12px] animate-pulse" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-24">
                    <div className="text-4xl mb-4">🔍</div>
                    <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2">{b.noResults[lang]}</h3>
                    <p className="text-[#6E6E73] dark:text-[#8E8E93] text-sm mb-6">{b.noResultsSub[lang]}</p>
                    <button
                      onClick={() => { setFilters(EMPTY_FILTERS); setSearchQuery(''); }}
                      className="text-sm text-[#2E6BE6] font-medium hover:underline"
                    >
                      {b.clearFilters[lang]}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filtered.map((s) => <ScholarshipCard key={s.id} scholarship={s} />)}
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
