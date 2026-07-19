'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { translations } from '@/lib/translations';
import type { User } from '@supabase/supabase-js';
import { logMatchingResultsViewed, logSearchPerformed, setUserResearchContext, assignAbArm } from '@/lib/research/events';
import { logFunnelEvent, logImpressions } from '@/lib/research/funnel';
import { getOrAssignVariant, RANKING_EXPERIMENT } from '@/lib/research/experiment';
import type { TdScholarship, TdAwardValueTier } from '@/lib/tdScholarships/types';
import TdScholarshipCard from '@/components/TdScholarshipCard';
import type { TdCardMatchInfo } from '@/components/TdScholarshipCard';
import { recommend } from '@/lib/recommender';
import type { RecommenderProfile, FairnessMode } from '@/lib/recommender';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab          = 'matches' | 'browse';
type MatchSortKey = 'match' | 'deadline' | 'name';
type BrowseSortKey = 'deadline' | 'name' | 'tier';
type MinScore     = 0 | 0.5 | 0.7 | 0.9;

interface StudentProfile {
  province_id: string;
  income_bracket: number;
  gpa: number;
  fields_of_interest: string[];
  welfare_card: boolean;
  grade_level: string;
  ab_arm: 'treatment' | 'control' | null;
}

type ScoredTdScholarship = TdScholarship & {
  rawScore: number;
  fairnessScore: number;
  boosted: boolean;
  reasons: string[];
  reasons_en: string[];
  explanation: string;
  explanation_en: string;
};

// ── Award tier label (for active filter chip display) ─────────────────────────

const TIER_LABEL: Record<TdAwardValueTier, { th: string; en: string }> = {
  full_ride:    { th: 'ทุนเต็มจำนวน',    en: 'Full-ride'    },
  full_tuition: { th: 'ค่าเล่าเรียนเต็ม', en: 'Full-tuition' },
  large:        { th: 'ทุนขนาดใหญ่',     en: 'Large'        },
  medium:       { th: 'ทุนขนาดกลาง',     en: 'Medium'       },
  small:        { th: 'ทุนขนาดเล็ก',     en: 'Small'        },
  stipend_only: { th: 'ค่าครองชีพ',       en: 'Stipend only' },
};

const LEVEL_LABEL: Record<string, { th: string; en: string }> = {
  'High school':   { th: 'มัธยม',     en: 'High School' },
  'Undergraduate': { th: 'ป.ตรี',     en: "Bachelor's"  },
  "Master's":      { th: 'ป.โท',      en: "Master's"    },
  'PhD':           { th: 'ป.เอก',     en: 'PhD'         },
  'Multiple':      { th: 'หลายระดับ', en: 'Multiple'    },
};

const FUNDER_LABEL: Record<string, { th: string; en: string }> = {
  'Thai University':               { th: 'มหาวิทยาลัย',   en: 'University'    },
  'Thai Government / Royal':       { th: 'รัฐบาล/ราชการ', en: 'Government'    },
  'Corporate / Bank / Foundation': { th: 'เอกชน/มูลนิธิ', en: 'Corporate'     },
  'International (open to Thais)': { th: 'นานาชาติ',       en: 'International' },
};

