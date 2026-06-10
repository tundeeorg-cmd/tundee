'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import { getDeadlineInfo, DEADLINE_COLOR_MAP } from '@/lib/deadline';
import type { Scholarship } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Application {
  id: string;
  user_id: string;
  scholarship_id: string;
  status: 'viewing' | 'started' | 'in_progress' | 'submitted' | 'won' | 'lost' | 'no_reply';
  checklist_progress: number[];
  checklist_dates: Record<string, string> | null;
  clicked_through_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at?: string;
  scholarships?: Scholarship | null;
}

type SectionType = 'in_progress' | 'saved' | 'history';

// ─── Static step names ────────────────────────────────────────────────────────

const STEP_NAMES_TH = [
  'ยืนยันคุณสมบัติ',
  'รวบรวมเอกสาร',
  'เขียนเรียงความแนะนำตัว',
  'ขอจดหมายแนะนำ',
  'สมัครบนเว็บไซต์ทุน',
  'ยืนยันการส่งใบสมัคร',
  'รายงานผล',
];
const STEP_NAMES_EN = [
  'Confirm Eligibility',
  'Gather Documents',
  'Write Personal Statement',
  'Get Recommendation Letter',
  'Submit Application Online',
  'Confirm Submission',
  'Report Outcome',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAmount(amount: number | null, type: string | null, lang: string): string {
  if (amount === null) return lang === 'th' ? 'ติดต่อโดยตรง' : 'Contact directly';
  const formatted = amount.toLocaleString('th-TH');
  if (type === 'monthly') return `฿${formatted}/${lang === 'th' ? 'เดือน' : 'mo'}`;
  if (type === 'annual') return `฿${formatted}/${lang === 'th' ? 'ปี' : 'yr'}`;
  return `฿${formatted}`;
}

function formatDate(isoString: string, lang: string): string {
  const d = new Date(isoString);
  if (lang === 'th') {
    const thMonths = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    return `${d.getDate()} ${thMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const STATUS_CONFIG = {
  won:       { emoji: '',   th: 'ได้รับทุน',  en: 'Won',         color: 'text-green-600  dark:text-green-400',  bg: 'bg-green-50  dark:bg-green-900/20' },
  submitted: { emoji: '✓',  th: 'ส่งแล้ว',    en: 'Submitted',   color: 'text-blue-600   dark:text-blue-400',   bg: 'bg-blue-50   dark:bg-blue-900/20'  },
  lost:      { emoji: '✗',  th: 'ไม่ผ่าน',   en: 'Not selected', color: 'text-[#6E6E73]  dark:text-[#8E8E93]', bg: 'bg-gray-100  dark:bg-gray-800/40'  },
  no_reply:  { emoji: '',   th: 'รอผล',       en: 'Awaiting',    color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
} as const;

// ─── Summary stats ────────────────────────────────────────────────────────────

interface SummaryStatsProps {
  saved: number;
  inProgress: number;
  submitted: number;
  total: number;
  lang: string;
}

function SummaryStats({ saved, inProgress, submitted, total, lang }: SummaryStatsProps) {
  const stats = [
    { n: saved,      th: 'บันทึก',     en: 'Saved',       icon: '🔖', color: 'text-[#1B3A6B]' },
    { n: inProgress, th: 'กำลังสมัคร', en: 'In Progress',  icon: '📝', color: 'text-blue-600 dark:text-blue-400' },
    { n: submitted,  th: 'ส่งแล้ว',    en: 'Submitted',    icon: '✅', color: 'text-green-600 dark:text-green-400' },
    { n: total,      th: 'ทั้งหมด',    en: 'Total',        icon: '📋', color: 'text-[#1D1D1F] dark:text-[#F5F5F7]' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-8">
      {stats.map((s) => (
        <div
          key={s.en}
          className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-4 text-center"
        >
          <div className={`text-2xl font-bold ${s.color}`} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            {s.n}
          </div>
          <div className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-0.5">
            {lang === 'th' ? s.th : s.en}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-5 animate-pulse">
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
      <p className="text-[#6E6E73] dark:text-[#8E8E93] text-sm">
        {lang === 'th' ? th : en}
      </p>
      {link && (
        <Link
          href={link.href}
          className="mt-3 text-sm font-medium text-[#1B3A6B] hover:text-[#2E5FA3] transition-colors"
        >
          {lang === 'th' ? link.th : link.en}
        </Link>
      )}
    </div>
  );
}

// ─── Step list inside card ────────────────────────────────────────────────────

interface StepListProps {
  progress: number[];
  dates: Record<string, string> | null;
  lang: string;
}

function StepList({ progress, dates, lang }: StepListProps) {
  const stepNames = lang === 'th' ? STEP_NAMES_TH : STEP_NAMES_EN;
  const sortedDone = [...progress].sort((a, b) => a - b);

  // Find next uncompleted step (1–7)
  const nextStep = [1, 2, 3, 4, 5, 6, 7].find((n) => !progress.includes(n));

  // Show up to 4 completed steps (most recent first) + next step
  const LIMIT = 4;
  const toShow = sortedDone.slice(-LIMIT);
  const hiddenCount = sortedDone.length > LIMIT ? sortedDone.length - LIMIT : 0;

  if (sortedDone.length === 0 && !nextStep) return null;

  return (
    <div className="space-y-1 mt-2">
      {hiddenCount > 0 && (
        <p className="text-xs text-[#ADADB8]">
          +{hiddenCount} {lang === 'th' ? 'ขั้นตอนก่อนหน้า' : 'earlier steps'}
        </p>
      )}
      {toShow.map((stepNum) => {
        const dateStr = dates?.[stepNum.toString()];
        return (
          <div key={stepNum} className="flex items-center gap-2 text-xs">
            <span className="w-4 h-4 rounded-full bg-[#1B3A6B] flex items-center justify-center shrink-0">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1 4l2.5 2.5 3.5-3.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-[#1D1D1F] dark:text-[#F5F5F7] truncate flex-1"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
              {stepNames[stepNum - 1]}
            </span>
            {dateStr && (
              <span className="text-[#ADADB8] shrink-0">{formatDate(dateStr, lang)}</span>
            )}
          </div>
        );
      })}
      {nextStep && progress.length < 7 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="w-4 h-4 rounded-full border-2 border-[#E5E5EA] dark:border-[#1A2E4A] shrink-0" />
          <span className="text-[#ADADB8] italic truncate flex-1"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
            {lang === 'th' ? `→ ${STEP_NAMES_TH[nextStep - 1]}` : `→ ${STEP_NAMES_EN[nextStep - 1]}`}
          </span>
        </div>
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

  const progressArr = Array.isArray(app.checklist_progress) ? app.checklist_progress : [];
  const progressCount = progressArr.length;
  const progressPct = Math.min(100, (progressCount / 7) * 100);
  const allDone = progressCount === 7;

  const actionLabel =
    section === 'in_progress'
      ? lang === 'th' ? 'ดำเนินการต่อ →' : 'Continue →'
      : section === 'saved'
      ? lang === 'th' ? 'เริ่มสมัคร →' : 'Start Applying →'
      : lang === 'th' ? 'ดูรายละเอียด →' : 'View Details →';

  const historyStatus = STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG] ?? null;
  const detailHref = scholarship ? `/scholarships/${scholarship.id}` : `/scholarships/${app.scholarship_id}`;

  return (
    <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-semibold text-[#1D1D1F] dark:text-white leading-snug line-clamp-2"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
          >
            {name}
          </h3>
          {funder && (
            <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-0.5 truncate">{funder}</p>
          )}
        </div>
        {scholarship?.amount_thb && (
          <span className="text-xs font-bold text-[#1B3A6B] shrink-0" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            {formatAmount(scholarship.amount_thb, scholarship.amount_type, lang)}
          </span>
        )}
      </div>

      {/* Deadline */}
      {deadline && deadlineColors && (
        <span
          className="inline-flex items-center text-xs font-medium w-fit"
          style={{ color: deadlineColors.text }}
        >
          {lang === 'th' ? deadline.label : deadline.labelEn}
        </span>
      )}

      {/* Progress bar + step list (in_progress and saved) */}
      {section !== 'history' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
              {progressCount}/7 {lang === 'th' ? 'ขั้นตอน' : 'steps'}
            </span>
            <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">{Math.round(progressPct)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPct}%`,
                backgroundColor: allDone ? '#2E5FA3' : '#1B3A6B',
              }}
            />
          </div>
          {/* Step list with dates */}
          {progressCount > 0 && (
            <StepList progress={progressArr} dates={app.checklist_dates} lang={lang} />
          )}
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
          className="text-xs font-semibold text-[#1B3A6B] hover:text-[#2E5FA3] transition-colors"
        >
          {actionLabel}
        </Link>

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

        {section === 'history' && (app.status === 'submitted' || app.status === 'no_reply') && onStatusUpdate && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowStatusMenu((v) => !v)}
              className="text-xs text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-lg px-2 py-1 transition-colors"
            >
              {lang === 'th' ? 'อัปเดตผล ▾' : 'Update result ▾'}
            </button>
            {showStatusMenu && (
              <div className="absolute bottom-8 right-0 z-20 bg-white dark:bg-[#232B3E] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[10px] shadow-lg overflow-hidden w-44">
                {[
                  { status: 'won'      as Application['status'], th: 'ได้รับทุน',          en: 'Won' },
                  { status: 'lost'     as Application['status'], th: '✗ ไม่ผ่านการคัดเลือก',  en: '✗ Not selected' },
                  { status: 'no_reply' as Application['status'], th: 'รอผลต่อ',            en: 'Still waiting' },
                ].map((opt) => (
                  <button
                    key={opt.status}
                    type="button"
                    onClick={() => { onStatusUpdate(app.id, opt.status); setShowStatusMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F7FA] dark:hover:bg-[#3A3A3C] transition-colors"
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

  const [loading, setLoading]   = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [apps, setApps]         = useState<Application[]>([]);

  const fontFamily = lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';

  const fetchApps = useCallback(
    async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from('applications')
          .select(
            `id, user_id, scholarship_id, status,
             checklist_progress, checklist_dates,
             clicked_through_at, submitted_at, created_at,
             scholarships(
               id, name_th, name_en,
               funder_name_th, funder_name_en,
               amount_thb, amount_type,
               deadline_date, application_url
             )`
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('[TunDee] Tracker fetch error (non-fatal):', error.message);
          setApps([]);
          return;
        }

        setApps((data ?? []) as unknown as Application[]);
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
    setApps((prev) => prev.filter((a) => a.id !== appId));
    try {
      await supabase.from('applications').delete().eq('id', appId);
    } catch {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) fetchApps(session.user.id);
    }
  }

  // ── Status update handler ──────────────────────────────────────────────────
  async function handleStatusUpdate(appId: string, status: Application['status']) {
    const app = apps.find((a) => a.id === appId);
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, status } : a)));
    try {
      await supabase.from('applications').update({ status }).eq('id', appId);

      // Update research outcome fields on matching recommendations row
      if (app?.scholarship_id && app?.user_id) {
        await supabase
          .from('recommendations')
          .update({
            led_to_application: status !== 'viewing',
            led_to_win:         status === 'won',
            led_to_clickthrough: !!app.clicked_through_at,
          })
          .eq('user_id', app.user_id)
          .eq('scholarship_id', app.scholarship_id);
      }
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

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-[#F5F7FA] dark:bg-[#07111F] min-h-screen" style={{ fontFamily }}>
        <div className="bg-white dark:bg-[#0A1628] border-b border-[#E5E5EA] dark:border-[#1A2E4A]">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
            <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-72 animate-pulse" />
          </div>
        </div>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="bg-[#F5F7FA] dark:bg-[#07111F] min-h-screen flex items-center justify-center px-4" style={{ fontFamily }}>
        <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[16px] p-10 max-w-sm w-full text-center shadow-sm">
          <svg className="w-12 h-12 text-[#8A96A8] mx-auto mb-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
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
            style={{ backgroundColor: '#2E6BE6' }}
          >
            {lang === 'th' ? 'เข้าสู่ระบบ' : 'Log in'}
          </Link>
        </div>
      </div>
    );
  }

  const submittedApps = historyApps.filter((a) => a.status === 'submitted');

  return (
    <div className="bg-[#F5F7FA] dark:bg-[#07111F] min-h-screen" style={{ fontFamily }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#0A1628] border-b border-[#E5E5EA] dark:border-[#1A2E4A]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-white">
            {lang === 'th' ? 'ติดตามการสมัคร' : 'My Applications'}
          </h1>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mt-1">
            {lang === 'th'
              ? 'ติดตามสถานะการสมัครทุนของคุณ'
              : 'Track your scholarship application status'}
          </p>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">

        {/* Summary stats */}
        <SummaryStats
          saved={savedApps.length}
          inProgress={inProgressApps.length}
          submitted={submittedApps.length}
          total={apps.length}
          lang={lang}
        />

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
