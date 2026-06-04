'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import TierBadge from '@/components/TierBadge';
import { getDeadlineInfo, DEADLINE_COLOR_MAP } from '@/lib/deadline';
import type { Scholarship } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Application {
  id: string;
  user_id: string;
  scholarship_id: string;
  status: 'viewing' | 'started' | 'in_progress' | 'submitted' | 'won' | 'lost' | 'no_reply';
  checklist_progress: number[];
  clicked_through_at: string | null;
  created_at: string;
  updated_at?: string;
  scholarships?: Scholarship | null;
}

type SectionType = 'in_progress' | 'saved' | 'history';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAmount(amount: number | null, type: string | null, lang: string): string {
  if (amount === null) return lang === 'th' ? 'ติดต่อโดยตรง' : 'Contact directly';
  const formatted = amount.toLocaleString('th-TH');
  if (type === 'monthly') return `฿${formatted}/${lang === 'th' ? 'เดือน' : 'mo'}`;
  if (type === 'annual') return `฿${formatted}/${lang === 'th' ? 'ปี' : 'yr'}`;
  return `฿${formatted}`;
}

const STATUS_CONFIG = {
  won:       { emoji: '🏆', th: 'ได้รับทุน',  en: 'Won',        color: 'text-green-600  dark:text-green-400',  bg: 'bg-green-50  dark:bg-green-900/20' },
  submitted: { emoji: '✓',  th: 'ส่งแล้ว',    en: 'Submitted',  color: 'text-blue-600   dark:text-blue-400',   bg: 'bg-blue-50   dark:bg-blue-900/20'  },
  lost:      { emoji: '✗',  th: 'ไม่ผ่าน',   en: 'Not selected',color: 'text-[#6E6E73]  dark:text-[#8E8E93]', bg: 'bg-gray-100  dark:bg-gray-800/40'  },
  no_reply:  { emoji: '⏳', th: 'รอผล',       en: 'Awaiting',   color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
} as const;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#38383A] rounded-[12px] p-5 animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full mt-4" />
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  emoji: string;
  th: string;
  en: string;
  lang: string;
  link?: { href: string; th: string; en: string };
}

function EmptyState({ emoji, th, en, lang, link }: EmptyStateProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-10 text-center">
      <span className="text-4xl mb-3">{emoji}</span>
      <p className="text-[#6E6E73] dark:text-[#8E8E93] text-sm">
        {lang === 'th' ? th : en}
      </p>
      {link && (
        <Link
          href={link.href}
          className="mt-3 text-sm font-medium text-[#F0A500] hover:text-[#D4920A] transition-colors"
        >
          {lang === 'th' ? link.th : link.en}
        </Link>
      )}
    </div>
  );
}

// ─── Application Card ─────────────────────────────────────────────────────────

interface AppCardProps {
  app: Application;
  section: SectionType;
  lang: string;
  onDelete?: (appId: string) => void;
  onStatusUpdate?: (appId: string, status: Application['status']) => void;
}