const TIER_SORT_ORDER: Record<string, number> = {
  full_ride: 0, full_tuition: 1, large: 2, medium: 3, small: 4, stipend_only: 5,
};

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
        onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-4 h-4 rounded-full bg-[#E5E5EA] dark:bg-[#3a3a3c] text-[#6E6E73] dark:text-[#8E8E93] text-[10px] font-bold flex items-center justify-center hover:bg-[#1B3A6B]/20 hover:text-[#1B3A6B] transition-colors ml-1 shrink-0"
        aria-label="Score info"
      >i</button>
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

// ── Match controls ─────────────────────────────────────────────────────────────

interface MatchControlsProps {
  total: number; visibleCount: number;
  sortBy: MatchSortKey; setSortBy: (v: MatchSortKey) => void;
  minScore: MinScore; setMinScore: (v: MinScore) => void;
  lang: string;
}

function MatchControls({ total, visibleCount, sortBy, setSortBy, minScore, setMinScore, lang }: MatchControlsProps) {
  const lo = lang as 'th' | 'en';
  const font = lo === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';

  const SORT_OPTS: { key: MatchSortKey; th: string; en: string }[] = [
    { key: 'match',    th: 'ความเหมาะสม', en: 'Best Match'    },
    { key: 'deadline', th: 'ใกล้หมดเขต',  en: 'Deadline Soon' },
    { key: 'name',     th: 'ก–ฮ ชื่อ',   en: 'A–Z Name'      },
  ];
  const SCORE_OPTS: { key: MinScore; label: string }[] = [
    { key: 0,   label: lo === 'th' ? 'ทั้งหมด' : 'All' },
    { key: 0.5, label: '50%+' },
    { key: 0.7, label: '70%+' },
    { key: 0.9, label: '90%+' },
  ];

  return (
    <div className="mb-6 space-y-4 bg-[#F5F7FA] dark:bg-[#0A1628] rounded-xl p-4 border border-[#E5E5EA] dark:border-[#1A2E4A]">
      <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]" style={{ fontFamily: font }}>
        {visibleCount === total
          ? (lo === 'th' ? `พบ ${total} ทุนที่ตรงกับคุณ` : `Found ${total} scholarships matching your profile`)
          : (lo === 'th'
              ? `แสดง ${visibleCount} ทุน (คะแนน ${Math.round(minScore * 100)}%+) จากทั้งหมด ${total} ทุน`
              : `Showing ${visibleCount} of ${total} (score ${Math.round(minScore * 100)}%+)`)}
        <ScoreTooltip lang={lang} />
      </p>

      <div className="flex flex-wrap gap-4">
        <div>
          <p className="text-[10px] text-[#aeaeb2] mb-2 font-semibold uppercase tracking-widest">{lo === 'th' ? 'เรียงตาม' : 'Sort by'}</p>
          <div className="flex flex-wrap gap-1.5">
            {SORT_OPTS.map(opt => (
              <button key={opt.key} onClick={() => setSortBy(opt.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  sortBy === opt.key
                    ? 'bg-[#1B3A6B] text-white shadow-sm'
                    : 'bg-white dark:bg-[#232B3E] border border-[#E5E5EA] dark:border-[#1A2E4A] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6] hover:text-[#1B3A6B]'
                }`} style={{ fontFamily: font }}>
                {opt[lo]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-[#aeaeb2] mb-2 font-semibold uppercase tracking-widest">{lo === 'th' ? 'แสดงเฉพาะ' : 'Show only'}</p>
          <div className="flex flex-wrap gap-1.5">
            {SCORE_OPTS.map(opt => (
              <button key={opt.key} onClick={() => setMinScore(opt.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  minScore === opt.key
                    ? 'bg-[#1D1D1F] dark:bg-[#F5F7FA] text-white dark:text-[#1D1D1F]'
                    : 'bg-white dark:bg-[#232B3E] border border-[#E5E5EA] dark:border-[#1A2E4A] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#1D1D1F]'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-2xl p-5 animate-pulse space-y-3">
      <div className="flex justify-between gap-2">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[#E5E5EA] dark:bg-[#1A2E4A] rounded w-4/5" />
          <div className="h-3 bg-[#E5E5EA] dark:bg-[#1A2E4A] rounded w-2/5" />
        </div>
        <div className="h-5 w-14 bg-[#E5E5EA] dark:bg-[#1A2E4A] rounded-full shrink-0" />
      </div>
      <div className="h-5 w-28 bg-[#E5E5EA] dark:bg-[#1A2E4A] rounded-full" />
      <div className="flex flex-wrap gap-1.5">
        {[60, 50, 70].map(w => (
          <div key={w} className={`h-5 w-${w === 60 ? '16' : w === 50 ? '14' : '20'} bg-[#E5E5EA] dark:bg-[#1A2E4A] rounded-full`} />
        ))}
      </div>
      <div className="h-3 w-32 bg-[#E5E5EA] dark:bg-[#1A2E4A] rounded" />
      <div className="pt-3 border-t border-[#F0F2F5] dark:border-[#1A2440] flex gap-2">
        <div className="flex-1 h-9 bg-[#E5E5EA] dark:bg-[#1A2E4A] rounded-lg" />
        <div className="w-20 h-9 bg-[#E5E5EA] dark:bg-[#1A2E4A] rounded-lg" />
      </div>
    </div>
  );
}

// ── Browse filter panel ───────────────────────────────────────────────────────

interface BrowseFilterPanelProps {
  open: boolean;
  lang: string;
  tdLevelFilter: string;       setTdLevelFilter: (v: string) => void;
  tdFunderFilter: string;      setTdFunderFilter: (v: string) => void;
  tdAwardTierFilter: string;   setTdAwardTierFilter: (v: string) => void;
  tdTargetsLowIncome: boolean; setTdTargetsLowIncome: (v: boolean) => void;
  tdWelfareCard: boolean;      setTdWelfareCard: (v: boolean) => void;
  tdRenewable: boolean;        setTdRenewable: (v: boolean) => void;
  tdBondObligation: boolean;   setTdBondObligation: (v: boolean) => void;
}

function BrowseFilterPanel({ open, lang, tdLevelFilter, setTdLevelFilter, tdFunderFilter, setTdFunderFilter,
    tdAwardTierFilter, setTdAwardTierFilter, tdTargetsLowIncome, setTdTargetsLowIncome,
    tdWelfareCard, setTdWelfareCard, tdRenewable, setTdRenewable,
    tdBondObligation, setTdBondObligation }: BrowseFilterPanelProps) {

  const lo = lang as 'th' | 'en';
  const sel = 'w-full px-3 py-2 text-sm border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-lg bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#2E6BE6]';

  if (!open) return null;
  return (
    <div className="mt-3 bg-[#F5F7FA] dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-xl p-4 space-y-4">
      {/* Dropdowns row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-widest mb-1">
            {lo === 'th' ? 'ระดับการศึกษา' : 'Level'}
          </label>
          <select value={tdLevelFilter} onChange={e => setTdLevelFilter(e.target.value)} className={sel}>
            <option value="">{lo === 'th' ? 'ทุกระดับ' : 'All levels'}</option>
            {['High school', 'Undergraduate', "Master's", 'PhD', 'Multiple'].map(l => (
              <option key={l} value={l}>{LEVEL_LABEL[l]?.[lo] ?? l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-widest mb-1">
            {lo === 'th' ? 'ประเภทผู้ให้ทุน' : 'Funder type'}
          </label>
          <select value={tdFunderFilter} onChange={e => setTdFunderFilter(e.target.value)} className={sel}>
            <option value="">{lo === 'th' ? 'ทุกประเภท' : 'All types'}</option>
            {Object.entries(FUNDER_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v[lo]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-widest mb-1">
            {lo === 'th' ? 'มูลค่าทุน' : 'Award tier'}
          </label>
          <select value={tdAwardTierFilter} onChange={e => setTdAwardTierFilter(e.target.value)} className={sel}>
            <option value="">{lo === 'th' ? 'ทุกมูลค่า' : 'All tiers'}</option>
            {(Object.keys(TIER_LABEL) as TdAwardValueTier[]).map(k => (
              <option key={k} value={k}>{TIER_LABEL[k][lo]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Boolean toggles */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: 'low_income',  label: { th: 'นักเรียนรายได้น้อย',  en: 'Low-income priority' }, value: tdTargetsLowIncome,  set: setTdTargetsLowIncome },
          { key: 'welfare',     label: { th: 'บัตรสวัสดิการ',        en: 'Welfare card'         }, value: tdWelfareCard,        set: setTdWelfareCard       },
          { key: 'renewable',   label: { th: 'ต่ออายุได้',           en: 'Renewable'            }, value: tdRenewable,          set: setTdRenewable         },
          { key: 'bond',        label: { th: 'มีข้อผูกพัน',          en: 'Has bond/obligation'  }, value: tdBondObligation,     set: setTdBondObligation    },
        ] as const).map(({ key, label, value, set }) => (
          <button
            key={key}
            onClick={() => set(!value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              value
                ? 'bg-[#1B3A6B] text-white'
                : 'bg-white dark:bg-[#232B3E] border border-[#E5E5EA] dark:border-[#1A2E4A] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6] hover:text-[#1B3A6B]'
            }`}
          >
            {value && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
            {label[lo]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const { lang } = useLang();
  const lo = lang as 'th' | 'en';
  const b = translations.browse;
  const supabase = createClient();
  const font = lo === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';

  const [user, setUser]                             = useState<User | null>(null);
  const [activeTab, setActiveTab]                   = useState<Tab>('browse');
  const [experimentVariant, setExperimentVariant]   = useState<string | null>(null);
  const loggedImpressions                           = useRef<Set<string>>(new Set());

  // Matches tab state
  const [matchSortBy, setMatchSortBy]               = useState<MatchSortKey>('match');
  const [matchMinScore, setMatchMinScore]           = useState<MinScore>(0);
  const [matchesLoading, setMatchesLoading]         = useState(false);
  const [userProfile, setUserProfile]               = useState<StudentProfile | null>(null);

  // Scholarship data (single source for both tabs)
  const [tdScholarships, setTdScholarships]         = useState<TdScholarship[]>([]);
  const [tdLoading, setTdLoading]                   = useState(true);

  // Browse filters
  const [tdSearch, setTdSearch]                     = useState('');
  const [tdLevelFilter, setTdLevelFilter]           = useState('');
  const [tdFunderFilter, setTdFunderFilter]         = useState('');
  const [tdAwardTierFilter, setTdAwardTierFilter]   = useState('');
  const [tdTargetsLowIncome, setTdTargetsLowIncome] = useState(false);
  const [tdWelfareCard, setTdWelfareCard]           = useState(false);
  const [tdRenewable, setTdRenewable]               = useState(false);
  const [tdBondObligation, setTdBondObligation]     = useState(false);
  const [tdSortBy, setTdSortBy]                     = useState<BrowseSortKey>('deadline');
  const [filtersOpen, setFiltersOpen]               = useState(false);

  // ── Data load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    void supabase
      .from('td_scholarships')
      .select([
        'scholarship_id',
        'scholarship_name_en', 'scholarship_name_th', 'scholarship_name',
        'funder_en', 'funder_th', 'funder',
        'funder_type', 'level', 'field_of_study',
        'award_value_tier', 'award_amount_thb_numeric', 'award_type',
        'renewable', 'bond_obligation',
        'region_eligibility', 'targets_low_income', 'welfare_card_priority',
        'income_cap_thb', 'num_recipients', 'min_gpa', 'english_requirement',
        'deadline_raw', 'deadline_date', 'deadline_is_rolling', 'deadline_note',
        'status', 'application_url', 'application_link',
        'is_displayed', 'stale', 'source_language', 'translation_review',
      ].join(', '))
      .eq('is_displayed', true)
      .order('scholarship_name_en')
      .then(({ data }) => {
        setTdScholarships((data ?? []) as unknown as TdScholarship[]);
        setTdLoading(false);
      });

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
            void supabase.from('profiles').update({ ab_arm: arm, ab_assigned_at: new Date().toISOString() }).eq('id', authUser.id);
          }
          const incomeBracket = profile.income_bracket ?? 4;
          setUserResearchContext(arm, incomeBracket);
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
      } catch { /* silently ignore */ }
      finally { setMatchesLoading(false); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recommender (matches tab) ──────────────────────────────────────────────
  const allMatches = useMemo((): ScoredTdScholarship[] => {
    if (!userProfile || !tdScholarships.length) return [];
    const recProfile: RecommenderProfile = {
      user_id:               user?.id ?? '',
      province_id:           userProfile.province_id,
      income_bracket:        userProfile.income_bracket,
      gpa:                   userProfile.gpa,
      grade_level:           userProfile.grade_level,
      fields_of_interest:    userProfile.fields_of_interest,
      welfare_card:          userProfile.welfare_card,
      region:                null, area_type: null,
      household_income_band: null, intended_level: null, intended_field: null,
    };
    const fairnessMode: FairnessMode = experimentVariant === 'treatment' ? 'on' : 'off';
    const result = recommend(tdScholarships, recProfile, {
      fairness_mode: fairnessMode, variant: experimentVariant ?? 'control', limit: 50,
    });
    return result.items.map(item => ({
      ...item.scholarship,
      rawScore:       Math.round(item.raw_score      * 1000) / 1000,
      fairnessScore:  Math.round(item.fairness_score * 1000) / 1000,
      boosted:        item.fairness_boosted,
      reasons:        item.reasons,
      reasons_en:     item.reasons_en,
      explanation:    item.explanation,
      explanation_en: item.explanation_en,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, tdScholarships, experimentVariant]);

  const visibleMatches = useMemo((): (ScoredTdScholarship & { displayRank: number })[] => {
    const filtered = allMatches.filter(s => s.fairnessScore >= matchMinScore);
    const sorted = [...filtered].sort((a, b) => {
      if (matchSortBy === 'match')    return b.fairnessScore - a.fairnessScore;
      if (matchSortBy === 'deadline') {
        if (!a.deadline_date && !b.deadline_date) return 0;
        if (!a.deadline_date) return 1;
        if (!b.deadline_date) return -1;
        return new Date(a.deadline_date).getTime() - new Date(b.deadline_date).getTime();
      }
      if (matchSortBy === 'name') {
        const na = lo === 'th' ? (a.scholarship_name_th ?? a.scholarship_name ?? '') : (a.scholarship_name_en ?? a.scholarship_name ?? '');
        const nb = lo === 'th' ? (b.scholarship_name_th ?? b.scholarship_name ?? '') : (b.scholarship_name_en ?? b.scholarship_name ?? '');
        return na.localeCompare(nb, lo === 'th' ? 'th' : 'en');
      }
      return 0;
    });
    return sorted.map((s, i) => ({ ...s, displayRank: i + 1 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatches, matchSortBy, matchMinScore, lo]);

  // ── Browse filter + sort (memoized) ───────────────────────────────────────
  const browseVisible = useMemo((): TdScholarship[] => {
    let items = [...tdScholarships];
    const q = tdSearch.trim().toLowerCase();

    if (q) {
      items = items.filter(s =>
        [s.scholarship_name_en, s.scholarship_name_th, s.scholarship_name, s.funder_en, s.funder_th, s.funder]
          .some(v => v?.toLowerCase().includes(q))
      );
    }
    if (tdLevelFilter)      items = items.filter(s => s.level === tdLevelFilter);
    if (tdFunderFilter)     items = items.filter(s => s.funder_type === tdFunderFilter);
    if (tdAwardTierFilter)  items = items.filter(s => s.award_value_tier === tdAwardTierFilter);
    if (tdTargetsLowIncome) items = items.filter(s => s.targets_low_income);
    if (tdWelfareCard)      items = items.filter(s => s.welfare_card_priority);
    if (tdRenewable)        items = items.filter(s => s.renewable);
    if (tdBondObligation)   items = items.filter(s => s.bond_obligation);

    if (tdSortBy === 'deadline') {
      items.sort((a, b) => {
        if (!a.deadline_date && !b.deadline_date) return 0;
        if (!a.deadline_date) return 1;
        if (!b.deadline_date) return -1;
        const da = new Date(a.deadline_date).getTime() - Date.now();
        const db = new Date(b.deadline_date).getTime() - Date.now();
        if (da < 0 && db >= 0) return 1;
        if (da >= 0 && db < 0) return -1;
        return da - db;
      });
    } else if (tdSortBy === 'name') {
      items.sort((a, b) => {
        const na = lo === 'th' ? (a.scholarship_name_th ?? a.scholarship_name_en ?? '') : (a.scholarship_name_en ?? a.scholarship_name_th ?? '');
        const nb = lo === 'th' ? (b.scholarship_name_th ?? b.scholarship_name_en ?? '') : (b.scholarship_name_en ?? b.scholarship_name_th ?? '');
        return na.localeCompare(nb, lo === 'th' ? 'th' : 'en');
      });
    } else if (tdSortBy === 'tier') {
      items.sort((a, b) => {
        const ta = a.award_value_tier ? (TIER_SORT_ORDER[a.award_value_tier] ?? 99) : 99;
        const tb = b.award_value_tier ? (TIER_SORT_ORDER[b.award_value_tier] ?? 99) : 99;
        return ta - tb;
      });
    }

    return items;
  }, [tdScholarships, tdSearch, tdLevelFilter, tdFunderFilter, tdAwardTierFilter,
      tdTargetsLowIncome, tdWelfareCard, tdRenewable, tdBondObligation, tdSortBy, lo]);

  // ── Active filter chips ────────────────────────────────────────────────────
  const activeFilters: { key: string; label: string; clear: () => void }[] = [
    ...(tdLevelFilter ? [{ key: 'level', label: `${lo === 'th' ? 'ระดับ' : 'Level'}: ${LEVEL_LABEL[tdLevelFilter]?.[lo] ?? tdLevelFilter}`, clear: () => setTdLevelFilter('') }] : []),
    ...(tdFunderFilter ? [{ key: 'funder', label: FUNDER_LABEL[tdFunderFilter]?.[lo] ?? tdFunderFilter, clear: () => setTdFunderFilter('') }] : []),
    ...(tdAwardTierFilter ? [{ key: 'tier', label: TIER_LABEL[tdAwardTierFilter as TdAwardValueTier]?.[lo] ?? tdAwardTierFilter, clear: () => setTdAwardTierFilter('') }] : []),
    ...(tdTargetsLowIncome ? [{ key: 'low', label: lo === 'th' ? 'รายได้น้อย' : 'Low-income', clear: () => setTdTargetsLowIncome(false) }] : []),
    ...(tdWelfareCard      ? [{ key: 'welfare', label: lo === 'th' ? 'บัตรสวัสดิการ' : 'Welfare card', clear: () => setTdWelfareCard(false) }] : []),
    ...(tdRenewable        ? [{ key: 'renew', label: lo === 'th' ? 'ต่ออายุได้' : 'Renewable', clear: () => setTdRenewable(false) }] : []),
    ...(tdBondObligation   ? [{ key: 'bond', label: lo === 'th' ? 'มีข้อผูกพัน' : 'Bond obligation', clear: () => setTdBondObligation(false) }] : []),
  ];

  function clearAllFilters() {
    setTdSearch(''); setTdLevelFilter(''); setTdFunderFilter(''); setTdAwardTierFilter('');
    setTdTargetsLowIncome(false); setTdWelfareCard(false); setTdRenewable(false); setTdBondObligation(false);
  }

  // ── Research events ────────────────────────────────────────────────────────

  useEffect(() => {
    if (allMatches.length > 0) logMatchingResultsViewed(allMatches.length, allMatches[0]?.scholarship_id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatches]);

  useEffect(() => {
    logFunnelEvent({ eventType: 'view_list', userId: user?.id ?? null, context: { tab: activeTab, variant: experimentVariant } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Log impressions for match cards (rank + scores for causal paper)
  useEffect(() => {
    if (!visibleMatches.length || activeTab !== 'matches') return;
    const fresh = visibleMatches.filter(s => !loggedImpressions.current.has(s.scholarship_id));
    if (!fresh.length) return;
    fresh.forEach(s => loggedImpressions.current.add(s.scholarship_id));
    logImpressions(
      fresh.map(s => ({ scholarshipId: s.scholarship_id, rank: s.displayRank, rawScore: s.rawScore, fairnessScore: s.fairnessScore })),
      user?.id ?? null, experimentVariant, 'matches',
      experimentVariant === 'treatment' ? 'on' : 'off',
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMatches]);

  // Log impressions for browse cards (rank = position in filtered+sorted list)
  useEffect(() => {
    if (activeTab !== 'browse' || !browseVisible.length) return;
    const fresh = browseVisible.filter(s => !loggedImpressions.current.has(s.scholarship_id));
    if (!fresh.length) return;
    fresh.forEach(s => loggedImpressions.current.add(s.scholarship_id));
    logImpressions(
      fresh.map((s, i) => ({ scholarshipId: s.scholarship_id, rank: i + 1 })),
      user?.id ?? null, experimentVariant, 'browse',
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseVisible, activeTab]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-[#000000] min-h-screen">

      {/* ── Page header ── */}
      <div className="bg-[#F5F7FA] dark:bg-[#0A1628] border-b border-[#E5E5EA] dark:border-[#1A2E4A]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
          <h1
            className="text-3xl md:text-4xl text-[#1D1D1F] dark:text-white mb-2"
            style={{ fontFamily: font, fontWeight: 300 }}
          >
            {b.title[lang]}
          </h1>
          <p className="text-[#6E6E73] dark:text-[#8E8E93] text-sm" style={{ fontFamily: font }}>{b.subtitle[lang]}</p>

          {/* Tabs */}
          <div className="flex gap-1 mt-5 bg-[#EAEAEC] dark:bg-[#232B3E] rounded-[10px] p-1 w-fit">
            {(user ? ['matches', 'browse'] as Tab[] : ['browse'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-5 py-2 text-sm font-medium rounded-[8px] transition-all duration-200 ${
                  activeTab === t
                    ? 'bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white shadow-sm'
                    : 'text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white'
                }`}
                style={{ fontFamily: font }}
              >
                {t === 'matches' ? b.tabMatches[lang] : (lo === 'th' ? 'ทุนทั้งหมด' : 'All Scholarships')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">

        {/* Login banner (browse only, unauthenticated) */}
        {!user && !tdLoading && tdScholarships.length > 0 && (
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#EFF4FF] dark:bg-[#162552] border border-[#2E6BE6]/30 rounded-xl px-5 py-4">
            <p className="text-sm text-[#1D1D1F] dark:text-[#F5F5F7]" style={{ fontFamily: font }}>
              {b.loginBanner[lang]}
            </p>
            <a href="/auth?from=signup" className="text-sm font-semibold text-[#1B3A6B] dark:text-[#4A7FD4] hover:underline shrink-0" style={{ fontFamily: font }}>
              {b.loginBannerCta[lang]}
            </a>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MY MATCHES TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'matches' && user && (
          <div>
            {matchesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
              </div>

            ) : !userProfile ? (
              <div className="flex flex-col items-center py-24 text-center">
                <div className="text-5xl mb-5">📋</div>
                <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2" style={{ fontFamily: font }}>
                  {b.completeProfile[lang]}
                </h3>
                <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] max-w-xs mb-6" style={{ fontFamily: font }}>
                  {b.completeProfileSub[lang]}
                </p>
                <Link href="/profile/setup"
                  className="bg-[#1B3A6B] text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-[#2E5FA3] transition-colors"
                  style={{ fontFamily: font }}>
                  {lo === 'th' ? 'กรอกโปรไฟล์' : 'Set up profile'}
                </Link>
              </div>

            ) : allMatches.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-center">
                <div className="text-5xl mb-5">🔍</div>
                <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2" style={{ fontFamily: font }}>
                  {lo === 'th' ? 'ไม่พบทุนที่ตรงกับโปรไฟล์ปัจจุบัน' : 'No matches for your current profile'}
                </h3>
                <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] max-w-xs mb-6 leading-relaxed" style={{ fontFamily: font }}>
                  {lo === 'th' ? 'ลองปรับเกรดหรือเพิ่มสาขาที่สนใจในโปรไฟล์ของคุณ' : 'Try updating your GPA or adding more fields of interest'}
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <Link href="/profile/setup"
                    className="px-5 py-2.5 bg-[#1B3A6B] text-white rounded-full text-sm font-semibold hover:bg-[#2E5FA3] transition-colors"
                    style={{ fontFamily: font }}>
                    {lo === 'th' ? 'อัปเดตโปรไฟล์' : 'Update Profile'}
                  </Link>
                  <button onClick={() => setActiveTab('browse')}
                    className="px-5 py-2.5 border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-full text-sm text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6] hover:text-[#1B3A6B] transition-colors"
                    style={{ fontFamily: font }}>
                    {lo === 'th' ? 'ดูทุนทั้งหมด' : 'Browse All'}
                  </button>
                </div>
              </div>

            ) : (
              <>
                <MatchControls
                  total={allMatches.length} visibleCount={visibleMatches.length}
                  sortBy={matchSortBy} setSortBy={setMatchSortBy}
                  minScore={matchMinScore} setMinScore={setMatchMinScore}
                  lang={lang}
                />
                {visibleMatches.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-center">
                    <div className="text-4xl mb-4">🔍</div>
                    <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2" style={{ fontFamily: font }}>
                      {lo === 'th'
                        ? `ไม่มีทุนที่ตรงถึง ${Math.round(matchMinScore * 100)}%`
                        : `No scholarships match ${Math.round(matchMinScore * 100)}%+ for your profile`}
                    </h3>
                    <button
                      onClick={() => setMatchMinScore(matchMinScore === 0.9 ? 0.7 : matchMinScore === 0.7 ? 0.5 : 0)}
                      className="mt-4 px-5 py-2.5 bg-[#1B3A6B] text-white rounded-full text-sm font-semibold hover:bg-[#2E5FA3] transition-colors"
                      style={{ fontFamily: font }}>
                      {lo === 'th' ? 'ลดเกณฑ์คะแนน' : 'Lower score threshold'}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {visibleMatches.map(s => (
                      <TdScholarshipCard
                        key={s.scholarship_id}
                        scholarship={s}
                        matchInfo={{ score: s.fairnessScore, reasons: s.reasons, reasons_en: s.reasons_en }}
                        userId={user?.id ?? null}
                        variant={experimentVariant}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            BROWSE TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'browse' && (
          <div>
            {/* Search + filter toggle row */}
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
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
                  placeholder={lo === 'th' ? 'ค้นหาชื่อทุน หรือผู้ให้ทุน...' : 'Search scholarships or funder...'}
                  aria-label={lo === 'th' ? 'ค้นหาทุน' : 'Search scholarships'}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-xl bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white placeholder-[#ADADB8] focus:outline-none focus:border-[#2E6BE6] transition-colors"
                  style={{ fontFamily: font }}
                />
              </div>
              <button
                onClick={() => setFiltersOpen(v => !v)}
                aria-expanded={filtersOpen}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                  filtersOpen || activeFilters.length > 0
                    ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]'
                    : 'bg-white dark:bg-[#0A1628] border-[#E5E5EA] dark:border-[#1A2E4A] text-[#1D1D1F] dark:text-white hover:border-[#2E6BE6]'
                }`}
                style={{ fontFamily: font }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                {lo === 'th' ? 'ตัวกรอง' : 'Filters'}
                {activeFilters.length > 0 && (
                  <span className="bg-white/20 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilters.length}
                  </span>
                )}
              </button>
            </div>

            {/* Collapsible filter panel */}
            <BrowseFilterPanel
              open={filtersOpen} lang={lang}
              tdLevelFilter={tdLevelFilter} setTdLevelFilter={setTdLevelFilter}
              tdFunderFilter={tdFunderFilter} setTdFunderFilter={setTdFunderFilter}
              tdAwardTierFilter={tdAwardTierFilter} setTdAwardTierFilter={setTdAwardTierFilter}
              tdTargetsLowIncome={tdTargetsLowIncome} setTdTargetsLowIncome={setTdTargetsLowIncome}
              tdWelfareCard={tdWelfareCard} setTdWelfareCard={setTdWelfareCard}
              tdRenewable={tdRenewable} setTdRenewable={setTdRenewable}
              tdBondObligation={tdBondObligation} setTdBondObligation={setTdBondObligation}
            />

            {/* Active filter chips */}
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {activeFilters.map(f => (
                  <button
                    key={f.key}
                    onClick={f.clear}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#1B3A6B] text-white hover:bg-[#2E5FA3] transition-colors"
                    style={{ fontFamily: font }}
                  >
                    {f.label}
                    <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ))}
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1B3A6B] dark:hover:text-[#4A7FD4] transition-colors ml-1"
                  style={{ fontFamily: font }}
                >
                  {lo === 'th' ? 'ล้างทั้งหมด' : 'Clear all'}
                </button>
              </div>
            )}

            {/* Sort + result count row */}
            {!tdLoading && (
              <div className="flex flex-wrap items-center justify-between gap-3 mt-4 mb-5">
                <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]" style={{ fontFamily: font }}>
                  {lo === 'th' ? `พบ ${browseVisible.length} ทุน` : `${browseVisible.length} scholarships`}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[#ADADB8] font-semibold uppercase tracking-wider">{lo === 'th' ? 'เรียง' : 'Sort'}</span>
                  {([
                    { key: 'deadline', th: 'ใกล้หมดเขต', en: 'Deadline' },
                    { key: 'name',     th: 'ชื่อ',        en: 'Name'     },
                    { key: 'tier',     th: 'มูลค่า',      en: 'Value'    },
                  ] as { key: BrowseSortKey; th: string; en: string }[]).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setTdSortBy(opt.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        tdSortBy === opt.key
                          ? 'bg-[#1B3A6B] text-white'
                          : 'bg-[#F5F7FA] dark:bg-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1B3A6B] hover:bg-[#E8EFFF]'
                      }`}
                      style={{ fontFamily: font }}
                    >
                      {opt[lo]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Cards or skeleton/empty */}
            {tdLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
              </div>

            ) : browseVisible.length === 0 ? (
              <div className="flex flex-col items-center py-24 text-center">
                <div className="text-5xl mb-5">🎓</div>
                <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2" style={{ fontFamily: font }}>
                  {lo === 'th' ? 'ยังไม่มีทุนที่ตรงกับตัวกรอง' : 'No scholarships match these filters'}
                </h3>
                <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] max-w-sm mb-6 leading-relaxed" style={{ fontFamily: font }}>
                  {lo === 'th' ? 'ลองปรับตัวกรองหรือล้างการค้นหา' : 'Try adjusting or clearing your filters'}
                </p>
                {(activeFilters.length > 0 || tdSearch) && (
                  <button
                    onClick={clearAllFilters}
                    className="px-5 py-2.5 bg-[#1B3A6B] text-white rounded-full text-sm font-semibold hover:bg-[#2E5FA3] transition-colors"
                    style={{ fontFamily: font }}
                  >
                    {lo === 'th' ? 'ล้างตัวกรองทั้งหมด' : 'Clear all filters'}
                  </button>
                )}
              </div>

            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {browseVisible.map(s => (
                  <TdScholarshipCard
                    key={s.scholarship_id}
                    scholarship={s}
                    userId={user?.id ?? null}
                    variant={experimentVariant}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
