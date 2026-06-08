'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import ScholarshipCard from '@/components/ScholarshipCard';
import ScholarshipFilters from '@/components/ScholarshipFilters';
import { useLang } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { translations } from '@/lib/translations';
import { getDeadlineInfo } from '@/lib/deadline';
import { getMatchedScholarships, classifyDemographic } from '@/lib/matching';
import type { MatchResult, ScholarshipRow, StudentProfile } from '@/lib/matching';
import type { FilterState, Scholarship } from '@/lib/types';
import type { User } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────────────────
type Tab = 'matches' | 'browse';
type SortKey = 'amount' | 'deadline' | 'name';

const EMPTY_FILTERS: FilterState = {
  funderType: '',
  minGpa: null,
  fieldOfStudy: '',
  province: '',
  welfareCard: false,
  gradeLevel: '',
};

// ── Helpers ──────────────────────────────────────────────────────────────
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
    if (daysA < 0 && daysB >= 0) return 1;  // expired goes last
    if (daysA >= 0 && daysB < 0) return -1;
    return daysA - daysB; // closest deadline first
  });
}

function sortByName(scholarships: Scholarship[], lang: string): Scholarship[] {
  return [...scholarships].sort((a, b) => {
    const nameA = lang === 'th' ? (a.name_th ?? '') : (a.name_en ?? a.name_th ?? '');
    const nameB = lang === 'th' ? (b.name_th ?? '') : (b.name_en ?? b.name_th ?? '');
    return nameA.localeCompare(nameB, lang === 'th' ? 'th' : 'en');
  });
}

function searchFilter(scholarships: Scholarship[], query: string, lang: string): Scholarship[] {
  if (!query.trim()) return scholarships;
  const q = query.trim().toLowerCase();
  return scholarships.filter((s) => {
    const nameTh = (s.name_th ?? '').toLowerCase();
    const nameEn = (s.name_en ?? '').toLowerCase();
    const funderTh = (s.funder_name_th ?? '').toLowerCase();
    const funderEn = (s.funder_name_en ?? '').toLowerCase();
    return nameTh.includes(q) || nameEn.includes(q) || funderTh.includes(q) || funderEn.includes(q);
  });
}

function applyFilters(scholarships: Scholarship[], f: FilterState): Scholarship[] {
  return scholarships.filter((s) => {
    // Safety: never show inactive scholarships even if they slipped through
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
        // Generous matching: check canonical grade AND grouped labels
        const GRADE_GROUPS: Record<string, string[]> = {
          'ม.ต้น':    ['M1', 'M2', 'M3', 'ม.ต้น', 'ม.1', 'ม.2', 'ม.3'],
          'ม.ปลาย':   ['M4', 'M5', 'M6', 'ม.ปลาย', 'ม.4', 'ม.5', 'ม.6'],
          'ปวช./ปวส.': ['vocational', 'ปวช.', 'ปวส.', 'ม.ปลาย'],
          uni:         ['uni'],
          graduate:    ['graduate'],
        };
        const matchKeys = GRADE_GROUPS[g] ?? [g];
        const hasMatch = gl.some(level => matchKeys.includes(level));
        if (!hasMatch) return false;
      }
    }
    return true;
  });
}

// Cast Scholarship → ScholarshipRow for engine (adds defaults for new columns)
function toScholarshipRow(s: Scholarship): ScholarshipRow {
  return {
    ...s,
    historical_bias_score: (s as Scholarship & { historical_bias_score?: number }).historical_bias_score ?? 0.5,
    grade_levels: (s as Scholarship & { grade_levels?: string[] | null }).grade_levels ?? null,
    field_of_study: s.field_of_study ?? [],
    province_restriction: s.province_restriction ?? [],
  };
}