function ApplicationCard({ app, section, lang, onDelete, onStatusUpdate }: AppCardProps) {
  const scholarship = app.scholarships ?? null;
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const name = scholarship
    ? (lang === 'th' ? scholarship.name_th : (scholarship.name_en ?? scholarship.name_th))
    : app.scholarship_id;

  const funder = scholarship
    ? (lang === 'th' ? scholarship.funder_name_th : (scholarship.funder_name_en ?? scholarship.funder_name_th))
    : null;

  const deadline = scholarship ? getDeadlineInfo(scholarship.deadline_date ?? null) : null;
  const deadlineColors = deadline ? DEADLINE_COLOR_MAP[deadline.color] ?? DEADLINE_COLOR_MAP['gray'] : null;

  const progress = Array.isArray(app.checklist_progress) ? app.checklist_progress.length : 0;
  const progressPct = Math.min(100, (progress / 7) * 100);

  const actionLabel =
    section === 'in_progress'
      ? lang === 'th' ? 'ดำเนินการต่อ →' : 'Continue →'
      : section === 'saved'
      ? lang === 'th' ? 'เริ่มสมัคร →' : 'Start Applying →'
      : lang === 'th' ? 'ดูรายละเอียด →' : 'View Details →';

  const historyStatus = STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG] ?? null;
  const detailHref = scholarship ? `/scholarships/${scholarship.id}` : `/scholarships/${app.scholarship_id}`;

  return (
    <div className="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#38383A] rounded-[12px] p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-white leading-snug line-clamp-2">
            {name}
          </h3>
          {funder && (
            <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-0.5 truncate">{funder}</p>
          )}
        </div>
        {scholarship?.tier && (
          <div className="flex-shrink-0 mt-0.5">
            <TierBadge tier={scholarship.tier} lang={lang} size="sm" />
          </div>
        )}
      </div>

      {/* Amount + Deadline */}
      <div className="flex flex-wrap items-center gap-2">
        {scholarship && (
          <span className="text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
            {formatAmount(scholarship.amount_thb, scholarship.amount_type, lang)}
          </span>
        )}
        {deadline && deadlineColors && (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full border"
            style={{
              backgroundColor: deadlineColors.bg,
              color: deadlineColors.text,
              borderColor: deadlineColors.border,
            }}
          >
            {lang === 'th' ? deadline.label : deadline.labelEn}
          </span>
        )}
      </div>

      {/* Checklist progress (only for in_progress / saved) */}
      {section !== 'history' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
              {progress}/7 {lang === 'th' ? 'ขั้นตอน' : 'steps'}
            </span>
            <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">{Math.round(progressPct)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%`, backgroundColor: '#F0A500' }}
            />
          </div>
        </div>
      )}

      {/* History status badge */}
      {section === 'history' && historyStatus && (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium w-fit ${historyStatus.color} ${historyStatus.bg}`}>
          <span>{historyStatus.emoji}</span>
          <span>{lang === 'th' ? historyStatus.th : historyStatus.en}</span>
        </div>
      )}

      {/* Action row */}
      <div className="mt-auto pt-1 flex items-center justify-between gap-3">
        <Link
          href={detailHref}
          className="text-xs font-semibold text-[#F0A500] hover:text-[#D4920A] transition-colors"
        >
          {actionLabel}
        </Link>

        {/* Saved section: delete button */}
        {section === 'saved' && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(app.id)}
            className="text-xs text-[#ADADB8] hover:text-red-500 transition-colors"
            aria-label="Remove"
          >
            {lang === 'th' ? 'ลบออก ✕' : 'Remove ✕'}
          </button>
        )}

        {/* History section: update result dropdown (for submitted/no_reply) */}
        {section === 'history' && (app.status === 'submitted' || app.status === 'no_reply') && onStatusUpdate && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowStatusMenu((v) => !v)}
              className="text-xs text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white border border-[#E5E5EA] dark:border-[#38383A] rounded-lg px-2 py-1 transition-colors"
            >
              {lang === 'th' ? 'อัปเดตผล ▾' : 'Update result ▾'}
            </button>
            {showStatusMenu && (
              <div className="absolute bottom-8 right-0 z-20 bg-white dark:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#38383A] rounded-[10px] shadow-lg overflow-hidden w-44">
                {[
                  { status: 'won'      as Application['status'], th: '🏆 ได้รับทุน',       en: '🏆 Won' },
                  { status: 'lost'     as Application['status'], th: '✗ ไม่ผ่านการคัดเลือก', en: '✗ Not selected' },
                  { status: 'no_reply' as Application['status'], th: '⏳ รอผลต่อ',          en: '⏳ Still waiting' },
                ].map((opt) => (
                  <button
                    key={opt.status}
                    type="button"
                    onClick={() => { onStatusUpdate(app.id, opt.status); setShowStatusMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C] transition-colors"
                  >
                    {lang === 'th' ? opt.th : opt.en}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  apps: Application[];
  section: SectionType;
  lang: string;
  empty: EmptyStateProps;
  onDelete?: (appId: string) => void;
  onStatusUpdate?: (appId: string, status: Application['status']) => void;
}

function Section({ label, apps, section, lang, empty, onDelete, onStatusUpdate }: SectionProps) {
  return (
    <div className="mb-8">
      <p className="text-xs font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-wider mb-4">
        {label}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps.length === 0 ? (
          <EmptyState {...empty} lang={lang} />
        ) : (
          apps.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              section={section}
              lang={lang}
              onDelete={onDelete}
              onStatusUpdate={onStatusUpdate}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const { lang } = useLang();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);

  const fontFamily = lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif';

  const fetchApps = useCallback(
    async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from('applications')
          .select(
            `*, scholarships(id, name_th, name_en, funder_name_th, funder_name_en, amount_thb, amount_type, deadline_date, application_url, tier, is_active)`
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          // Table may not exist yet — treat as empty
          console.warn('[TunDee] Tracker fetch error (non-fatal):', error.message);
          setApps([]);
          return;
        }

        const normalized = (data ?? []) as Application[];
        console.log('[TunDee] Tracker:', normalized.length, 'applications');
        setApps(normalized);
      } catch (err) {
        console.warn('[TunDee] Tracker unexpected error:', err);
        setApps([]);
      }
    },
    [supabase]
  );

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (session?.user) {
        setLoggedIn(true);
        await fetchApps(session.user.id);
      }
      setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          setLoggedIn(true);
          await fetchApps(session.user.id);
        } else {
          setLoggedIn(false);
          setApps([]);
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchApps, supabase.auth]);

  // ── Delete handler ─────────────────────────────────────────────────────────
  async function handleDelete(appId: string) {
    setApps((prev) => prev.filter((a) => a.id !== appId)); // optimistic
    try {
      await supabase.from('applications').delete().eq('id', appId);
      console.log('[TunDee] Deleted application', appId);
    } catch {
      // Refetch on error
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) fetchApps(session.user.id);
    }
  }

  // ── Status update handler ──────────────────────────────────────────────────
  async function handleStatusUpdate(appId: string, status: Application['status']) {
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, status } : a))); // optimistic
    try {
      await supabase.from('applications').update({ status }).eq('id', appId);
      console.log('[TunDee] Updated application status', appId, '->', status);
    } catch {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) fetchApps(session.user.id);
    }
  }

  // ── Derived lists ──────────────────────────────────────────────────────────
  const inProgressApps = apps.filter((a) => a.status === 'started' || a.status === 'in_progress');
  const savedApps      = apps.filter((a) => a.status === 'viewing');
  const historyApps    = apps.filter((a) =>
    ['submitted', 'won', 'lost', 'no_reply'].includes(a.status)
  );

  // ── Counts label ──────────────────────────────────────────────────────────
  const countParts: string[] = [];
  if (inProgressApps.length > 0)
    countParts.push(
      lang === 'th'
        ? `${inProgressApps.length} กำลังสมัคร`
        : `${inProgressApps.length} in progress`
    );
  if (savedApps.length > 0)
    countParts.push(
      lang === 'th' ? `${savedApps.length} บันทึกไว้` : `${savedApps.length} saved`
    );
  const countLabel = countParts.join(' · ');

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-[#F5F5F7] dark:bg-[#000000] min-h-screen" style={{ fontFamily }}>
        {/* Header skeleton */}
        <div className="bg-white dark:bg-[#1C1C1E] border-b border-[#E5E5EA] dark:border-[#38383A]">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
            <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-72 animate-pulse" />
          </div>
        </div>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div
        className="bg-[#F5F5F7] dark:bg-[#000000] min-h-screen flex items-center justify-center px-4"
        style={{ fontFamily }}
      >
        <div className="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#38383A] rounded-[16px] p-10 max-w-sm w-full text-center shadow-sm">
          <span className="text-5xl mb-5 block">🔒</span>
          <h2 className="text-lg font-bold text-[#1D1D1F] dark:text-white mb-2">
            {lang === 'th' ? 'ต้องเข้าสู่ระบบก่อน' : 'Login required'}
          </h2>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-6">
            {lang === 'th'
              ? 'กรุณาเข้าสู่ระบบเพื่อดูการติดตามการสมัครทุนของคุณ'
              : 'Please log in to view your scholarship application tracker.'}
          </p>
          <Link
            href="/auth"
            className="inline-block px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#F0A500' }}
          >
            {lang === 'th' ? 'เข้าสู่ระบบ' : 'Log in'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#F5F5F7] dark:bg-[#000000] min-h-screen" style={{ fontFamily }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1C1C1E] border-b border-[#E5E5EA] dark:border-[#38383A]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-white">
            {lang === 'th' ? 'ติดตามการสมัคร' : 'My Applications'}
          </h1>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mt-1">
            {lang === 'th'
              ? 'ติดตามสถานะการสมัครทุนของคุณ'
              : 'Track your scholarship application status'}
          </p>
          {countLabel && (
            <p className="text-xs font-medium text-[#F0A500] mt-2">{countLabel}</p>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
        {/* In Progress */}
        <Section
          label={lang === 'th' ? 'กำลังสมัคร' : 'In Progress'}
          apps={inProgressApps}
          section="in_progress"
          lang={lang}
          empty={{
            emoji: '📝',
            th: 'ยังไม่มีทุนที่กำลังสมัคร',
            en: 'No applications in progress',
            lang,
            link: { href: '/scholarships', th: 'ค้นหาทุนการศึกษา →', en: 'Browse scholarships →' },
          }}
        />

        {/* Saved */}
        <Section
          label={lang === 'th' ? 'บันทึกไว้' : 'Saved'}
          apps={savedApps}
          section="saved"
          lang={lang}
          onDelete={handleDelete}
          empty={{
            emoji: '🔖',
            th: 'ยังไม่มีทุนที่บันทึกไว้',
            en: 'No saved scholarships',
            lang,
          }}
        />

        {/* History */}
        <Section
          label={lang === 'th' ? 'ประวัติ' : 'History'}
          apps={historyApps}
          section="history"
          lang={lang}
          onStatusUpdate={handleStatusUpdate}
          empty={{
            emoji: '📋',
            th: 'ยังไม่มีประวัติการสมัคร',
            en: 'No application history',
            lang,
          }}
        />
      </div>
    </div>
  );
}
