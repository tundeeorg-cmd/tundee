'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { translations } from '@/lib/translations';
import type { User } from '@supabase/supabase-js';
import { logMatchingResultsViewed, logSearchPerformed, setUserResearchContext } from '@/lib/research/events';
import { logFunnelEvent, logImpressions } from '@/lib/research/funnel';
import { logRecommendationRequest } from '@/lib/research/recommendationLog';
// getOrAssignVariant / RANKING_EXPERIMENT are no longer imported. That path
// assigned a second, conflicting arm from experiment_assignment; the arm is now
// read from profiles.ranking_variant, assigned once server-side at profile
// completion (PREREG §4).
import type { TdScholarship, TdAwardValueTier } from '@/lib/tdScholarships/types';
import TdScholarshipCard from '@/components/TdScholarshipCard';
import { TD_BROWSE_COLUMNS, BROWSE_FETCH_TIMEOUT_MS } from '@/lib/tdScholarships/browseColumns';
import ReconsentPrompt from '@/components/ReconsentPrompt';
import type { TdCardMatchInfo } from '@/components/TdScholarshipCard';
import { recommend } from '@/lib/recommender';
import type { RecommenderProfile, FairnessMode } from '@/lib/recommender';
import { groupMatches } from '@/lib/recommender/matchGroups';
import { matchProfileGaps, MATCH_GAP_LABEL, type MatchGaps } from '@/lib/profile/matchGaps';
import { matchCountLine } from '@/lib/scholarships/matchCountLine';

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
  /** Only meaningful when grade_level is M1-M3 or M4-M6. null for every other
   *  level, and for a school student who has not answered it yet. */
  grade_year: number | null;
  // PREREG §5.6. Replaces ab_arm, which is pilot-era history: it was hashed
  // from a different byte of the UUID than the mechanism that actually drove
  // treatment, so the two agreed only at chance.
  ranking_variant: 'baseline' | 'fairness_adjusted' | null;
  fairness_eligible: boolean;
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

const STATUS_LABEL: Record<string, { th: string; en: string }> = {
  'Opening Soon': { th: 'เปิดรับเร็ว ๆ นี้', en: 'Opening Soon' },
  'Open':         { th: 'เปิดรับ',          en: 'Open'         },
  'Closing Soon': { th: 'ใกล้หมดเขต',        en: 'Closing Soon' },
};

