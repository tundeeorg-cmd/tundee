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
import { logMatchingResultsViewed, logSearchPerformed, setUserResearchContext, assignAbArm } from '@/lib/research/events';
import { logFunnelEvent, logImpressions } from '@/lib/research/funnel';
import { getOrAssignVariant, RANKING_EXPERIMENT } from '@/lib/research/experiment';
import type { TdScholarship } from '@/lib/tdScholarships/types';
import TdScholarshipCard from '@/components/TdScholarshipCard';

// ── Types ─────────────────────────────────────────────────────────────────────
// 'browse' tab now shows td_scholarships. Old 'td' tab retired into 'browse'.
type Tab = 'matches' | 'browse';
type BrowseSortKey = 'deadline' | 'name';
type MatchSortKey = 'match' | 'deadline' | 'name';
type MinScore = 0 | 0.5 | 0.7 | 0.9;

interface StudentProfile {
  province_id: string;
  income_bracket: number;
  gpa: number;
  fields_of_interest: string[];
  welfare_card: boolean;
  grade_level: string;
  /** A/B arm: 'treatment' = fairness-adjusted ranking, 'control' = raw score ranking */
  ab_arm: 'treatment' | 'control' | null;
}

type ScoredTdScholarship = TdScholarship & {
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
function getScoreColor(_score: number) {
  return { bar: '#1B3A6B', text: '#1B3A6B', label: { th: '', en: '' } };
}

// ── Inline scoring engine ─────────────────────────────────────────────────────
// Returns null when the scholarship hard-disqualifies the student.
// Scores are intentionally differentiated so broad/open scholarships rank lower.
function scoreOne(s: Record<string, unknown>, p: StudentProfile): ScoredTdScholarship | null {
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

  // ── Enrolled university requirement ───────────────────────────────────────
  const univReq = (s.enrolled_university_required as string | null | undefined) ?? null;
  if (univReq && univReq.trim() !== '') {
    // We don't know the user's university — show the requirement without disqualifying
    score -= 0.5;
    reasons.push(`ต้องเป็นนักศึกษาของ ${univReq}`);
    reasons_en.push(`Must be enrolled at ${univReq}`);
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
    ...(s as unknown as TdScholarship),
    rawScore:      Math.round(raw      * 1000) / 1000,
    fairnessScore: Math.round(fairness * 1000) / 1000,
    boosted,
    reasons,
    reasons_en,
  };
}

// ── Browse tab helpers ────────────────────────────────────────────────────────
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
      <div className="text-5xl mb-6">📚</div>
      <h2 className="text-xl font-semibold text-[#1D1D1F] dark:text-white mb-3"
          style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
        {lang === 'th' ? 'ยังไม่มีทุนในระบบขณะนี้' : 'No scholarships available at this time'}
      </h2>
      <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] max-w-sm leading-relaxed"
         style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
        {lang === 'th' ? 'กรุณากลับมาใหม่เร็ว ๆ นี้' : 'Please check back soon'}
      </p>
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
        className="w-4 h-4 rounded-full bg-[#E5E5EA] dark:bg-[#3a3a3c] text-[#6E6E73] dark:text-[#8E8E93] text-[10px] font-bold flex items-center justify-center hover:bg-[#1B3A6B]/20 hover:text-[#1B3A6B] transition-colors ml-1 shrink-0"
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
    { key: 'match',    th: 'ความเหมาะสม',  en: 'Best Match'    },
    { key: 'deadline', th: 'ใกล้หมดเขต',   en: 'Deadline Soon' },
    { key: 'name',     th: 'ก–ฮ ชื่อ',        en: 'A–Z Name'         },
  ];

  const SCORE_OPTS: { key: MinScore; th: string; en: string }[] = [
    { key: 0,   th: 'ทั้งหมด', en: 'All'  },
    { key: 0.5, th: '50%+',    en: '50%+' },
    { key: 0.7, th: '70%+',    en: '70%+' },
    { key: 0.9, th: '90%+',    en: '90%+' },
  ];

  return (
    <div className="mb-6 space-y-4 bg-[#F5F7FA] dark:bg-[#0A1628] rounded-xl p-4 border border-[#E5E5EA] dark:border-[#1A2E4A]">
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
                  ? 'bg-[#1B3A6B] text-white shadow-sm'
                  : 'bg-white dark:bg-[#232B3E] border border-[#E5E5EA] dark:border-[#1A2E4A] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6] hover:text-[#1B3A6B]'
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
                  ? 'bg-[#1D1D1F] dark:bg-[#F5F7FA] text-white dark:text-[#1D1D1F]'
                  : 'bg-white dark:bg-[#232B3E] border border-[#E5E5EA] dark:border-[#1A2E4A] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#1D1D1F] dark:hover:border-[#F5F5F7]'
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

// ── BrowseGrid: renders browse-tab cards and logs impressions once per card ───
function BrowseGrid({
  scholarships, userId, variant, loggedImpressions,
}: {
  scholarships: TdScholarship[];
  userId: string | null;
  variant: string | null;
  loggedImpressions: React.RefObject<Set<string>>;
}) {
  useEffect(() => {
    const fresh = scholarships.filter(s => !loggedImpressions.current?.has(s.scholarship_id));
    if (!fresh.length) return;
    fresh.forEach(s => loggedImpressions.current?.add(s.scholarship_id));
    logImpressions(
      fresh.map((s, i) => ({ scholarshipId: s.scholarship_id, rank: i + 1 })),
      userId,
      variant,
      'browse',
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scholarships]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {scholarships.map(s => <TdScholarshipCard key={s.scholarship_id} scholarship={s} />)}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BrowsePage() {
  const { lang } = useLang();
  const b = translations.browse;
  const supabase = createClient();

  const [user, setUser]                 = useState<User | null>(null);
  const [activeTab, setActiveTab]       = useState<Tab>('browse');
  const [experimentVariant, setExperimentVariant] = useState<string | null>(null);
  // Track which scholarship_ids have already had an impression logged this session
  const loggedImpressions = useRef<Set<string>>(new Set());
  const [matchSortBy, setMatchSortBy]   = useState<MatchSortKey>('match');
  const [matchMinScore, setMatchMinScore] = useState<MinScore>(0);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [userProfile, setUserProfile]   = useState<StudentProfile | null>(null);

  // ── TD Scholarships state (single source of truth for all public scholarship data) ──
  const [tdScholarships, setTdScholarships] = useState<TdScholarship[]>([]);
  const [tdLoading, setTdLoading]           = useState(true);
  const [tdSearch, setTdSearch]             = useState('');
  const [tdLevelFilter, setTdLevelFilter]   = useState('');
  const [tdFunderFilter, setTdFunderFilter] = useState('');

  // ── Data load (td_scholarships is the single source of truth) ──────────────
  useEffect(() => {
    // Load all publicly-visible scholarships from the TD table
    void supabase
      .from('td_scholarships')
      .select('scholarship_id, scholarship_name, funder, funder_type, level, field_of_study, award_amount_thb, region_eligibility, targets_low_income, num_recipients, min_gpa, income_cap_thb, language, deadline_raw, status, application_link, deadline_date, deadline_is_rolling, deadline_note, stale, is_displayed')
      .eq('is_displayed', true)
      .order('scholarship_name')
      .then(({ data }) => {
        setTdScholarships((data ?? []) as TdScholarship[]);
        setTdLoading(false);
      });

    // Load session + user profile for the matches tab
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
          let arm = (profile.ab_arm ?? null) as 'treatment' | 'control' | null;
          if (!arm) {
            arm = assignAbArm(authUser.id);
            void supabase
              .from('profiles')
              .update({ ab_arm: arm, ab_assigned_at: new Date().toISOString() })
              .eq('id', authUser.id);
          }
          const incomeBracket = profile.income_bracket ?? 4;
          setUserResearchContext(arm, incomeBracket);
          // Sticky experiment assignment for causal inference
          getOrAssignVariant(authUser.id, RANKING_EXPERIMENT).then(v => setExperimentVariant(v));
          setUserProfile({
            province_id:        profile.province_id      ?? '',
            income_bracket:     incomeBracket,
            gpa:                parseFloat(profile.gpa ?? '3.0'),
            fields_of_interest: profile.fields_of_interest ?? ['any'],
            welfare_card:       profile.welfare_card     ?? false,
            grade_level:        profile.grade_level      ?? '',
            ab_arm:             arm,
          });
        }
      } catch {
        // silently ignore
      } finally {
        setMatchesLoading(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Adapter: map TdScholarship fields to what scoreOne() expects ────────────
  function tdToScorable(td: TdScholarship): Record<string, unknown> {
    // grade_levels array from the TD level text field
    const levelToGrades: Record<string, string[]> = {
      'High school':  ['M4', 'M5', 'M6'],
      'Undergraduate': ['uni'],
      "Master's":     ['graduate'],
      'PhD':          ['graduate'],
      'Multiple':     [],
    };
    const grade_levels = td.level ? (levelToGrades[td.level] ?? []) : [];

    // province_restriction from region_eligibility text
    const reg = (td.region_eligibility ?? '').toLowerCase();
    const province_restriction =
      !reg || reg.includes('national') || reg.includes('ทั่วประเทศ') || reg.includes('all')
        ? ['national']
        : [td.region_eligibility ?? ''];

    // field_of_study: split comma-delimited text into array
    const field_of_study = td.field_of_study
      ? td.field_of_study.split(',').map((f) => f.trim()).filter(Boolean)
      : [];

    // income_cap_thb in the TD table is annual THB; scorer uses monthly
    const max_income_thb = td.income_cap_thb ? Math.round(td.income_cap_thb / 12) : null;

    return {
      id:                   td.scholarship_id,
      min_gpa:              td.min_gpa ?? null,
      max_income_thb,
      welfare_card_priority: td.targets_low_income ?? false,
      field_of_study,
      province_restriction,
      grade_levels,
      historical_bias_score: 0.5,
      amount_thb:           null,
      deadline_date:        td.deadline_date ?? null,
    };
  }

  // ── Compute matches from TD data ────────────────────────────────────────────
  const allMatches = useMemo((): ScoredTdScholarship[] => {
    if (!userProfile || tdScholarships.length === 0) return [];
    const results: ScoredTdScholarship[] = [];
    for (const td of tdScholarships) {
      const scored = scoreOne(tdToScorable(td), userProfile);
      if (scored) {
        results.push({
          ...td,
          rawScore:      scored.rawScore,
          fairnessScore: scored.fairnessScore,
          boosted:       scored.boosted,
          reasons:       scored.reasons,
          reasons_en:    scored.reasons_en,
        });
      }
    }
    const isControl = userProfile.ab_arm === 'control';
    results.sort((a, b) => {
      const scoreA = isControl ? a.rawScore : a.fairnessScore;
      const scoreB = isControl ? b.rawScore : b.fairnessScore;
      return scoreB - scoreA;
    });
    return results;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, tdScholarships]);

  // ── Apply match filter + sort ───────────────────────────────────────────────
  const visibleMatches = useMemo((): (ScoredTdScholarship & { displayRank: number })[] => {
    const f = allMatches.filter((s) => s.fairnessScore >= matchMinScore);
    const sorted = [...f].sort((a, b) => {
      switch (matchSortBy) {
        case 'match':    return b.fairnessScore - a.fairnessScore;
        case 'deadline': {
          if (!a.deadline_date && !b.deadline_date) return 0;
          if (!a.deadline_date) return 1;
          if (!b.deadline_date) return -1;
          return new Date(a.deadline_date).getTime() - new Date(b.deadline_date).getTime();
        }
        case 'name': return (a.scholarship_name ?? '').localeCompare(b.scholarship_name ?? '', 'th');
        default:     return 0;
      }
    });
    return sorted.map((s, i) => ({ ...s, displayRank: i + 1 }));
  }, [allMatches, matchSortBy, matchMinScore]);

  // Research: log matching results viewed (legacy user_events — kept for continuity)
  useEffect(() => {
    if (allMatches.length > 0) {
      logMatchingResultsViewed(allMatches.length, allMatches[0]?.scholarship_id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatches]);

  // Research: log view_list when tab changes
  useEffect(() => {
    logFunnelEvent({
      eventType: 'view_list',
      userId: user?.id ?? null,
      context: { tab: activeTab, variant: experimentVariant },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Research: log one impression per visible match card (rank + variant = exposure signal)
  useEffect(() => {
    if (!visibleMatches.length || activeTab !== 'matches') return;
    const fresh = visibleMatches.filter(s => !loggedImpressions.current.has(s.scholarship_id));
    if (!fresh.length) return;
    fresh.forEach(s => loggedImpressions.current.add(s.scholarship_id));
    logImpressions(
      fresh.map(s => ({ scholarshipId: s.scholarship_id, rank: s.displayRank })),
      user?.id ?? null,
      experimentVariant,
      'matches',
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMatches]);

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-white dark:bg-[#000000] min-h-screen">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="bg-[#F5F7FA] dark:bg-[#0A1628] border-b border-[#E5E5EA] dark:border-[#1A2E4A]">
        <div className="max-w-[1200px] mx-auto px-6 py-12">
          <h1
            className="text-3xl md:text-4xl text-[#1D1D1F] dark:text-white mb-3"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif', fontWeight: 300 }}
          >
            {b.title[lang]}
          </h1>
          <p className="text-[#6E6E73] dark:text-[#8E8E93]">{b.subtitle[lang]}</p>

          <div className="flex gap-1 mt-6 bg-[#EAEAEC] dark:bg-[#232B3E] rounded-[10px] p-1 w-fit">
            {(user ? ['matches', 'browse'] as Tab[] : ['browse'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-5 py-2 text-sm font-medium rounded-[8px] transition-all duration-200 ${
                  activeTab === t
                    ? 'bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white shadow-sm'
                    : 'text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white'
                }`}
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
              >
                {t === 'matches' ? b.tabMatches[lang] : (lang === 'th' ? 'ทุนทั้งหมด' : 'All Scholarships')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-10">

        {/* ── Login banner ─────────────────────────────────────────────────── */}
        {!user && !tdLoading && tdScholarships.length > 0 && (
          <div className="mb-8 flex items-center justify-between gap-4 bg-[#EFF4FF] dark:bg-[#162552] border border-[#2E6BE6]/30 rounded-[12px] px-6 py-4">
            <p className="text-sm text-[#1D1D1F] dark:text-[#F5F5F7]"
               style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
              {b.loginBanner[lang]}
            </p>
            <a href="/auth?from=signup" className="text-sm font-semibold text-[#1B3A6B] hover:underline shrink-0">
              {b.loginBannerCta[lang]}
            </a>
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
                  <div key={i} className="h-64 bg-[#F5F7FA] dark:bg-[#0A1628] rounded-[12px] animate-pulse" />
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
                      className="bg-[#1B3A6B] text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-[#2E5FA3] transition-colors">
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
                        className="px-5 py-2.5 bg-[#1B3A6B] text-white rounded-full text-sm font-semibold hover:bg-[#2E5FA3] transition-colors">
                    {lang === 'th' ? 'อัปเดตโปรไฟล์' : 'Update Profile'}
                  </Link>
                  <button
                    onClick={() => setActiveTab('browse')}
                    className="px-5 py-2.5 border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-full text-sm text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6] hover:text-[#1B3A6B] transition-colors"
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
                      className="px-5 py-2.5 bg-[#1B3A6B] text-white rounded-full text-sm font-semibold hover:bg-[#2E5FA3] transition-colors"
                    >
                      {matchMinScore === 0.9
                        ? (lang === 'th' ? 'ดูทุน 70%+' : 'Show 70%+ matches')
                        : matchMinScore === 0.7
                        ? (lang === 'th' ? 'ดูทุน 50%+' : 'Show 50%+ matches')
                        : (lang === 'th' ? 'ดูทุนทั้งหมด' : 'Show all matches')}
                    </button>
                  </div>
                ) : (
                  /* Match grid — TdScholarshipCard used for all scholarship rendering */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleMatches.map((s) => (
                      <TdScholarshipCard key={s.scholarship_id} scholarship={s} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            BROWSE TAB — td_scholarships (single source of truth)
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'browse' && (
          <div>
            {/* Filters row */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ADADB8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={tdSearch}
                  onChange={e => {
                    setTdSearch(e.target.value);
                    if (e.target.value.length >= 2) {
                      logFunnelEvent({ eventType: 'search', userId: user?.id ?? null, context: { query: e.target.value, tab: 'browse', variant: experimentVariant } });
                      logSearchPerformed(e.target.value, tdScholarships.length);
                    }
                  }}
                  placeholder={lang === 'th' ? 'ค้นหาชื่อทุน หรือผู้ให้ทุน...' : 'Search scholarships or funder...'}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[10px] bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white placeholder-[#ADADB8] focus:outline-none focus:border-[#2E6BE6] transition-colors"
                />
              </div>
              <select
                value={tdLevelFilter}
                onChange={e => setTdLevelFilter(e.target.value)}
                className="px-3 py-2.5 text-sm border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[10px] bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white focus:outline-none"
              >
                <option value="">{lang === 'th' ? 'ทุกระดับ' : 'All levels'}</option>
                {['High school', 'Undergraduate', "Master's", 'PhD', 'Multiple'].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <select
                value={tdFunderFilter}
                onChange={e => setTdFunderFilter(e.target.value)}
                className="px-3 py-2.5 text-sm border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[10px] bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white focus:outline-none"
              >
                <option value="">{lang === 'th' ? 'ทุกประเภทผู้ให้ทุน' : 'All funder types'}</option>
                {['Thai University', 'Thai Government / Royal', 'Corporate / Bank / Foundation', 'International (open to Thais)'].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {tdLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-56 bg-[#F5F7FA] dark:bg-[#0A1628] rounded-[12px] animate-pulse" />
                ))}
              </div>
            ) : (() => {
              const q = tdSearch.toLowerCase();
              const visible = tdScholarships.filter(s =>
                (!tdLevelFilter || s.level === tdLevelFilter) &&
                (!tdFunderFilter || s.funder_type === tdFunderFilter) &&
                (!q || s.scholarship_name.toLowerCase().includes(q) || s.funder.toLowerCase().includes(q))
              );
              return visible.length === 0 ? (
                <div className="text-center py-24">
                  <div className="text-4xl mb-4">🎓</div>
                  <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2">
                    {lang === 'th' ? 'ไม่พบทุน' : 'No scholarships found'}
                  </h3>
                  <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]">
                    {lang === 'th' ? 'ลองเปลี่ยนตัวกรองหรือนำเข้าข้อมูลในหน้า Admin' : 'Try adjusting your filters or import data via Admin'}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-5">
                    {visible.length} {lang === 'th' ? 'ทุน' : 'scholarships'}
                  </p>
                  <BrowseGrid
                    scholarships={visible}
                    userId={user?.id ?? null}
                    variant={experimentVariant}
                    loggedImpressions={loggedImpressions}
                  />
                </>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
}