// ── Match Score Bar ───────────────────────────────────────────────────────
function MatchScoreBar({ result, lang }: { result: MatchResult; lang: string }) {
  const b = translations.browse;
  const pct = Math.round(result.fairness_score * 100);
  const color = result.fairness_boosted ? '#F0A500' : '#0066CC';
  return (
    <div className="mt-3 pt-3 border-t border-[#F5F5F7]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#6E6E73]">{b.matchScore[lang as 'th' | 'en']}</span>
        <span className="text-xs font-semibold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-[#F5F5F7] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {result.fairness_boosted && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[10px] font-medium text-[#F0A500] bg-[#FFF8E7] px-2 py-0.5 rounded-full border border-[#F0A500]/30">
            {b.fairnessBadge[lang as 'th' | 'en']}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Match Card ────────────────────────────────────────────────────────────
function MatchCard({ result, lang }: { result: MatchResult; lang: string }) {
  const d = translations.detail;
  const s = result.scholarship;
  const reasons = lang === 'th' ? result.reasons : result.reasons_en;

  function storeMatchData() {
    try {
      sessionStorage.setItem(`tundee_match_${s.id}`, JSON.stringify({
        raw_score: result.raw_score,
        fairness_score: result.fairness_score,
        correction_applied: result.correction_applied,
        fairness_boosted: result.fairness_boosted,
        reasons: result.reasons,
        reasons_en: result.reasons_en,
      }));
    } catch {
      // sessionStorage unavailable — silently skip
    }
  }

  const name = lang === 'th' ? s.name_th : (s.name_en ?? s.name_th);
  const funder = lang === 'th' ? s.funder_name_th : (s.funder_name_en ?? s.funder_name_th);

  return (
    <article className="bg-white border border-[#E5E5EA] rounded-[12px] p-5 flex flex-col gap-3 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-shadow duration-300">
      {/* Rank badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[#F0A500] text-white text-xs font-bold flex items-center justify-center shrink-0">
            {result.rank}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[#1D1D1F] leading-snug line-clamp-2"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
              {name}
            </h3>
            {funder && <p className="text-xs text-[#6E6E73] truncate">{funder}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {s.amount_thb && (
            <span className="text-sm font-semibold text-[#F0A500]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {s.amount_thb.toLocaleString('th-TH')}
            </span>
          )}
        </div>
      </div>

      {/* Reasons */}
      {reasons.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-[#6E6E73] uppercase tracking-wider">{d.whyMatch[lang as 'th' | 'en']}</p>
          <ul className="space-y-0.5">
            {reasons.slice(0, 3).map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[#6E6E73]">
                <span className="text-[#F0A500] mt-0.5 shrink-0">✓</span>
                <span style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Score bar */}
      <MatchScoreBar result={result} lang={lang} />

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        {s.deadline_date && (
          <span className="text-xs text-[#6E6E73]">
            {new Date(s.deadline_date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
        <Link
          href={`/scholarships/${s.id}`}
          onClick={storeMatchData}
          className="text-xs text-[#F0A500] font-medium hover:underline ml-auto"
        >
          {translations.card.viewDetail[lang as 'th' | 'en']}
        </Link>
      </div>
    </article>
  );
}

// ── Empty State (DB returned 0 rows — likely RLS issue) ──────────────────
function EmptyState({ lang }: { lang: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="text-6xl mb-6">🎓</div>
      <h2
        className="text-xl font-semibold text-[#1D1D1F] mb-3"
        style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
      >
        {lang === 'th' ? 'ยังไม่พบทุนการศึกษา' : 'No scholarships found'}
      </h2>
      <p
        className="text-sm text-[#6E6E73] max-w-sm leading-relaxed mb-6"
        style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
      >
        {lang === 'th'
          ? 'กรุณา refresh หน้า หรือติดต่อผู้ดูแลระบบ'
          : 'Try refreshing the page, or contact the site admin.'}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="text-sm font-semibold text-white bg-[#F0A500] hover:bg-[#D4920A] transition-colors px-6 py-2.5 rounded-full"
      >
        {lang === 'th' ? 'รีเฟรชหน้านี้' : 'Refresh page'}
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function BrowsePage() {
  const { lang } = useLang();
  const b = translations.browse;
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const [sortKey, setSortKey] = useState<SortKey>('deadline');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<StudentProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Auth + data load
  useEffect(() => {
    // Load all scholarships — no server-side is_active filter; filter client-side so
    // rows with is_active = NULL are also included (avoids RLS NULL-exclusion edge case)
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
          const active = (data || []).filter((s) => (s as { is_active?: boolean | null }).is_active !== false) as Scholarship[];
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

    // Check auth — use getSession() (reads localStorage, no network round-trip)
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) return;
      const authUser = data.session.user;
      setUser(authUser);
      setActiveTab('matches');
      setMatchesLoading(true);

      // Fetch profile
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        if (profile) {
          const sp: StudentProfile = {
            province_id: profile.province_id ?? '',
            income_bracket: profile.income_bracket ?? 4,
            gpa: parseFloat(profile.gpa ?? '3.0'),
            fields_of_interest: profile.fields_of_interest ?? ['any'],
            welfare_card: profile.welfare_card ?? false,
            grade_level: profile.grade_level ?? 'M6',
          };
          setUserProfile(sp);

          // Fire-and-forget: update last_active_at for the analytics dashboard
          supabase
            .from('profiles')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', authUser.id)
            .then(() => {/* silent */})
        }
      } catch {
        // profiles table may not exist yet — silently ignore
      } finally {
        setMatchesLoading(false);
      }
    });
  }, []);

  // Run engine whenever scholarships or profile changes
  useEffect(() => {
    if (!userProfile || scholarships.length === 0) return;
    try {
      // Safety filter — exclude expired/hidden before matching
      const activeScholarships = scholarships.filter(s => s.is_active !== false);
      const rows = activeScholarships.map(toScholarshipRow);
      const results = getMatchedScholarships(rows, userProfile);
      setMatches(results);

      // Log recommendations async (fire-and-forget)
      logRecommendations(results, userProfile);

    } catch (e) {
      console.error('Matching engine error:', e);
    }
  }, [userProfile, scholarships]);

  async function logRecommendations(results: MatchResult[], profile: StudentProfile) {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user;
    if (!currentUser) return;
    const demographic = classifyDemographic(profile);

    const rows = results.map((r) => ({
      user_id: currentUser.id,
      scholarship_id: r.scholarship.id,
      score_raw: r.raw_score,
      score_fairness_adjusted: r.fairness_score,
      rank: r.rank,
      reasons_json: {
        reasons: r.reasons,
        reasons_en: r.reasons_en,
        correction_applied: r.correction_applied,
        fairness_boosted: r.fairness_boosted,
        demographic,
      },
      generated_at: new Date().toISOString(),
    }));

    try {
      await supabase.from('recommendations').upsert(rows, { onConflict: 'user_id,scholarship_id' });
    } catch {
      // table may not exist yet — silently ignore
    }
  }

  const filtered = useMemo(() => {
    let base = applyFilters(scholarships, filters);
    base = searchFilter(base, searchQuery, lang);
    if (sortKey === 'deadline') return sortByDeadline(base);
    if (sortKey === 'amount') return sortByAmount(base);
    return sortByName(base, lang);
  }, [scholarships, filters, sortKey, searchQuery, lang]);

  // True only when load is done AND DB returned nothing (not just filtered to 0)
  const isDataEmpty = !loading && scholarships.length === 0;

  // Deadline alerts: scholarships closing within 7 days
  const urgentScholarships = useMemo(() => {
    return scholarships.filter(s => {
      const info = getDeadlineInfo(s.deadline_date);
      return info.days !== null && info.days >= 0 && info.days <= 7;
    });
  }, [scholarships]);

  return (
    <div className="bg-white dark:bg-[#000000] min-h-screen">
      {/* Page header */}
      <div className="bg-[#F5F5F7] dark:bg-[#1C1C1E] border-b border-[#E5E5EA] dark:border-[#38383A]">
        <div className="max-w-[1200px] mx-auto px-6 py-12">
          <h1
            className="text-3xl md:text-4xl text-[#1D1D1F] dark:text-white mb-3"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif', fontWeight: 300 }}
          >
            {b.title[lang]}
          </h1>
          <p className="text-[#6E6E73] dark:text-[#8E8E93]">{b.subtitle[lang]}</p>

          {/* Tabs (only show to logged-in users) */}
          {user && (
            <div className="flex gap-1 mt-6 bg-[#EAEAEC] rounded-[10px] p-1 w-fit">
              {(['matches', 'browse'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-5 py-2 text-sm font-medium rounded-[8px] transition-all duration-200 ${activeTab === t ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#6E6E73] hover:text-[#1D1D1F]'}`}
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                >
                  {t === 'matches' ? b.tabMatches[lang] : b.tabBrowse[lang]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-10">

        {/* ── Non-logged-in banner ─────────────────────────────────── */}
        {!user && !loading && scholarships.length > 0 && (
          <div className="mb-8 flex items-center justify-between gap-4 bg-[#FFF8E7] border border-[#F0A500]/30 rounded-[12px] px-6 py-4">
            <p className="text-sm text-[#1D1D1F]" style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
              {b.loginBanner[lang]}
            </p>
            <Link href="/auth" className="text-sm font-semibold text-[#F0A500] hover:underline shrink-0">
              {b.loginBannerCta[lang]}
            </Link>
          </div>
        )}

        {/* ── Urgent deadline alert banner ─────────────────────── */}
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
                {urgentScholarships.map(s => lang === 'th' ? s.name_th : (s.name_en ?? s.name_th)).join(' · ')}
              </p>
            </div>
          </div>
        )}

        {/* ── My Matches Tab ───────────────────────────────────────── */}
        {activeTab === 'matches' && user && (
          <div>
            {matchesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => <div key={i} className="h-52 bg-[#F5F5F7] rounded-[12px] animate-pulse" />)}
              </div>
            ) : !userProfile ? (
              <div className="flex flex-col items-center py-24 text-center">
                <div className="text-5xl mb-5">📋</div>
                <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
                  {b.completeProfile[lang]}
                </h3>
                <p className="text-sm text-[#6E6E73] max-w-xs mb-6">{b.completeProfileSub[lang]}</p>
                <Link href="/profile" className="bg-[#F0A500] text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-[#D4920A] transition-colors">
                  {lang === 'th' ? 'กรอกโปรไฟล์' : 'Set up profile'}
                </Link>
              </div>
            ) : matches.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-center">
                <div className="text-5xl mb-5">🔍</div>
                <h3
                  className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                >
                  {lang === 'th' ? 'ไม่พบทุนที่ตรงกับโปรไฟล์ปัจจุบัน' : 'No matches for your current profile'}
                </h3>
                <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] max-w-xs mb-6 leading-relaxed">
                  {lang === 'th'
                    ? 'ลองปรับเกรดหรือเพิ่มสาขาที่สนใจในโปรไฟล์ของคุณ'
                    : 'Try updating your GPA or adding more fields of interest in your profile'}
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <Link
                    href="/profile"
                    className="px-5 py-2.5 bg-[#F0A500] text-white rounded-full text-sm font-semibold hover:bg-[#D4920A] transition-colors"
                  >
                    {lang === 'th' ? 'อัปเดตโปรไฟล์' : 'Update Profile'}
                  </Link>
                  <button
                    onClick={() => setActiveTab('browse')}
                    className="px-5 py-2.5 border border-[#E5E5EA] dark:border-[#38383A] rounded-full text-sm text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#F0A500] hover:text-[#F0A500] transition-colors"
                  >
                    {lang === 'th' ? 'ดูทุนทั้งหมด' : 'Browse All'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {matches.map((result) => (
                  <MatchCard key={result.scholarship.id} result={result} lang={lang} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Browse All Tab ───────────────────────────────────────── */}
        {activeTab === 'browse' && (
          isDataEmpty ? (
            <EmptyState lang={lang} />
          ) : (
            <div className="flex gap-8">
              {/* Sidebar — desktop */}
              <aside className="hidden md:block w-72 shrink-0">
                <div className="sticky top-24">
                  <ScholarshipFilters filters={filters} onChange={setFilters} resultCount={filtered.length} />
                </div>
              </aside>

              <div className="flex-1 min-w-0">
                {/* Mobile filter toggle */}
                <button
                  className="md:hidden flex items-center gap-2 text-sm font-medium text-[#1D1D1F] border border-[#E5E5EA] rounded-lg px-4 py-2 mb-6 w-full justify-center"
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

                {/* Search input */}
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
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-[#E5E5EA] dark:border-[#38383A] rounded-[10px] bg-white dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-white placeholder-[#ADADB8] focus:outline-none focus:border-[#F0A500] transition-colors"
                      style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
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
                      <span className="text-xs text-[#6E6E73]">
                        {lang === 'th' ? 'ค้นหา:' : 'Searching:'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs bg-[#FFF8E7] border border-[#F0A500]/30 text-[#F0A500] px-2.5 py-0.5 rounded-full font-medium">
                        {searchQuery}
                        <button onClick={() => setSearchQuery('')} className="ml-0.5 hover:text-[#D4920A]">×</button>
                      </span>
                    </div>
                  )}
                </div>

                {/* Results header + sort toggle */}
                <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                  <span className="text-sm text-[#6E6E73]">
                    {loading
                      ? (lang === 'th' ? 'กำลังโหลด...' : 'Loading...')
                      : `${filtered.length} ${b.results[lang]}`}
                  </span>
                  {!loading && (
                    <div className="flex items-center gap-2 text-xs text-[#6E6E73]">
                      <span className="hidden sm:inline">{b.sortLabel[lang]}:</span>
                      <div className="flex gap-1 bg-[#F5F5F7] dark:bg-[#2C2C2E] rounded-lg p-0.5">
                        {(['deadline', 'amount', 'name'] as SortKey[]).map((key) => (
                          <button
                            key={key}
                            onClick={() => setSortKey(key)}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                              sortKey === key
                                ? 'bg-white dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-white shadow-sm'
                                : 'text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white'
                            }`}
                          >
                            {key === 'deadline'
                              ? b.sortDeadline[lang]
                              : key === 'amount'
                              ? b.sortAmount[lang]
                              : (lang === 'th' ? 'ก–ฮ' : 'A–Z')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[...Array(6)].map((_, i) => <div key={i} className="h-52 bg-[#F5F5F7] rounded-[12px] animate-pulse" />)}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-24">
                    <div className="text-4xl mb-4">🔍</div>
                    <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2">{b.noResults[lang]}</h3>
                    <p className="text-[#6E6E73] text-sm mb-6">{b.noResultsSub[lang]}</p>
                    <button
                      onClick={() => { setFilters(EMPTY_FILTERS); }}
                      className="text-sm text-[#F0A500] font-medium hover:underline"
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