const STATUS_SORT_ORDER: Record<string, number> = {
  'Closing Soon': 0, 'Open': 1, 'Opening Soon': 2,
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
        <div className="absolute bottom-6 left-0 z-30 w-60 bg-[#1D1D1F] text-white text-xs leading-relaxed rounded-lg p-3 shadow-xl pointer-events-none">
          {lang === 'th' ? (
            <>
              <p className="font-semibold mb-1">{translations.browse.scoreExplain.th}</p>
              <p className="text-[#aeaeb2]">คิดจาก: เกรด • รายได้ • สาขาวิชา • จังหวัด • บัตรสวัสดิการ</p>
            </>
          ) : (
            <>
              <p className="font-semibold mb-1">{translations.browse.scoreExplain.en}</p>
              <p className="text-[#aeaeb2]">Based on: GPA • Income • Field • Province • Welfare card</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Match controls ─────────────────────────────────────────────────────────────

interface MatchControlsProps {
  /** All matches; after the % filter; actually painted. */
  total: number; filteredCount: number; visibleCount: number;
  sortBy: MatchSortKey; setSortBy: (v: MatchSortKey) => void;
  minScore: MinScore; setMinScore: (v: MinScore) => void;
  lang: string;
}

/**
 * Cards painted before the student asks for more. The recommender still scores
 * all 518 scholarships and still returns its full top 50 — this bounds the DOM,
 * nothing else.
 */
const MATCH_PAGE = 20;

/**
 * Cards painted in the browse grid before the student asks for more.
 *
 * This is the tab a signed-out visitor lands on, so it is the first thing
 * recruitment traffic renders. It previously painted every result at once:
 * 518 cards and 12,748 DOM nodes measured on production, which is the single
 * largest render cost on the page and lands hardest on exactly the low-end
 * handsets this product exists for.
 *
 * 24 keeps the 3-column desktop grid and the 2-column tablet grid both full.
 */
const BROWSE_PAGE = 24;

function MatchControls({ total, filteredCount, visibleCount, sortBy, setSortBy, minScore, setMinScore, lang }: MatchControlsProps) {
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
        {matchCountLine({ total, filteredCount, visibleCount, minScore, lang: lo })}
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

/** localStorage key: the student closed the "how this page works" guide. */
const GUIDE_DISMISSED_KEY = 'tundee_matches_guide_dismissed';

/** A search is logged once it has settled, not on every keystroke. */
const SEARCH_LOG_DELAY_MS = 600;

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
  tdStatusFilter: string;      setTdStatusFilter: (v: string) => void;
  tdLevelFilter: string;       setTdLevelFilter: (v: string) => void;
  tdFunderFilter: string;      setTdFunderFilter: (v: string) => void;
  tdAwardTierFilter: string;   setTdAwardTierFilter: (v: string) => void;
  tdTargetsLowIncome: boolean; setTdTargetsLowIncome: (v: boolean) => void;
  tdWelfareCard: boolean;      setTdWelfareCard: (v: boolean) => void;
  tdRenewable: boolean;        setTdRenewable: (v: boolean) => void;
  tdBondObligation: boolean;   setTdBondObligation: (v: boolean) => void;
}

function BrowseFilterPanel({ open, lang, tdStatusFilter, setTdStatusFilter,
    tdLevelFilter, setTdLevelFilter, tdFunderFilter, setTdFunderFilter,
    tdAwardTierFilter, setTdAwardTierFilter, tdTargetsLowIncome, setTdTargetsLowIncome,
    tdWelfareCard, setTdWelfareCard, tdRenewable, setTdRenewable,
    tdBondObligation, setTdBondObligation }: BrowseFilterPanelProps) {

  const lo = lang as 'th' | 'en';
  const sel = 'w-full px-3 py-2 text-sm border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-lg bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#2E6BE6]';

  if (!open) return null;
  return (
    <div className="mt-3 bg-[#F5F7FA] dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-xl p-4 space-y-4">
      {/* Dropdowns row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-widest mb-1">
            {lo === 'th' ? 'สถานะ' : 'Status'}
          </label>
          <select value={tdStatusFilter} onChange={e => setTdStatusFilter(e.target.value)} className={sel}>
            <option value="">{lo === 'th' ? 'ทุกสถานะ' : 'All statuses'}</option>
            {(['Opening Soon', 'Open', 'Closing Soon'] as const).map(k => (
              <option key={k} value={k}>{STATUS_LABEL[k][lo]}</option>
            ))}
          </select>
        </div>
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

/**
 * /scholarships, everything the student interacts with. app/scholarships/page.tsx
 * is the server half: it fetches the displayed scholarships (cached, see
 * lib/tdScholarships/browseList) and passes them in, so the first paint already
 * has cards. Before that split this component fetched them itself, after 268 KB
 * of JavaScript had loaded — the empty skeleton every visitor waited through.
 */
export default function ScholarshipsClient({ initialScholarships }: { initialScholarships: TdScholarship[] }) {
  const { lang } = useLang();
  const lo = lang as 'th' | 'en';
  const b = translations.browse;
  const supabase = createClient();
  const font = lo === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';

  const [user, setUser]                             = useState<User | null>(null);
  const [activeTab, setActiveTab]                   = useState<Tab>('browse');
  const [rankingVariant, setRankingVariant]         = useState<'baseline' | 'fairness_adjusted' | null>(null);
  const [fairnessEligible, setFairnessEligible]     = useState<boolean>(false);
  const loggedImpressions                           = useRef<Set<string>>(new Set());
  const loggedRecRequest                            = useRef<string | null>(null);

  // Matches tab state
  const [matchSortBy, setMatchSortBy]               = useState<MatchSortKey>('match');
  const [matchMinScore, setMatchMinScore]           = useState<MinScore>(0);
  const [matchesLoading, setMatchesLoading]         = useState(false);
  const [userProfile, setUserProfile]               = useState<StudentProfile | null>(null);
  /** Which answers the matcher reads are missing — drives the "complete your profile" card. */
  const [profileGaps, setProfileGaps]               = useState<MatchGaps | null>(null);
  /** Starts hidden so it cannot flash for a student who already closed it. */
  const [guideDismissed, setGuideDismissed]         = useState(true);
  /** The tab a search was typed from, for the `search` event's context.from_tab. */
  const searchFromTab                               = useRef<Tab>('browse');

  // Scholarship data (single source for both tabs)
  const [tdScholarships, setTdScholarships]         = useState<TdScholarship[]>(initialScholarships);
  // Only when the server could not supply them (it never blocks on this page).
  const [tdLoading, setTdLoading]                   = useState(initialScholarships.length === 0);
  /** The client fallback fetch failed or timed out: show an error + retry, never an endless skeleton. */
  const [tdLoadError, setTdLoadError]               = useState(false);

  // Browse filters
  const [tdSearch, setTdSearch]                     = useState('');
  const [tdStatusFilter, setTdStatusFilter]         = useState('');
  const [tdLevelFilter, setTdLevelFilter]           = useState('');
  const [tdFunderFilter, setTdFunderFilter]         = useState('');
  const [tdAwardTierFilter, setTdAwardTierFilter]   = useState('');
  const [tdTargetsLowIncome, setTdTargetsLowIncome] = useState(false);
  const [tdWelfareCard, setTdWelfareCard]           = useState(false);
  const [tdRenewable, setTdRenewable]               = useState(false);
  const [tdBondObligation, setTdBondObligation]     = useState(false);
  const [tdSortBy, setTdSortBy]                     = useState<BrowseSortKey>('deadline');
  const [filtersOpen, setFiltersOpen]               = useState(false);
  /**
   * How many matched cards are PAINTED. Not how many are scored, and not how
   * many are logged — see matchesToRender below.
   */
  const [matchPageSize, setMatchPageSize]           = useState(MATCH_PAGE);
  const [browsePageSize, setBrowsePageSize]         = useState(BROWSE_PAGE);

  // ── Data load ──────────────────────────────────────────────────────────────

  /**
   * Fallback only: the server normally supplies the list. If it could not (the
   * fetch failed at build/revalidate time), fetch it here — with a timeout, so a
   * stalled connection ends in an error and a retry button, not a skeleton that
   * never resolves. The column list is TD_BROWSE_COLUMNS, shared with the server
   * so the recommender scores exactly the same fields either way.
   */
  async function loadScholarships() {
    setTdLoading(true);
    setTdLoadError(false);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), BROWSE_FETCH_TIMEOUT_MS);
    try {
      const { data, error } = await supabase
        .from('td_scholarships')
        .select(TD_BROWSE_COLUMNS.join(', '))
        .eq('is_displayed', true)
        .order('scholarship_name_en')
        .abortSignal(timeout.signal);
      if (error || !data?.length) throw error ?? new Error('empty');
      setTdScholarships(data as unknown as TdScholarship[]);
    } catch {
      setTdLoadError(true);
    } finally {
      clearTimeout(timer);
      setTdLoading(false);
    }
  }

  useEffect(() => {
    if (initialScholarships.length === 0) void loadScholarships();

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
          // The arm is READ here, never assigned. Randomization happens once,
          // server-side, at profile completion (/api/experiment/assign) — this
          // page previously assigned it client-side on first view, which is
          // both the wrong moment and the wrong place for a salted hash.
          const variant = (profile.ranking_variant ?? null) as
            'baseline' | 'fairness_adjusted' | null;
          const eligible = profile.fairness_eligible === true;

          const incomeBracket = profile.income_bracket ?? 4;
          // ab_arm is no longer stamped on events: its value is uncorrelated
          // with delivered treatment. funnel_events.ranking_variant is the
          // research record of truth (v17).
          setUserResearchContext(null, incomeBracket);
          // From the stored row, not from userProfile below: that fills a
          // missing income with 4 and a missing GPA with 3.0, which is exactly
          // the gap this needs to see.
          setProfileGaps(matchProfileGaps({
            grade_level:        profile.grade_level,
            grade_year:         profile.grade_year,
            gpa:                profile.gpa,
            province:           profile.province,
            income_bracket:     profile.income_bracket,
            fields_of_interest: profile.fields_of_interest,
          }));
          setRankingVariant(variant);
          setFairnessEligible(eligible);
          setUserProfile({
            province_id:        profile.province         ?? '',
            income_bracket:     incomeBracket,
            gpa:                parseFloat(profile.gpa ?? '3.0'),
            fields_of_interest: profile.fields_of_interest ?? ['any'],
            welfare_card:       profile.welfare_card     ?? false,
            grade_level:        profile.grade_level      ?? '',
            grade_year:         typeof profile.grade_year === 'number' ? profile.grade_year : null,
            ranking_variant:    variant,
            fairness_eligible:  eligible,
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
    // PREREG §5.5. Eligibility is a property of the person; treatment is an
    // assignment. The adjustment fires only where BOTH hold — an eligible user
    // in the baseline arm receives an unmodified ranking, which is what makes
    // the arms comparable.
    const fairnessMode: FairnessMode =
      rankingVariant === 'fairness_adjusted' && fairnessEligible ? 'on' : 'off';
    const result = recommend(tdScholarships, recProfile, {
      fairness_mode: fairnessMode, variant: rankingVariant ?? 'baseline', limit: 50,
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
  }, [userProfile, tdScholarships, rankingVariant]);

  // ── Counterfactual: persist BOTH rankings per request (PREREG §4) ──────────
  // Logged from allMatches — the recommender's own output — rather than from
  // visibleMatches, which carries the student's filter and sort choices. Those
  // are interactions, captured separately by impressions with served_rank.
  useEffect(() => {
    if (!allMatches.length || !userProfile) return;
    // One row per computed ranking, not one per render.
    const key = `${rankingVariant}|${allMatches.length}|${allMatches[0]?.scholarship_id ?? ''}`;
    if (loggedRecRequest.current === key) return;
    loggedRecRequest.current = key;

    logRecommendationRequest({
      userId:           user?.id ?? null,
      rankingVariant,
      fairnessEligible,
      items: allMatches.map(s => ({
        scholarship_id: s.scholarship_id,
        raw_score:      s.rawScore,
        fairness_score: s.fairnessScore,
      })),
      surface: 'matches',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatches]);

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

  /**
   * The painted subset.
   *
   * Deliberately NOT folded into visibleMatches, because visibleMatches is what
   * the impression logger reads. Rendering fewer cards must not silently change
   * what the experiment records: impressions still cover the full ranked set
   * with unchanged served_rank, exactly as before this pagination existed.
   *
   * That keeps the logged data continuous across this deploy, at the cost of an
   * impression meaning "was in the ranked list" rather than "was painted" — the
   * semantics it already had, since a 50-card grid put most cards far below the
   * fold where nobody saw them either.
   */
  const matchesToRender = useMemo(
    () => visibleMatches.slice(0, matchPageSize),
    [visibleMatches, matchPageSize],
  );

  // Filtering or re-sorting is a new list; showing it half-expanded would be
  // surprising.
  useEffect(() => { setMatchPageSize(MATCH_PAGE); }, [matchSortBy, matchMinScore]);

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
    if (tdStatusFilter)     items = items.filter(s => (s.status_effective || '') === tdStatusFilter);
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

    // Closing Soon scholarships are pinned first regardless of the chosen sort —
    // they're the most time-sensitive for students to act on.
    items.sort((a, b) => {
      const sa = STATUS_SORT_ORDER[a.status_effective || ''] ?? 1;
      const sb = STATUS_SORT_ORDER[b.status_effective || ''] ?? 1;
      return sa - sb;
    });

    return items;
  }, [tdScholarships, tdSearch, tdStatusFilter, tdLevelFilter, tdFunderFilter, tdAwardTierFilter,
      tdTargetsLowIncome, tdWelfareCard, tdRenewable, tdBondObligation, tdSortBy, lo]);

  /**
   * The painted subset of the browse grid.
   *
   * Kept separate from browseVisible for the same reason matchesToRender is:
   * browseVisible feeds the impression logger, and narrowing what gets logged
   * would change user_events partway through the study. Impressions still cover
   * the full filtered result set.
   */
  const browseToRender = useMemo(
    () => browseVisible.slice(0, browsePageSize),
    [browseVisible, browsePageSize],
  );

  // Any change to the query is a new result set; carrying an expanded page size
  // across it would show an arbitrary slice of something the student never
  // scrolled through.
  useEffect(() => { setBrowsePageSize(BROWSE_PAGE); }, [
    tdSearch, tdStatusFilter, tdLevelFilter, tdFunderFilter, tdAwardTierFilter,
    tdTargetsLowIncome, tdWelfareCard, tdRenewable, tdBondObligation, tdSortBy,
  ]);

  // ── Active filter chips ────────────────────────────────────────────────────
  const activeFilters: { key: string; label: string; clear: () => void }[] = [
    ...(tdStatusFilter ? [{ key: 'status', label: STATUS_LABEL[tdStatusFilter]?.[lo] ?? tdStatusFilter, clear: () => setTdStatusFilter('') }] : []),
    ...(tdLevelFilter ? [{ key: 'level', label: `${lo === 'th' ? 'ระดับ' : 'Level'}: ${LEVEL_LABEL[tdLevelFilter]?.[lo] ?? tdLevelFilter}`, clear: () => setTdLevelFilter('') }] : []),
    ...(tdFunderFilter ? [{ key: 'funder', label: FUNDER_LABEL[tdFunderFilter]?.[lo] ?? tdFunderFilter, clear: () => setTdFunderFilter('') }] : []),
    ...(tdAwardTierFilter ? [{ key: 'tier', label: TIER_LABEL[tdAwardTierFilter as TdAwardValueTier]?.[lo] ?? tdAwardTierFilter, clear: () => setTdAwardTierFilter('') }] : []),
    ...(tdTargetsLowIncome ? [{ key: 'low', label: lo === 'th' ? 'รายได้น้อย' : 'Low-income', clear: () => setTdTargetsLowIncome(false) }] : []),
    ...(tdWelfareCard      ? [{ key: 'welfare', label: lo === 'th' ? 'บัตรสวัสดิการ' : 'Welfare card', clear: () => setTdWelfareCard(false) }] : []),
    ...(tdRenewable        ? [{ key: 'renew', label: lo === 'th' ? 'ต่ออายุได้' : 'Renewable', clear: () => setTdRenewable(false) }] : []),
    ...(tdBondObligation   ? [{ key: 'bond', label: lo === 'th' ? 'มีข้อผูกพัน' : 'Bond obligation', clear: () => setTdBondObligation(false) }] : []),
  ];

  function clearAllFilters() {
    setTdSearch(''); setTdStatusFilter(''); setTdLevelFilter(''); setTdFunderFilter(''); setTdAwardTierFilter('');
    setTdTargetsLowIncome(false); setTdWelfareCard(false); setTdRenewable(false); setTdBondObligation(false);
  }

  // ── Guidance ───────────────────────────────────────────────────────────────

  useEffect(() => {
    try { setGuideDismissed(localStorage.getItem(GUIDE_DISMISSED_KEY) === '1'); }
    catch { setGuideDismissed(false); }
  }, []);

  function dismissGuide() {
    setGuideDismissed(true);
    try { localStorage.setItem(GUIDE_DISMISSED_KEY, '1'); } catch { /* private mode: closes for this visit only */ }
    logFunnelEvent({ eventType: 'guide_dismissed', userId: user?.id ?? null, context: { variant: rankingVariant } });
  }

  /**
   * The search box sits above both tabs. Searching always searches EVERY
   * scholarship: a student who types the name of a real scholarship that did
   * not match them must still find it, or they conclude TunDee does not have
   * it. So a search typed on the matches tab moves to the browse tab.
   */
  function onSearchChange(value: string) {
    if (!tdSearch && value) searchFromTab.current = activeTab;
    setTdSearch(value);
    if (value.trim() && activeTab === 'matches') setActiveTab('browse');
  }

  /**
   * The match % for a scholarship that is also in this student's matches, so a
   * search result can carry the same badge the matches tab shows. Read from
   * allMatches — the recommender output already on the page — so this is a
   * lookup, not a second ranking.
   */
  const matchById = useMemo(() => {
    const m = new Map<string, TdCardMatchInfo>();
    for (const s of allMatches) m.set(s.scholarship_id, { score: s.fairnessScore, reasons: s.reasons, reasons_en: s.reasons_en });
    return m;
  }, [allMatches]);

  // ── Research events ────────────────────────────────────────────────────────

  // One `search` event per settled query. It used to fire on every keystroke
  // past the second, which wrote "ทุ", "ทุน", "ทุนพ"… as separate searches.
  useEffect(() => {
    const q = tdSearch.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => {
      logFunnelEvent({
        eventType: 'search', userId: user?.id ?? null,
        context: { query: q, tab: 'browse', from_tab: searchFromTab.current, variant: rankingVariant },
      });
      logSearchPerformed(q, tdScholarships.length);
    }, SEARCH_LOG_DELAY_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tdSearch]);


  useEffect(() => {
    if (allMatches.length > 0) logMatchingResultsViewed(allMatches.length, allMatches[0]?.scholarship_id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatches]);

  useEffect(() => {
    logFunnelEvent({ eventType: 'view_list', userId: user?.id ?? null, context: { tab: activeTab, variant: rankingVariant } });
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
      user?.id ?? null, rankingVariant, 'matches',
      rankingVariant === 'fairness_adjusted' && fairnessEligible ? 'on' : 'off',
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
      user?.id ?? null, rankingVariant, 'browse',
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseVisible, activeTab]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-[#000000] min-h-screen">

      {/* ── Page header ── */}
      <div className="bg-[#F5F7FA] dark:bg-[#0A1628] border-b border-[#E5E5EA] dark:border-[#1A2E4A]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <h1
            className="text-3xl md:text-4xl text-[#1D1D1F] dark:text-white mb-2"
            style={{ fontFamily: font, fontWeight: 300 }}
          >
            {b.title[lang]}
          </h1>
          <p className="text-[#6E6E73] dark:text-[#8E8E93] text-sm" style={{ fontFamily: font }}>
            {activeTab === 'matches' ? b.subtitleMatches[lang] : b.subtitle[lang]}
          </p>

          {/* Search — above the tabs, on both, for guests too. It always
              searches every scholarship (see onSearchChange). */}
          <div className="relative mt-4 max-w-[640px]">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#ADADB8]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={tdSearch}
              onChange={e => onSearchChange(e.target.value)}
              placeholder={b.searchPlaceholder[lang]}
              aria-label={b.searchAria[lang]}
              enterKeyHint="search"
              className="w-full pl-11 pr-4 py-3 border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-xl bg-white dark:bg-[#07111F] text-[#1D1D1F] dark:text-white placeholder-[#ADADB8] focus:outline-none focus:border-[#2E6BE6] focus:ring-2 focus:ring-[#2E6BE6]/20 transition-colors"
              // 16px or iOS zooms the page when the field is focused.
              style={{ fontFamily: font, fontSize: '16px' }}
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 bg-[#EAEAEC] dark:bg-[#232B3E] rounded-[10px] p-1 w-fit">
            {(user ? ['matches', 'browse'] as Tab[] : ['browse'] as Tab[]).map(t => (
              <button
                key={t}
                // Back to matches clears the search: it searches all
                // scholarships, so leaving text in the box over an unfiltered
                // matches list would look like a search that did nothing.
                onClick={() => { setActiveTab(t); if (t === 'matches') setTdSearch(''); }}
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

        {/* Guests: the quiz is the way in. /start matches without an account,
            so this is the step that shows them value before asking them to
            sign up. Browsing and search stay open below it. */}
        {!user && !tdLoading && tdScholarships.length > 0 && !tdSearch && (
          <div className="mb-8 rounded-2xl border border-[#2E6BE6]/30 bg-[#EFF4FF] dark:bg-[#162552] px-5 py-5 sm:px-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <h2 className="text-lg font-bold text-[#0A2342] dark:text-white" style={{ fontFamily: font }}>
                {b.guestTitle[lang]}
              </h2>
              <p className="mt-1 text-sm text-[#1D1D1F] dark:text-[#E8EDF5]" style={{ fontFamily: font, lineHeight: 1.7 }}>
                {b.guestBody[lang]}
              </p>
              <p className="mt-1 text-xs text-[#6E6E73] dark:text-[#8E8E93]" style={{ fontFamily: font }}>
                {b.guestBrowseHint[lang]}
              </p>
            </div>
            <div className="mt-4 sm:mt-0 flex flex-col items-stretch sm:items-end gap-2 shrink-0">
              <a
                href="/start"
                onClick={() => logFunnelEvent({ eventType: 'guest_start_cta_clicked', context: { from: 'scholarships' } })}
                className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-full bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white text-base font-bold transition-colors"
                style={{ fontFamily: font }}
              >
                {b.guestCta[lang]} →
              </a>
              <a href="/auth?from=scholarships" className="text-center text-sm text-[#1B3A6B] dark:text-[#8FB4FF] underline" style={{ fontFamily: font }}>
                {b.guestSignIn[lang]}
              </a>
            </div>
          </div>
        )}

        {/* Research consent asked again — only for the students who need it. */}
        {user && <ReconsentPrompt lang={lang} />}

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
                  onClick={() => logFunnelEvent({ eventType: 'profile_nudge_clicked', userId: user?.id ?? null, context: { completeness: 0, surface: 'no_profile' } })}
                  className="inline-flex items-center justify-center min-h-[52px] bg-[#1B3A6B] text-white text-base font-bold px-7 rounded-full hover:bg-[#2E5FA3] transition-colors"
                  style={{ fontFamily: font }}>
                  {b.completeProfileCta[lang]}
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
                {/* Incomplete profile: the most useful thing on the page, so first. */}
                {profileGaps && profileGaps.missing.length > 0 && (
                  <div className="mb-4 rounded-2xl border border-[#F5C26B] dark:border-[#6B5420] bg-[#FFF8EB] dark:bg-[#2A2210] px-5 py-4">
                    <p className="text-sm font-semibold text-[#5C3D00] dark:text-[#F5D58A]" style={{ fontFamily: font, lineHeight: 1.7 }}>
                      {b.profileNudge[lang](profileGaps.percent)}
                    </p>
                    <div className="mt-2 h-1.5 rounded-full bg-[#F5E3BF] dark:bg-[#4A3B18] overflow-hidden" aria-hidden="true">
                      <div className="h-full rounded-full bg-[#E39A0B]" style={{ width: `${profileGaps.percent}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-[#7A5A1A] dark:text-[#D9C08A]" style={{ fontFamily: font }}>
                      {b.profileNudgeMissing[lang]}{' '}
                      {profileGaps.missing.slice(0, 2).map(f => MATCH_GAP_LABEL[f][lo]).join(lo === 'th' ? ', ' : ', ')}
                    </p>
                    <Link href="/profile/setup"
                      onClick={() => logFunnelEvent({ eventType: 'profile_nudge_clicked', userId: user?.id ?? null, context: { completeness: profileGaps.percent, missing: profileGaps.missing, surface: 'matches' } })}
                      className="mt-3 inline-flex items-center justify-center min-h-[44px] px-5 rounded-full bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white text-sm font-bold transition-colors"
                      style={{ fontFamily: font }}>
                      {b.profileNudgeCta[lang]} →
                    </Link>
                  </div>
                )}

                {/* How this page works — three lines, closable, remembered. */}
                {!guideDismissed && (
                  <div className="mb-4 relative rounded-2xl border border-[#E5E5EA] dark:border-[#1A2E4A] bg-[#F5F7FA] dark:bg-[#0A1628] px-5 py-4 pr-12">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#8A96A8] mb-2" style={{ fontFamily: font }}>
                      {b.guideTitle[lang]}
                    </p>
                    <ol className="grid gap-2 sm:grid-cols-3 sm:gap-4">
                      {[b.guideStep1, b.guideStep2, b.guideStep3].map((step, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-[#1D1D1F] dark:text-[#E8EDF5]" style={{ fontFamily: font, lineHeight: 1.6 }}>
                          <span className="shrink-0 w-6 h-6 rounded-full bg-[#1B3A6B] text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                          <span>{step[lang]}</span>
                        </li>
                      ))}
                    </ol>
                    <button
                      type="button"
                      onClick={dismissGuide}
                      aria-label={b.guideClose[lang]}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-[#8A96A8] hover:bg-[#E5E5EA] dark:hover:bg-[#1A2E4A] hover:text-[#1D1D1F] dark:hover:text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                <MatchControls
                  total={allMatches.length} filteredCount={visibleMatches.length} visibleCount={matchesToRender.length}
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
                  /* Grouped by what the scholarship actually asks of the
                     student, not just ranked. 75% of a school student's matches
                     require moving to another country; as one deadline-ordered
                     list the 21 Thai undergraduate ones were scattered among
                     228 foreign ones with nothing on the page distinguishing
                     them. Order inside each group is untouched, so whatever the
                     sort control selected still holds under every heading. */
                  <div className="space-y-10">
                    {groupMatches(matchesToRender, userProfile?.grade_level, { gradeYear: userProfile?.grade_year }).map(group => (
                      <section key={group.key}>
                        {group.key !== 'all' && (
                          <header className="mb-4">
                            <h2 className="text-base font-bold text-[#0A2342] dark:text-[#E8EDF5] flex items-center flex-wrap gap-2"
                                style={{ fontFamily: font }}>
                              {group.title[lo === 'th' ? 'th' : 'en']}
                              <span className="text-sm font-normal text-[#8A96A8]">
                                {group.items.length}
                              </span>
                              {/* Only set for ม.4–5: these scholarships recruit
                                  from ม.6, so the deadline on each card is not
                                  one this student can act on yet. */}
                              {group.note && (
                                <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-[#FFF4E5] dark:bg-[#3A2E15] text-[#8A5A00] dark:text-[#E0B060]">
                                  {group.note[lo === 'th' ? 'th' : 'en']}
                                </span>
                              )}
                            </h2>
                            <p className="mt-1 text-sm text-[#6E6E73] dark:text-[#8E8E93]"
                               style={{ fontFamily: font, lineHeight: 1.7 }}>
                              {group.blurb[lo === 'th' ? 'th' : 'en']}
                            </p>
                          </header>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                          {group.items.map(s => (
                            <TdScholarshipCard
                              key={s.scholarship_id}
                              scholarship={s}
                              matchInfo={{ score: s.fairnessScore, reasons: s.reasons, reasons_en: s.reasons_en }}
                              userId={user?.id ?? null}
                              variant={rankingVariant}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}

                {/* Nothing here claims speed. It states what is on screen and
                    what remains, which is the only thing a student on a stalled
                    connection can actually act on. */}
                {visibleMatches.length > 0 && (
                  <div className="mt-6 text-center">
                    {matchesToRender.length < visibleMatches.length ? (
                      <button
                        type="button"
                        onClick={() => setMatchPageSize(n => n + MATCH_PAGE)}
                        className="min-h-[48px] px-6 bg-white dark:bg-[#0A1628] border-2 border-[#1B3A6B] text-[#1B3A6B] dark:text-[#8FB4FF] rounded-full text-sm font-semibold"
                        style={{ fontFamily: font }}>
                        ดูทุนเพิ่มเติม
                      </button>
                    ) : (
                      <p className="text-sm text-[#8A96A8]"
                         style={{ fontFamily: font, lineHeight: 1.8 }}>
                        แสดงทุนครบทุกรายการแล้ว
                      </p>
                    )}
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
            {/* A search started on the matches tab lands here: say where the
                results come from, and what the badge on some of them means. */}
            {tdSearch.trim() && user && allMatches.length > 0 && (
              <p className="mb-3 text-sm text-[#1B3A6B] dark:text-[#8FB4FF]" style={{ fontFamily: font, lineHeight: 1.7 }}>
                {b.searchAllNote[lang]}
              </p>
            )}

            {/* Filter toggle. The search box is in the header, above the tabs. */}
            <div className="flex gap-2 mb-2">
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
              tdStatusFilter={tdStatusFilter} setTdStatusFilter={setTdStatusFilter}
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

            ) : tdLoadError ? (
              // The fallback fetch failed or passed BROWSE_FETCH_TIMEOUT_MS. Say so
              // and offer the one action that helps; never leave a skeleton up.
              <div role="alert" className="flex flex-col items-center py-20 text-center">
                <div className="text-5xl mb-5">📶</div>
                <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2" style={{ fontFamily: font }}>
                  {lo === 'th' ? 'โหลดรายการทุนไม่สำเร็จ' : "Couldn't load the scholarships"}
                </h3>
                <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] max-w-sm mb-6 leading-relaxed" style={{ fontFamily: font }}>
                  {lo === 'th' ? 'สัญญาณอาจช้าหรือหลุด ลองใหม่อีกครั้งได้เลย' : 'The connection may be slow or dropped. Please try again.'}
                </p>
                <button
                  type="button"
                  onClick={() => void loadScholarships()}
                  className="min-h-[48px] px-6 bg-[#1B3A6B] text-white rounded-full text-sm font-semibold hover:bg-[#2E5FA3] transition-colors"
                  style={{ fontFamily: font }}
                >
                  {lo === 'th' ? 'ลองใหม่' : 'Try again'}
                </button>
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
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {browseToRender.map(s => (
                    <TdScholarshipCard
                      key={s.scholarship_id}
                      scholarship={s}
                      // Only for scholarships in this student's matches; the
                      // rest carry no badge rather than a misleading low one.
                      matchInfo={matchById.get(s.scholarship_id)}
                      userId={user?.id ?? null}
                      variant={rankingVariant}
                    />
                  ))}
                </div>

                {/* States what is on screen and what is left. The total is
                    already shown above as "พบ N ทุน", so nothing here needs to
                    repeat it — and nothing here claims the page is fast. */}
                <div className="mt-6 text-center">
                  {browseToRender.length < browseVisible.length ? (
                    <button
                      type="button"
                      onClick={() => setBrowsePageSize(n => n + BROWSE_PAGE)}
                      className="min-h-[48px] px-6 bg-white dark:bg-[#0A1628] border-2 border-[#1B3A6B] text-[#1B3A6B] dark:text-[#8FB4FF] rounded-full text-sm font-semibold"
                      style={{ fontFamily: font }}>
                      ดูทุนเพิ่มเติม
                    </button>
                  ) : (
                    <p className="text-sm text-[#8A96A8]"
                       style={{ fontFamily: font, lineHeight: 1.8 }}>
                      แสดงทุนครบทุกรายการแล้ว
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
