'use client';

/**
 * /admin — TunDee Admin Dashboard
 *
 * Tab 1 — 📋 Scholarships: manage active/inactive scholarships
 * Tab 2 — ➕ Add New:     add a scholarship to the DB
 * Tab 3 — 📊 Analytics:   user stats, trend chart, province distribution
 *
 * Access guard: NEXT_PUBLIC_ADMIN_EMAIL env var.
 * Non-admins are redirected to / instantly.
 *
 * Analytics data requires admin_views.sql to be run in Supabase first.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import type { Scholarship, FunderType, AmountType } from '@/lib/types';

// ── CHANGE THIS to match NEXT_PUBLIC_ADMIN_EMAIL in your .env.local ──────────
// If NEXT_PUBLIC_ADMIN_EMAIL is set as an env var this is used as fallback.
// The primary guard uses the env var. Add more emails if needed.
const ADMIN_EMAILS: string[] = [
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '',
  // 'second-admin@example.com',   // add more admin emails here
].filter(Boolean);

// ── Province names lookup ─────────────────────────────────────────────────────
const PROVINCE_NAMES: Record<string, string> = {
  กรุงเทพมหานคร: 'กรุงเทพฯ', เชียงใหม่: 'เชียงใหม่', ขอนแก่น: 'ขอนแก่น',
  นครราชสีมา: 'นครราชสีมา', สุราษฎร์ธานี: 'สุราษฎร์ฯ', สงขลา: 'สงขลา',
  อุดรธานี: 'อุดรธานี', สุรินทร์: 'สุรินทร์', ชลบุรี: 'ชลบุรี',
  ภูเก็ต: 'ภูเก็ต', เชียงราย: 'เชียงราย', อุบลราชธานี: 'อุบลราชธานี',
  นครศรีธรรมราช: 'นครศรีธรรมราช', สกลนคร: 'สกลนคร', บุรีรัมย์: 'บุรีรัมย์',
};

function provinceName(id: string): string {
  return PROVINCE_NAMES[id] ?? id;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'list' | 'add' | 'analytics';
type SortField = 'created_at' | 'amount_thb' | 'name_th';
type Range = '7' | '30' | '90' | '365';

interface SummaryStats {
  total_users:       number;
  new_users_7d:      number;
  new_users_30d:     number;
  active_today:      number;
  active_7d:         number;
  active_30d:        number;
  total_saves:       number;
  in_progress:       number;
  submitted:         number;
  won:               number;
  active_scholarships: number;
  profiles_complete: number;
  welfare_card_users: number;
}

interface TrendPoint {
  day: string;
  new_users: number;
  active_users: number;
}

interface TopScholarship {
  id: string;
  name_th: string;
  name_en: string | null;
  funder_name_th: string | null;
  tier: string | null;
  amount_thb: number | null;
  is_active: boolean;
  total_saves: number;
  in_progress: number;
  submitted: number;
  won: number;
}

interface ProvinceRow {
  province_id: string;
  user_count: number;
  percentage: number;
}

interface RecentProfile {
  id: string;
  display_name: string | null;
  province_id: string | null;
  gpa: string | null;
  welfare_card: boolean | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FUNDER_TYPES: FunderType[] = ['government', 'corporate', 'foundation', 'royal', 'university'];
const AMOUNT_TYPES: AmountType[] = ['annual', 'monthly', 'one-time'];

const EMPTY_FORM = {
  name_th: '',            name_en: '',
  funder_name_th: '',     funder_name_en: '',
  funder_type: 'government' as FunderType,
  amount_thb: '',         amount_type: 'annual' as AmountType,
  min_gpa: '',            max_income_thb: '',
  field_of_study: '',     province_restriction: '',
  welfare_card_priority: false,
  deadline_date: '',      application_url: '',
  documents_required: '', description_th: '',
  description_en: '',     historical_bias_score: '0.5',
  grade_levels: '',
};

const ZERO_STATS: SummaryStats = {
  total_users: 0, new_users_7d: 0, new_users_30d: 0,
  active_today: 0, active_7d: 0, active_30d: 0,
  total_saves: 0, in_progress: 0, submitted: 0, won: 0,
  active_scholarships: 0, profiles_complete: 0, welfare_card_users: 0,
};

function Spinner({ size = 5 }: { size?: number }) {
  return (
    <svg className={`animate-spin w-${size} h-${size} text-[#F0A500]`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-4"
        style={{ borderLeft: '3px solid #F0A500', paddingLeft: 12 }}>
      {children}
    </h2>
  );
}

function StatCard({ label, value, icon, accent = false }: {
  label: string; value: number | string; icon: string; accent?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">{label}</span>
      </div>
      <div className={`text-3xl font-bold ${accent ? 'text-[#F0A500]' : 'text-[#1D1D1F] dark:text-white'}`}>
        {value}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router  = useRouter();
  const supabase = createClient();

  const [loading,    setLoading]    = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [tab,        setTab]        = useState<Tab>('list');

  // ── List tab ──────────────────────────────────────────────────────────────
  const [scholarships,  setScholarships]  = useState<Scholarship[]>([]);
  const [listLoading,   setListLoading]   = useState(false);
  const [sortField,     setSortField]     = useState<SortField>('created_at');
  const [filterActive,  setFilterActive]  = useState<'all' | 'active' | 'inactive'>('all');
  const [search,        setSearch]        = useState('');
  const [togglingId,    setTogglingId]    = useState<string | null>(null);

  // ── Add tab ───────────────────────────────────────────────────────────────
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState('');
  const [saveError, setSaveError] = useState('');

  // ── Analytics tab ─────────────────────────────────────────────────────────
  const [statsLoading,   setStatsLoading]   = useState(false);
  const [statsError,     setStatsError]     = useState('');
  const [summary,        setSummary]        = useState<SummaryStats>(ZERO_STATS);
  const [trend,          setTrend]          = useState<TrendPoint[]>([]);
  const [trendRange,     setTrendRange]     = useState<Range>('30');
  const [topScholarships, setTopScholarships] = useState<TopScholarship[]>([]);
  const [provinces,      setProvinces]      = useState<ProvinceRow[]>([]);
  const [recentProfiles, setRecentProfiles] = useState<RecentProfile[]>([]);
  const [mounted,        setMounted]        = useState(false);   // hydration guard for recharts

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/auth'); return; }
      const email = data.session.user.email ?? '';
      const isAdmin = adminEmail ? email === adminEmail : ADMIN_EMAILS.includes(email);
      if (!isAdmin) { router.replace('/'); return; }
      setAuthorized(true);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load scholarships list ────────────────────────────────────────────────
  const fetchScholarships = useCallback(async () => {
    setListLoading(true);
    const { data } = await supabase
      .from('scholarships')
      .select('*')
      .order(sortField, { ascending: sortField === 'name_th' });
    setScholarships((data as Scholarship[]) ?? []);
    setListLoading(false);
  }, [supabase, sortField]);

  useEffect(() => {
    if (authorized) fetchScholarships();
  }, [authorized, fetchScholarships]);

  // ── Load analytics data ───────────────────────────────────────────────────
  const loadDashboardData = useCallback(async () => {
    setStatsLoading(true);
    setStatsError('');
    try {
      // Try the admin_summary view first; fall back to direct queries if view doesn't exist
      const [summaryRes, trendRes, activeRes, topRes, provinceRes, recentRes] = await Promise.all([
        supabase.from('admin_summary').select('*').maybeSingle(),
        supabase.from('admin_daily_signups').select('*'),
        supabase.from('admin_daily_active').select('*'),
        supabase.from('admin_top_scholarships').select('*').limit(10),
        supabase.from('admin_province_stats').select('*').limit(15),
        supabase.from('profiles')
          .select('id, display_name, province_id, gpa, welfare_card, created_at')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      // Summary stats
      if (summaryRes.data) {
        const d = summaryRes.data as Record<string, number>;
        setSummary({
          total_users:         d.total_users        ?? 0,
          new_users_7d:        d.new_users_7d       ?? 0,
          new_users_30d:       d.new_users_30d      ?? 0,
          active_today:        d.active_today       ?? 0,
          active_7d:           d.active_7d          ?? 0,
          active_30d:          d.active_30d         ?? 0,
          total_saves:         d.total_saves        ?? 0,
          in_progress:         d.in_progress        ?? 0,
          submitted:           d.submitted          ?? 0,
          won:                 d.won                ?? 0,
          active_scholarships: d.active_scholarships ?? 0,
          profiles_complete:   d.profiles_complete  ?? 0,
          welfare_card_users:  d.welfare_card_users ?? 0,
        });
      } else {
        // View doesn't exist yet — show zeros (developer needs to run admin_views.sql)
        setSummary(ZERO_STATS);
        setStatsError('Run scripts/admin_views.sql in Supabase to enable analytics.');
      }

      // Trend data — merge daily_signups + daily_active by day
      const signupMap = new Map<string, number>();
      const activeMap = new Map<string, number>();
      (trendRes.data ?? []).forEach((r: Record<string, unknown>) => {
        signupMap.set(String(r.day), Number(r.new_users) || 0);
      });
      (activeRes.data ?? []).forEach((r: Record<string, unknown>) => {
        activeMap.set(String(r.day), Number(r.active_users) || 0);
      });
      const allDays = new Set(Array.from(signupMap.keys()).concat(Array.from(activeMap.keys())));
      const merged: TrendPoint[] = Array.from(allDays)
        .sort()
        .map(day => ({
          day,
          new_users:    signupMap.get(day)  ?? 0,
          active_users: activeMap.get(day)  ?? 0,
        }));
      setTrend(merged);

      // Top scholarships
      setTopScholarships((topRes.data ?? []) as TopScholarship[]);

      // Province distribution
      setProvinces((provinceRes.data ?? []) as ProvinceRow[]);

      // Recent profiles
      setRecentProfiles((recentRes.data ?? []) as RecentProfile[]);
    } catch (err) {
      console.error('[TunDee] Admin analytics load error:', err);
      setStatsError('Could not load analytics data. Check console for details.');
    } finally {
      setStatsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (authorized && tab === 'analytics') {
      loadDashboardData();
    }
  }, [authorized, tab, loadDashboardData]);

  // Auto-refresh analytics every 5 minutes
  useEffect(() => {
    if (!authorized || tab !== 'analytics') return;
    const interval = setInterval(loadDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [authorized, tab, loadDashboardData]);

  // ── Toggle scholarship active ─────────────────────────────────────────────
  async function toggleActive(s: Scholarship) {
    setTogglingId(s.id);
    await supabase
      .from('scholarships')
      .update({ is_active: !s.is_active })
      .eq('id', s.id);
    setScholarships(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !x.is_active } : x));
    setTogglingId(null);
  }

  // ── Add scholarship ───────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(''); setSaveMsg('');
    if (!form.name_th.trim()) { setSaveError('Name (Thai) is required.'); return; }
    setSaving(true);
    const parseArr = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
    const parseNum = (s: string) => s === '' ? null : parseFloat(s);
    const payload = {
      name_th: form.name_th.trim(), name_en: form.name_en.trim() || null,
      funder_name_th: form.funder_name_th.trim() || null,
      funder_name_en: form.funder_name_en.trim() || null,
      funder_type: form.funder_type, amount_thb: parseNum(form.amount_thb),
      amount_type: form.amount_type, min_gpa: parseNum(form.min_gpa),
      max_income_thb: parseNum(form.max_income_thb),
      field_of_study: form.field_of_study ? parseArr(form.field_of_study) : null,
      province_restriction: form.province_restriction ? parseArr(form.province_restriction) : null,
      welfare_card_priority: form.welfare_card_priority,
      deadline_date: form.deadline_date || null,
      application_url: form.application_url.trim() || null,
      documents_required: form.documents_required ? parseArr(form.documents_required) : null,
      description_th: form.description_th.trim() || null,
      description_en: form.description_en.trim() || null,
      historical_bias_score: parseNum(form.historical_bias_score) ?? 0.5,
      grade_levels: form.grade_levels ? parseArr(form.grade_levels) : null,
      is_active: true,
    };
    const { error } = await supabase.from('scholarships').insert(payload);
    if (error) { setSaveError(error.message); }
    else { setSaveMsg(`✓ "${form.name_th}" added.`); setForm(EMPTY_FORM); fetchScholarships(); }
    setSaving(false);
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const filtered = scholarships.filter(s => {
    if (filterActive === 'active'   && !s.is_active) return false;
    if (filterActive === 'inactive' &&  s.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name_th.toLowerCase().includes(q) ||
        (s.name_en ?? '').toLowerCase().includes(q) ||
        (s.funder_name_th ?? '').toLowerCase().includes(q);
    }
    return true;
  });
  const activeCount   = scholarships.filter(s =>  s.is_active).length;
  const inactiveCount = scholarships.filter(s => !s.is_active).length;

  const trendFiltered = (() => {
    const days = parseInt(trendRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return trend.filter(t => new Date(t.day) >= cutoff);
  })();

  // ── Loading / auth gate ───────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-[#F5F5F7] dark:bg-[#111111] flex items-center justify-center">
        <Spinner size={8} />
      </main>
    );
  }
  if (!authorized) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#F5F5F7] dark:bg-[#111111] pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚙️</span>
              <h1 className="text-2xl font-semibold text-[#1D1D1F] dark:text-white">
                TunDee Admin Dashboard
              </h1>
              <span className="text-xs font-bold bg-[#F0A500] text-white px-2.5 py-0.5 rounded-full">
                ADMIN
              </span>
            </div>
            <a href="/" className="text-sm text-[#6E6E73] hover:text-[#F0A500] transition-colors">
              ← Back to site
            </a>
          </div>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-4">
            Manage TunDee scholarship data and view platform analytics
          </p>

          {/* Scholarship counts */}
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Total', value: scholarships.length, color: 'bg-white dark:bg-[#1D1D1F] text-[#1D1D1F] dark:text-white' },
              { label: 'Active', value: activeCount, color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
              { label: 'Inactive', value: inactiveCount, color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' },
            ].map(stat => (
              <div key={stat.label}
                className={`px-4 py-2 rounded-xl border border-[#E5E5EA] dark:border-[#3A3A3C] ${stat.color}`}>
                <div className="text-lg font-semibold">{stat.value}</div>
                <div className="text-xs">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex rounded-xl bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] p-1 w-fit mb-6 overflow-x-auto">
          {([
            { key: 'list',      label: '📋 Scholarships' },
            { key: 'add',       label: '➕ Add New' },
            { key: 'analytics', label: '📊 Analytics' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                tab === key
                  ? 'bg-[#F0A500] text-white shadow-sm'
                  : 'text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TAB 1 — SCHOLARSHIP LIST
        ════════════════════════════════════════════════════════════════ */}
        {tab === 'list' && (
          <div className="bg-white dark:bg-[#1D1D1F] rounded-2xl border border-[#E5E5EA] dark:border-[#3A3A3C] overflow-hidden">
            <div className="flex flex-wrap gap-3 p-4 border-b border-[#E5E5EA] dark:border-[#3A3A3C]">
              <input
                type="text" placeholder="Search by name or funder..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] text-sm bg-white dark:bg-[#2C2C2E] focus:outline-none focus:ring-2 focus:ring-[#F0A500] text-[#1D1D1F] dark:text-white"
              />
              <select value={filterActive}
                onChange={e => setFilterActive(e.target.value as typeof filterActive)}
                className="px-3 py-2 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] text-sm bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white focus:outline-none">
                <option value="all">All status</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
              <select value={sortField}
                onChange={e => setSortField(e.target.value as SortField)}
                className="px-3 py-2 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] text-sm bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white focus:outline-none">
                <option value="created_at">Sort: Newest</option>
                <option value="amount_thb">Sort: Amount</option>
                <option value="name_th">Sort: Name A–Z</option>
              </select>
              <button onClick={fetchScholarships}
                className="px-4 py-2 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] text-sm text-[#6E6E73] hover:border-[#F0A500] dark:hover:border-[#F0A500] transition-colors">
                ↻ Refresh
              </button>
            </div>

            {listLoading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-[#6E6E73] text-sm">No scholarships found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E5EA] dark:border-[#3A3A3C] bg-[#F5F5F7] dark:bg-[#2C2C2E]">
                      {['Name', 'Funder', 'Amount', 'Bias Score', 'Status', 'Toggle'].map(h => (
                        <th key={h} className={`px-4 py-3 font-medium text-[#6E6E73] dark:text-[#8E8E93] ${h === 'Amount' ? 'text-right' : h === 'Bias Score' || h === 'Status' || h === 'Toggle' ? 'text-center' : 'text-left'}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s, i) => (
                      <tr key={s.id}
                        className={`border-b border-[#F5F5F7] dark:border-[#3A3A3C] hover:bg-[#FAFAFA] dark:hover:bg-[#2C2C2E] ${i % 2 !== 0 ? 'bg-[#FDFDFD] dark:bg-[#252525]' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#1D1D1F] dark:text-white leading-tight">{s.name_th}</div>
                          {s.name_en && <div className="text-xs text-[#6E6E73] mt-0.5">{s.name_en}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[#1D1D1F] dark:text-white">{s.funder_name_th ?? '—'}</div>
                          <div className="text-xs text-[#ADADB8] capitalize">{s.funder_type ?? ''}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {s.amount_thb != null
                            ? <span className="font-medium text-[#1D1D1F] dark:text-white">{s.amount_thb.toLocaleString()} ฿</span>
                            : <span className="text-[#ADADB8]">—</span>}
                          {s.amount_type && <div className="text-xs text-[#ADADB8]">{s.amount_type}</div>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(s as Scholarship & { historical_bias_score?: number }).historical_bias_score != null ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              ((s as Scholarship & { historical_bias_score?: number }).historical_bias_score ?? 0.5) <= 0.3
                                ? 'bg-green-50 text-green-700'
                                : ((s as Scholarship & { historical_bias_score?: number }).historical_bias_score ?? 0.5) >= 0.7
                                  ? 'bg-red-50 text-red-600'
                                  : 'bg-gray-100 text-gray-600'
                            }`}>
                              {((s as Scholarship & { historical_bias_score?: number }).historical_bias_score ?? 0.5).toFixed(1)}
                            </span>
                          ) : <span className="text-[#ADADB8]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-50 text-green-700' : 'bg-[#F5F5F7] text-[#6E6E73]'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-green-500' : 'bg-[#ADADB8]'}`} />
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => toggleActive(s)} disabled={togglingId === s.id}
                            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${s.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}>
                            {togglingId === s.id ? <Spinner size={3} /> : s.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-2 border-t border-[#F5F5F7] dark:border-[#3A3A3C] text-xs text-[#ADADB8]">
              Showing {filtered.length} of {scholarships.length} scholarships
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 2 — ADD SCHOLARSHIP
        ════════════════════════════════════════════════════════════════ */}
        {tab === 'add' && (
          <form onSubmit={handleAdd}
            className="bg-white dark:bg-[#1D1D1F] rounded-2xl border border-[#E5E5EA] dark:border-[#3A3A3C] p-6 space-y-6">
            <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white">Add New Scholarship</h2>
            {saveMsg && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{saveMsg}</p>}
            {saveError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>}

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Names</legend>
              <Field label="Name (Thai) *" value={form.name_th} onChange={v => setForm(f => ({ ...f, name_th: v }))} placeholder="ทุน..." />
              <Field label="Name (English)" value={form.name_en} onChange={v => setForm(f => ({ ...f, name_en: v }))} placeholder="Scholarship..." />
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Funder</legend>
              <Field label="Funder Name (Thai)" value={form.funder_name_th} onChange={v => setForm(f => ({ ...f, funder_name_th: v }))} />
              <Field label="Funder Name (English)" value={form.funder_name_en} onChange={v => setForm(f => ({ ...f, funder_name_en: v }))} />
              <div>
                <label className="block text-sm font-medium text-[#1D1D1F] dark:text-white mb-1">Funder Type</label>
                <select value={form.funder_type} onChange={e => setForm(f => ({ ...f, funder_type: e.target.value as FunderType }))}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] text-sm bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F0A500]">
                  {FUNDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Amount</legend>
              <Field label="Amount (THB)" value={form.amount_thb} onChange={v => setForm(f => ({ ...f, amount_thb: v }))} type="number" placeholder="50000" />
              <div>
                <label className="block text-sm font-medium text-[#1D1D1F] dark:text-white mb-1">Amount Type</label>
                <select value={form.amount_type} onChange={e => setForm(f => ({ ...f, amount_type: e.target.value as AmountType }))}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] text-sm bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F0A500]">
                  {AMOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Eligibility</legend>
              <Field label="Min GPA" value={form.min_gpa} onChange={v => setForm(f => ({ ...f, min_gpa: v }))} type="number" placeholder="2.50" />
              <Field label="Max Income (THB/year)" value={form.max_income_thb} onChange={v => setForm(f => ({ ...f, max_income_thb: v }))} type="number" placeholder="360000" />
              <Field label="Grade Levels (comma-separated)" value={form.grade_levels} onChange={v => setForm(f => ({ ...f, grade_levels: v }))} placeholder="M4,M5,M6,uni,graduate" />
              <Field label="Field of Study (comma-separated)" value={form.field_of_study} onChange={v => setForm(f => ({ ...f, field_of_study: v }))} placeholder="วิศวกรรมศาสตร์,วิทยาศาสตร์" />
              <Field label="Province Restriction (comma-separated, blank = all)" value={form.province_restriction} onChange={v => setForm(f => ({ ...f, province_restriction: v }))} placeholder="ขอนแก่น,อุดรธานี" />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.welfare_card_priority}
                  onChange={e => setForm(f => ({ ...f, welfare_card_priority: e.target.checked }))}
                  className="accent-[#F0A500]" />
                <span className="text-sm text-[#1D1D1F] dark:text-white">Welfare card priority</span>
              </label>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Details</legend>
              <Field label="Deadline Date" value={form.deadline_date} onChange={v => setForm(f => ({ ...f, deadline_date: v }))} type="date" />
              <Field label="Application URL" value={form.application_url} onChange={v => setForm(f => ({ ...f, application_url: v }))} placeholder="https://..." />
              <Field label="Documents Required (comma-separated)" value={form.documents_required} onChange={v => setForm(f => ({ ...f, documents_required: v }))} placeholder="สำเนาบัตรประชาชน,ใบแสดงผลการเรียน" />
              <TextareaField label="Description (Thai)" value={form.description_th} onChange={v => setForm(f => ({ ...f, description_th: v }))} />
              <TextareaField label="Description (English)" value={form.description_en} onChange={v => setForm(f => ({ ...f, description_en: v }))} />
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">Fairness</legend>
              <Field label="Historical Bias Score (0.1 = rural-friendly · 0.5 = neutral · 0.9 = urban-biased)"
                value={form.historical_bias_score}
                onChange={v => setForm(f => ({ ...f, historical_bias_score: v }))}
                type="number" placeholder="0.5" />
            </fieldset>

            <button type="submit" disabled={saving}
              className="w-full bg-[#F0A500] hover:bg-[#D4920A] text-white font-semibold py-3 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Spinner />}
              Add Scholarship
            </button>
          </form>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 3 — ANALYTICS DASHBOARD
        ════════════════════════════════════════════════════════════════ */}
        {tab === 'analytics' && (
          <div className="space-y-6">

            {/* Header + refresh */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#1D1D1F] dark:text-white">Platform Analytics</h2>
                <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-0.5">
                  Auto-refreshes every 5 minutes
                </p>
              </div>
              <button
                onClick={loadDashboardData}
                disabled={statsLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] text-sm text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#F0A500] hover:text-[#F0A500] transition-colors disabled:opacity-50"
              >
                {statsLoading ? <Spinner size={4} /> : '🔄'}
                รีเฟรช / Refresh
              </button>
            </div>

            {statsError && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-400">
                ⚠️ {statsError}
              </div>
            )}

            {/* ── SECTION 1: User summary cards ──────────────────────────── */}
            <div className="bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-2xl p-6">
              <SectionHead>👥 Users</SectionHead>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <StatCard label="Total Users"     value={summary.total_users}  icon="👥" accent />
                <StatCard label="New (7 days)"    value={summary.new_users_7d} icon="📈" />
                <StatCard label="New (30 days)"   value={summary.new_users_30d} icon="📅" />
                <StatCard label="Active Today"    value={summary.active_today} icon="🟢" />
                <StatCard label="Active (7 days)" value={summary.active_7d}   icon="📊" />
                <StatCard label="Active (30 days)" value={summary.active_30d} icon="📊" />
              </div>
              <div className="flex flex-wrap gap-4 pt-4 border-t border-[#F5F5F7] dark:border-[#3A3A3C] text-sm text-[#6E6E73] dark:text-[#8E8E93]">
                <span>✅ Profiles complete (has GPA): <strong className="text-[#1D1D1F] dark:text-white">{summary.profiles_complete}</strong></span>
                <span>🪪 Welfare card users: <strong className="text-[#1D1D1F] dark:text-white">{summary.welfare_card_users}</strong></span>
              </div>
            </div>

            {/* ── SECTION 2: Engagement stats ────────────────────────────── */}
            <div className="bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-2xl p-6">
              <SectionHead>♡ Scholarship Engagement</SectionHead>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <StatCard label="Total Saves"   value={summary.total_saves}         icon="♡" />
                <StatCard label="In Progress"   value={summary.in_progress}         icon="📋" />
                <StatCard label="Submitted"     value={summary.submitted}           icon="✓" />
                <StatCard label="Won 🏆"        value={summary.won}                 icon="🎓" accent />
              </div>
              <div className="flex flex-wrap gap-4 pt-4 border-t border-[#F5F5F7] dark:border-[#3A3A3C] text-sm text-[#6E6E73] dark:text-[#8E8E93]">
                <span>📚 Active scholarships in DB: <strong className="text-[#1D1D1F] dark:text-white">{summary.active_scholarships}</strong></span>
                {summary.total_saves > 0 && (
                  <span>📊 Conversion rate (won / saved): <strong className="text-[#F0A500]">
                    {((summary.won / summary.total_saves) * 100).toFixed(1)}%
                  </strong></span>
                )}
              </div>
            </div>

            {/* ── SECTION 3: Signup trend chart ───────────────────────────── */}
            <div className="bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-2xl p-6">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <SectionHead>📈 Growth Trend</SectionHead>
                {/* Range selector */}
                <div className="flex gap-1">
                  {(['7', '30', '90', '365'] as Range[]).map(r => (
                    <button key={r} onClick={() => setTrendRange(r)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        trendRange === r
                          ? 'bg-[#F0A500] text-white'
                          : 'bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#6E6E73] dark:text-[#8E8E93] hover:bg-[#E5E5EA]'
                      }`}>
                      {r === '365' ? '1 ปี' : `${r} วัน`}
                    </button>
                  ))}
                </div>
              </div>

              {statsLoading ? (
                <div className="flex justify-center py-16"><Spinner /></div>
              ) : !mounted ? null : trendFiltered.length === 0 ? (
                <div className="text-center py-16 text-[#6E6E73] text-sm">
                  No data yet — run admin_views.sql in Supabase to enable trend tracking.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendFiltered} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F7" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: '#6E6E73' }}
                      tickFormatter={day => {
                        const d = new Date(day);
                        return `${d.getDate()} ${d.toLocaleString('th-TH', { month: 'short' })}`;
                      }}
                      interval={trendRange === '7' ? 0 : 'preserveStartEnd'}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#6E6E73' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#1D1D1F',
                        border: '1px solid #38383A',
                        borderRadius: 8,
                        fontSize: 12,
                        color: '#F5F5F7',
                      }}
                      labelFormatter={label => {
                        const d = new Date(label as string);
                        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
                      }}
                    />
                    <Legend
                      formatter={value => value === 'new_users' ? 'ผู้ใช้ใหม่' : 'ผู้ใช้ active'}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <Line
                      type="monotone" dataKey="new_users" name="new_users"
                      stroke="#F0A500" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone" dataKey="active_users" name="active_users"
                      stroke="#34C759" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── SECTION 4: Top scholarships ──────────────────────────────── */}
            <div className="bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-2xl p-6">
              <SectionHead>🏆 Top Scholarships by Saves</SectionHead>
              {statsLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : topScholarships.length === 0 ? (
                <p className="text-sm text-[#6E6E73] py-4">No data yet. Run admin_views.sql to enable.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E5E5EA] dark:border-[#3A3A3C]">
                        {['#', 'ชื่อทุน', 'Tier', 'จำนวนเงิน', 'บันทึก', 'กำลังสมัคร', 'ส่งแล้ว', 'ได้ทุน'].map(h => (
                          <th key={h} className={`pb-3 pt-1 font-medium text-[#6E6E73] dark:text-[#8E8E93] text-xs ${h === '#' ? 'text-left' : h === 'ชื่อทุน' ? 'text-left' : 'text-center'}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topScholarships.map((s, i) => (
                        <tr key={s.id}
                          className={`border-b border-[#F5F5F7] dark:border-[#3A3A3C] hover:bg-[#FAFAFA] dark:hover:bg-[#2C2C2E] ${i % 2 !== 0 ? 'bg-[#FDFDFD] dark:bg-[#252525]' : ''}`}>
                          <td className="py-3 pr-2 text-[#ADADB8] text-xs font-medium">{i + 1}</td>
                          <td className="py-3 pr-4 min-w-[160px]">
                            <div className="font-medium text-[#1D1D1F] dark:text-white leading-tight line-clamp-2">{s.name_th}</div>
                            {s.funder_name_th && <div className="text-xs text-[#6E6E73] mt-0.5">{s.funder_name_th}</div>}
                          </td>
                          <td className="py-3 text-center">
                            {s.tier ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                s.tier === 'SAFETY' ? 'bg-green-50 text-green-700'
                                  : s.tier === 'TARGET' ? 'bg-amber-50 text-amber-700'
                                  : 'bg-red-50 text-red-600'
                              }`}>
                                {s.tier === 'SAFETY' ? '🟢' : s.tier === 'TARGET' ? '🟡' : '🔴'}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-3 text-center text-[#F0A500] font-medium">
                            {s.amount_thb != null ? `${s.amount_thb.toLocaleString()}฿` : '—'}
                          </td>
                          <td className="py-3 text-center font-semibold text-[#1D1D1F] dark:text-white">{s.total_saves}</td>
                          <td className="py-3 text-center text-[#6E6E73]">{s.in_progress}</td>
                          <td className="py-3 text-center text-[#6E6E73]">{s.submitted}</td>
                          <td className="py-3 text-center">
                            {s.won > 0
                              ? <span className="text-[#F0A500] font-bold">{s.won}</span>
                              : <span className="text-[#ADADB8]">0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── SECTION 5: Province distribution ────────────────────────── */}
            <div className="bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-2xl p-6">
              <SectionHead>🗺️ Province Distribution (Top 10)</SectionHead>
              {statsLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : provinces.length === 0 ? (
                <p className="text-sm text-[#6E6E73] py-4">No province data yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {provinces.slice(0, 10).map(p => (
                    <div key={p.province_id} className="flex items-center gap-3">
                      <span className="text-sm text-right truncate w-28 text-[#1D1D1F] dark:text-white shrink-0">
                        {provinceName(p.province_id)}
                      </span>
                      <div className="flex-1 bg-[#F5F5F7] dark:bg-[#2C2C2E] rounded-full h-5 overflow-hidden relative">
                        <div
                          className="h-5 bg-[#F0A500] rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, p.percentage)}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93] whitespace-nowrap w-28">
                        {p.user_count} คน ({p.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── SECTION 6: Recent profiles ───────────────────────────────── */}
            <div className="bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-2xl p-6">
              <SectionHead>🕐 Recently Joined (last 20)</SectionHead>
              {statsLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : recentProfiles.length === 0 ? (
                <p className="text-sm text-[#6E6E73] py-4">No profiles yet. Requires admin RLS policy (admin_views.sql).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E5E5EA] dark:border-[#3A3A3C]">
                        {['#', 'ผู้ใช้', 'จังหวัด', 'GPA', 'บัตรสวัสดิการ', 'สมัครเมื่อ'].map((h, i) => (
                          <th key={h} className={`pb-3 pt-1 text-xs font-medium text-[#6E6E73] dark:text-[#8E8E93] ${i === 0 || i === 1 ? 'text-left' : 'text-center'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentProfiles.map((p, i) => {
                        const name = p.display_name ?? `User #${i + 1}`;
                        const date = new Date(p.created_at).toLocaleDateString('th-TH', {
                          day: 'numeric', month: 'short', year: '2-digit'
                        });
                        return (
                          <tr key={p.id}
                            className={`border-b border-[#F5F5F7] dark:border-[#3A3A3C] hover:bg-[#FAFAFA] dark:hover:bg-[#2C2C2E] ${i % 2 !== 0 ? 'bg-[#FDFDFD] dark:bg-[#252525]' : ''}`}>
                            <td className="py-2.5 pr-2 text-[#ADADB8] text-xs">{i + 1}</td>
                            <td className="py-2.5 pr-3">
                              <span className="font-medium text-[#1D1D1F] dark:text-white">{name}</span>
                            </td>
                            <td className="py-2.5 text-center text-[#6E6E73] dark:text-[#8E8E93] hidden sm:table-cell">
                              {p.province_id ? provinceName(p.province_id) : '—'}
                            </td>
                            <td className="py-2.5 text-center">
                              {p.gpa ? (
                                <span className="text-[#1D1D1F] dark:text-white font-medium">{p.gpa}</span>
                              ) : (
                                <span className="text-[#ADADB8]">—</span>
                              )}
                            </td>
                            <td className="py-2.5 text-center hidden sm:table-cell">
                              {p.welfare_card
                                ? <span className="text-green-600">✓</span>
                                : <span className="text-[#ADADB8]">—</span>}
                            </td>
                            <td className="py-2.5 text-center text-[#6E6E73] dark:text-[#8E8E93] text-xs">{date}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}

// ── Reusable field components ────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1D1D1F] dark:text-white mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] text-sm bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F0A500]"
      />
    </div>
  );
}

function TextareaField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1D1D1F] dark:text-white mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={3}
        className="w-full px-3 py-2 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] text-sm bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F0A500] resize-y"
      />
    </div>
  );
}
