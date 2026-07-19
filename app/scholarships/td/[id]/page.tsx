'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import type { TdScholarship, TdAwardValueTier } from '@/lib/tdScholarships/types';
import { logFunnelEvent } from '@/lib/research/funnel';
import TrackButton from '@/components/TrackButton';

// ── Lookup tables ─────────────────────────────────────────────────────────────

const AWARD_TIER: Record<
  TdAwardValueTier,
  { th: string; en: string; pill: string; boxBg: string; boxText: string }
> = {
  full_ride: {
    th: 'ทุนเต็มจำนวน (ค่าเล่าเรียน+ค่าใช้จ่าย)',
    en: 'Full ride',
    pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-amber-300/60',
    boxBg:   'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800',
    boxText: 'text-amber-800 dark:text-amber-300',
  },
  full_tuition: {
    th: 'ทุนค่าเล่าเรียนเต็มจำนวน',
    en: 'Full tuition',
    pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 ring-1 ring-emerald-300/60',
    boxBg:   'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800',
    boxText: 'text-emerald-800 dark:text-emerald-300',
  },
  large: {
    th: 'ทุนขนาดใหญ่ (≥100k)',
    en: 'Large (≥100k)',
    pill: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-200/60',
    boxBg:   'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800',
    boxText: 'text-blue-800 dark:text-blue-300',
  },
  medium: {
    th: 'ทุนขนาดกลาง (20k–100k)',
    en: 'Medium (20k–100k)',
    pill: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    boxBg:   'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800',
    boxText: 'text-indigo-800 dark:text-indigo-300',
  },
  small: {
    th: 'ทุนขนาดเล็ก (<20k)',
    en: 'Small (<20k)',
    pill: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
    boxBg:   'bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700',
    boxText: 'text-slate-700 dark:text-slate-300',
  },
  stipend_only: {
    th: 'เฉพาะค่าครองชีพ',
    en: 'Stipend only',
    pill: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
    boxBg:   'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800',
    boxText: 'text-teal-800 dark:text-teal-300',
  },
};

const FUNDER_BADGE: Record<string, { th: string; en: string }> = {
  'Thai University':               { th: 'มหาวิทยาลัยไทย',           en: 'Thai University' },
  'Thai Government / Royal':       { th: 'รัฐบาล / ราชการ',           en: 'Government' },
  'Corporate / Bank / Foundation': { th: 'เอกชน / ธนาคาร / มูลนิธิ',  en: 'Corporate' },
  'International (open to Thais)': { th: 'นานาชาติ (เปิดรับคนไทย)',    en: 'International' },
};

const AWARD_TYPE_LABEL: Record<string, { th: string; en: string }> = {
  once:    { th: 'ครั้งเดียว',   en: 'One-time' },
  annual:  { th: 'รายปี',        en: 'Per year' },
  monthly: { th: 'รายเดือน',     en: 'Per month' },
  full:    { th: 'ตลอดหลักสูตร', en: 'Full course' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveName(s: TdScholarship, lang: string): { primary: string; alt: string | null } {
  if (lang === 'th') {
    const primary = s.scholarship_name_th ?? s.scholarship_name_en ?? s.scholarship_name ?? '';
    const alt = s.scholarship_name_en && s.scholarship_name_en !== primary ? s.scholarship_name_en : null;
    return { primary, alt };
  }
  const primary = s.scholarship_name_en ?? s.scholarship_name_th ?? s.scholarship_name ?? '';
  const alt = s.scholarship_name_th && s.scholarship_name_th !== primary ? s.scholarship_name_th : null;
  return { primary, alt };
}

function resolveFunder(s: TdScholarship, lang: string): string {
  if (lang === 'th') return s.funder_th ?? s.funder_en ?? s.funder ?? '';
  return s.funder_en ?? s.funder_th ?? s.funder ?? '';
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function fmtDate(dateStr: string, lang: string): string {
  return new Date(dateStr).toLocaleDateString(
    lang === 'th' ? 'th-TH' : 'en-US',
    { day: 'numeric', month: 'long', year: 'numeric' },
  );
}

function amountSuffix(awardType: string | null | undefined, lang: string): string {
  if (awardType === 'annual')  return lang === 'th' ? '/ปี'    : '/yr';
  if (awardType === 'monthly') return lang === 'th' ? '/เดือน' : '/mo';
  return '';
}

// ── Tiny icon set (inline SVG, 16 × 16) ──────────────────────────────────────

const IcoBack     = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>;
const IcoExternal = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>;
const IcoCalendar = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoCheck    = () => <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>;
const IcoWarn     = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>;
const IcoRenew    = () => <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>;

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-[#0A1628] rounded-2xl border border-[#E5E5EA] dark:border-[#1A2E4A] overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="px-5 py-3 border-b border-[#E5E5EA] dark:border-[#1A2E4A]">
        <h2 className="text-xs font-bold text-[#1B3A6B] dark:text-[#4A7FD4] uppercase tracking-widest">
          {title}
        </h2>
      </div>
      <div className="px-5 py-4 space-y-0">{children}</div>
    </Card>
  );
}

function EligRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-[#F0F2F5] dark:border-[#1A2440] last:border-0">
      <span className="mt-0.5 text-[#1B3A6B] dark:text-[#4A7FD4] shrink-0 w-4">{icon}</span>
      <span className="w-32 shrink-0 text-xs text-[#6E6E73] dark:text-[#8E8E93] leading-5 pt-0.5">{label}</span>
      <span className="flex-1 text-sm text-[#1D1D1F] dark:text-[#E8EDF5] font-medium">{value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TdScholarshipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const supabase = createClient();
  const [scholarship, setScholarship] = useState<TdScholarship | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('td_scholarships')
        .select(`
          scholarship_id,
          scholarship_name_en, scholarship_name_th, scholarship_name,
          funder_en, funder_th, funder, funder_type,
          level, field_of_study,
          award_value_tier, award_amount_thb_numeric, award_type,
          renewable, bond_obligation,
          region_eligibility, targets_low_income, welfare_card_priority,
          income_cap_thb, num_recipients, min_gpa, english_requirement,
          deadline_raw, deadline_date, deadline_is_rolling, deadline_note,
          status, application_url, application_link,
          source_url, last_verified, stale
        `)
        .eq('scholarship_id', id)
        .eq('is_displayed', true)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        setScholarship(data as unknown as TdScholarship);
        const { data: { user } } = await supabase.auth.getUser();
        logFunnelEvent({ eventType: 'view_detail', scholarshipId: id, userId: user?.id ?? null });
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#07111F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !scholarship) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#07111F] pt-24 px-6 text-center">
        <p className="text-lg text-[#1D1D1F] dark:text-white mb-4">
          {lang === 'th' ? 'ไม่พบทุนนี้' : 'Scholarship not found'}
        </p>
        <Link href="/scholarships" className="text-sm text-[#2E5FA3] hover:underline">
          {lang === 'th' ? '← กลับหน้าทุน' : '← Back to scholarships'}
        </Link>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const s = scholarship;
  const { primary: displayName, alt: altName } = resolveName(s, lang);
  const displayFunder = resolveFunder(s, lang);
  const tierInfo      = s.award_value_tier ? AWARD_TIER[s.award_value_tier] : null;
  const funderBadge   = s.funder_type ? FUNDER_BADGE[s.funder_type] : null;
  const applyUrl      = s.application_url ?? s.application_link ?? null;
  const isClosed      = s.status === 'Closed' || s.status === 'Recheck';

  // Deadline
  type Urgency = 'ok' | 'warn' | 'red' | 'past' | 'rolling' | 'approx';
  let deadlineText: React.ReactNode = null;
  let daysLeft: number | null = null;
  let urgency: Urgency = 'ok';

  if (s.deadline_date) {
    daysLeft = daysUntil(s.deadline_date);
    const fmt = fmtDate(s.deadline_date, lang);
    if (daysLeft < 0)       { urgency = 'past';   deadlineText = lang === 'th' ? `ปิดรับแล้ว (${fmt})` : `Closed (${fmt})`; }
    else if (daysLeft === 0) { urgency = 'red';    deadlineText = lang === 'th' ? 'หมดเขตวันนี้' : 'Closes today'; }
    else if (daysLeft <= 7)  { urgency = 'red';    deadlineText = fmt; }
    else if (daysLeft <= 30) { urgency = 'warn';   deadlineText = fmt; }
    else                     { urgency = 'ok';     deadlineText = fmt; }
  } else if (s.deadline_is_rolling) {
    urgency = 'rolling';
    deadlineText = lang === 'th' ? 'เปิดรับตลอดปี (Rolling)' : 'Rolling / open year-round';
  } else if (s.deadline_note || s.deadline_raw) {
    urgency = 'approx';
    deadlineText = s.deadline_note ?? s.deadline_raw;
  }

  const urgencyTextClass: Record<Urgency, string> = {
    ok:      'text-[#1D1D1F] dark:text-[#E8EDF5]',
    warn:    'text-amber-700 dark:text-amber-400',
    red:     'text-red-600 dark:text-red-400',
    past:    'text-[#8A96A8] dark:text-[#6E7A8A]',
    rolling: 'text-green-700 dark:text-green-400',
    approx:  'text-[#1D1D1F] dark:text-[#E8EDF5]',
  };

  const countdownClass: Record<Urgency, string> = {
    ok:      'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    warn:    'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400',
    red:     'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    past:    'bg-slate-100 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400',
    rolling: 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    approx:  '',
  };

  // Key-facts tiles (only tiles with data)
  const keyFacts: { emoji: string; label: string; value: string }[] = [];
  if (s.level)
    keyFacts.push({ emoji: '🎓', label: lang === 'th' ? 'ระดับ' : 'Level', value: s.level });
  if (s.field_of_study)
    keyFacts.push({ emoji: '📚', label: lang === 'th' ? 'สาขา' : 'Field', value: s.field_of_study.length > 22 ? s.field_of_study.slice(0, 21) + '…' : s.field_of_study });
  if (s.region_eligibility)
    keyFacts.push({ emoji: '📍', label: lang === 'th' ? 'ภูมิภาค' : 'Region', value: s.region_eligibility });
  if (s.num_recipients != null)
    keyFacts.push({ emoji: '👥', label: lang === 'th' ? 'จำนวนทุน' : 'Slots', value: `${s.num_recipients.toLocaleString()} ${lang === 'th' ? 'ทุน' : ''}`.trim() });
  if (s.award_amount_thb_numeric != null) {
    keyFacts.push({ emoji: '💰', label: lang === 'th' ? 'มูลค่า' : 'Award', value: `฿${s.award_amount_thb_numeric.toLocaleString()}${amountSuffix(s.award_type, lang)}` });
  } else if (tierInfo) {
    keyFacts.push({ emoji: '💰', label: lang === 'th' ? 'มูลค่า' : 'Award', value: lang === 'th' ? tierInfo.th : tierInfo.en });
  }

  // Section visibility guards
  const showElig =
    s.min_gpa != null ||
    s.income_cap_thb != null ||
    s.targets_low_income ||
    s.welfare_card_priority ||
    !!s.region_eligibility ||
    (!!s.english_requirement && s.english_requirement.toLowerCase() !== 'none');

  const showAward =
    tierInfo != null ||
    s.award_amount_thb_numeric != null ||
    (!!s.award_type && !!AWARD_TYPE_LABEL[s.award_type]) ||
    s.renewable != null ||
    s.bond_obligation != null;

  // Apply click handler
  function handleApplyClick() {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      logFunnelEvent({ eventType: 'click_apply', scholarshipId: s.scholarship_id, userId: user?.id ?? null });
    })();
  }

  const ApplyButton = ({ full = false }: { full?: boolean }) =>
    !isClosed && applyUrl ? (
      <a
        href={applyUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleApplyClick}
        aria-label={lang === 'th' ? 'สมัครทุน (เปิดในแท็บใหม่)' : 'Apply for this scholarship (opens in new tab)'}
        className={`inline-flex items-center justify-center gap-2 bg-[#1B3A6B] hover:bg-[#2E5FA3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A6B] text-white font-semibold py-3.5 rounded-[10px] text-sm transition-colors ${full ? 'w-full' : 'flex-1'}`}
        style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Lato, system-ui, sans-serif' }}
      >
        {lang === 'th' ? 'สมัครทุน' : 'Apply'}
        <IcoExternal />
      </a>
    ) : (
      <div className={`inline-flex items-center justify-center py-3.5 rounded-[10px] text-sm text-[#8A96A8] bg-[#F5F7FA] dark:bg-[#1A2E4A] ${full ? 'w-full' : 'flex-1'}`}>
        {lang === 'th' ? 'ปิดรับสมัครแล้ว' : 'Applications closed'}
      </div>
    );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    // pb-36 on mobile: 60px BottomNav + ~68px sticky CTA bar
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#07111F] pt-4 pb-36 md:pb-16">
      <div className="max-w-2xl mx-auto px-4 md:px-6 space-y-4">

        {/* Back link */}
        <Link
          href="/scholarships"
          className="inline-flex items-center gap-1.5 text-sm text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1B3A6B] dark:hover:text-[#4A7FD4] transition-colors"
        >
          <IcoBack />
          {lang === 'th' ? 'กลับ' : 'Back'}
        </Link>

        {/* ── 1. HEADER ──────────────────────────────────────────────────── */}
        <Card className="p-5 md:p-6">

          {/* Status + tier row */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                isClosed
                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400'
                  : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isClosed ? 'bg-slate-400' : 'bg-green-500'}`} />
              {isClosed
                ? (lang === 'th' ? 'ปิดรับสมัครแล้ว' : 'Closed')
                : (lang === 'th' ? 'เปิดรับ' : 'Open')}
            </span>

            {tierInfo && (
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${tierInfo.pill}`}>
                {lang === 'th' ? tierInfo.th : tierInfo.en}
              </span>
            )}
          </div>

          {/* Scholarship name */}
          <h1
            className="text-xl md:text-2xl font-bold text-[#0A2342] dark:text-white leading-snug mb-1"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Lato, system-ui, sans-serif' }}
          >
            {displayName || (lang === 'th' ? '(ไม่มีชื่อ)' : '(No name)')}
          </h1>

          {/* Alt name (other-language name if different) */}
          {altName && (
            <p className="text-sm text-[#8A96A8] dark:text-[#6E7A8A] mb-2">{altName}</p>
          )}

          {/* Funder */}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]">{displayFunder}</p>
            {funderBadge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF2FF] text-[#1B3A6B] dark:bg-[#1A2E4A] dark:text-[#4A7FD4]">
                {lang === 'th' ? funderBadge.th : funderBadge.en}
              </span>
            )}
          </div>

          {/* Stale warning */}
          {s.stale && (
            <div className="mt-4 flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              <IcoWarn />
              {lang === 'th'
                ? 'ข้อมูลนี้อาจไม่เป็นปัจจุบัน — กรุณาตรวจสอบจากเว็บไซต์ทางการอีกครั้ง'
                : 'This listing may be outdated — verify details on the official website.'}
            </div>
          )}
        </Card>

        {/* ── 2. KEY-FACTS STRIP ────────────────────────────────────────── */}
        {keyFacts.length > 0 && (
          <div
            className="flex gap-2.5 overflow-x-auto pb-1"
            style={{ scrollbarWidth: 'none' }}
            aria-label={lang === 'th' ? 'ข้อมูลสำคัญ' : 'Key facts'}
          >
            {keyFacts.map((f) => (
              <div
                key={f.label}
                className="flex-shrink-0 flex flex-col items-center gap-1 bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-xl px-3.5 py-3 min-w-[88px] text-center"
              >
                <span className="text-lg leading-none" role="img" aria-hidden="true">{f.emoji}</span>
                <span className="text-[10px] text-[#8A96A8] dark:text-[#6E7A8A] font-semibold uppercase tracking-wide leading-none mt-0.5">
                  {f.label}
                </span>
                <span className="text-xs font-semibold text-[#0A2342] dark:text-[#E8EDF5] leading-tight mt-0.5 text-center">
                  {f.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── 3. WHO CAN APPLY ──────────────────────────────────────────── */}
        {showElig && (
          <CardSection title={lang === 'th' ? 'ใครสมัครได้บ้าง' : 'Who can apply'}>

            {s.min_gpa != null && (
              <EligRow
                icon={<IcoCheck />}
                label={lang === 'th' ? 'เกรดขั้นต่ำ' : 'Min GPA'}
                value={`≥ ${s.min_gpa}`}
              />
            )}

            {s.income_cap_thb != null && (
              <EligRow
                icon={<IcoCheck />}
                label={lang === 'th' ? 'รายได้ครัวเรือน' : 'Income cap'}
                value={`≤ ฿${s.income_cap_thb.toLocaleString()}${lang === 'th' ? '/ปี' : '/yr'}`}
              />
            )}

            {(s.targets_low_income || s.welfare_card_priority) && (
              <EligRow
                icon={<IcoCheck />}
                label={lang === 'th' ? 'กลุ่มเป้าหมาย' : 'Priority for'}
                value={
                  <span className="flex flex-wrap gap-1.5">
                    {s.targets_low_income && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 font-medium">
                        {lang === 'th' ? 'ผู้มีรายได้น้อย' : 'Low-income students'}
                      </span>
                    )}
                    {s.welfare_card_priority && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 font-medium">
                        {lang === 'th' ? 'บัตรสวัสดิการแห่งรัฐ' : 'Welfare card holders'}
                      </span>
                    )}
                  </span>
                }
              />
            )}

            {s.region_eligibility && (
              <EligRow
                icon={<IcoCheck />}
                label={lang === 'th' ? 'ภูมิภาค' : 'Region'}
                value={s.region_eligibility}
              />
            )}

            {s.english_requirement && s.english_requirement.toLowerCase() !== 'none' && (
              <EligRow
                icon={<IcoCheck />}
                label={lang === 'th' ? 'ภาษาอังกฤษ' : 'English req.'}
                value={s.english_requirement}
              />
            )}

          </CardSection>
        )}

        {/* ── 4. WHAT YOU GET ───────────────────────────────────────────── */}
        {showAward && (
          <CardSection title={lang === 'th' ? 'สิ่งที่จะได้รับ' : 'What you get'}>

            {/* Amount / tier highlight box */}
            {tierInfo && (
              <div className={`${tierInfo.boxBg} rounded-xl px-4 py-3 mb-3`}>
                {s.award_amount_thb_numeric != null ? (
                  <>
                    <p
                      className={`text-2xl font-bold ${tierInfo.boxText}`}
                      style={{ fontFamily: 'Lato, system-ui, sans-serif' }}
                    >
                      ฿{s.award_amount_thb_numeric.toLocaleString()}
                      <span className="text-base font-medium ml-1">
                        {amountSuffix(s.award_type, lang)}
                      </span>
                    </p>
                    <p className={`text-xs mt-0.5 ${tierInfo.boxText} opacity-80`}>
                      {lang === 'th' ? tierInfo.th : tierInfo.en}
                    </p>
                  </>
                ) : (
                  <p className={`text-base font-semibold ${tierInfo.boxText}`}>
                    {lang === 'th' ? tierInfo.th : tierInfo.en}
                  </p>
                )}
              </div>
            )}

            {s.award_type && AWARD_TYPE_LABEL[s.award_type] && (
              <EligRow
                icon={<IcoCalendar />}
                label={lang === 'th' ? 'รูปแบบการจ่าย' : 'Payment'}
                value={lang === 'th' ? AWARD_TYPE_LABEL[s.award_type].th : AWARD_TYPE_LABEL[s.award_type].en}
              />
            )}

            {s.renewable != null && (
              <EligRow
                icon={<IcoRenew />}
                label={lang === 'th' ? 'ต่ออายุได้' : 'Renewable'}
                value={
                  s.renewable
                    ? <span className="text-green-700 dark:text-green-400 font-semibold">{lang === 'th' ? 'ใช่ — ต่ออายุได้ทุกปี' : 'Yes — renewable annually'}</span>
                    : <span className="text-[#6E6E73] dark:text-[#8E8E93]">{lang === 'th' ? 'ไม่สามารถต่ออายุ' : 'Non-renewable'}</span>
                }
              />
            )}

            {/* Bond obligation notice */}
            {s.bond_obligation === true && (
              <div className="mt-2 flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                <span className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"><IcoWarn /></span>
                <div>
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                    {lang === 'th' ? 'มีข้อผูกพันการทำงาน/ใช้ทุน' : 'Has a work / service obligation'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                    {lang === 'th'
                      ? 'ผู้รับทุนต้องทำงานหรือชดใช้ทุนตามเงื่อนไขที่กำหนด — อ่านรายละเอียดให้ครบก่อนตัดสินใจสมัคร'
                      : 'Recipients must fulfil a work or repayment bond — read all terms carefully before applying.'}
                  </p>
                </div>
              </div>
            )}

            {s.bond_obligation === false && (
              <div className="flex items-center gap-2 pt-2 pb-1 text-sm text-[#6E6E73] dark:text-[#8E8E93]">
                <span className="text-green-600 dark:text-green-400"><IcoCheck /></span>
                {lang === 'th' ? 'ไม่มีข้อผูกพัน' : 'No bond obligation'}
              </div>
            )}

          </CardSection>
        )}

        {/* ── 5. DEADLINE & HOW TO APPLY ────────────────────────────────── */}
        <CardSection title={lang === 'th' ? 'กำหนดการ & วิธีสมัคร' : 'Deadline & how to apply'}>

          {/* Deadline */}
          {deadlineText && (
            <div className="flex items-start gap-3 py-3 border-b border-[#F0F2F5] dark:border-[#1A2440]">
              <span className="mt-0.5 text-[#1B3A6B] dark:text-[#4A7FD4] shrink-0 w-4"><IcoCalendar /></span>
              <span className="w-32 shrink-0 text-xs text-[#6E6E73] dark:text-[#8E8E93] leading-5 pt-0.5">
                {lang === 'th' ? 'วันหมดเขต' : 'Deadline'}
              </span>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${urgencyTextClass[urgency]}`}>{deadlineText}</p>
                {/* Countdown badge */}
                {daysLeft != null && daysLeft > 0 && countdownClass[urgency] && (
                  <span className={`inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${countdownClass[urgency]}`}>
                    {lang === 'th' ? `ปิดรับใน ${daysLeft} วัน` : `Closes in ${daysLeft} days`}
                  </span>
                )}
                {/* Rolling / approx hint */}
                {(urgency === 'rolling' || urgency === 'approx') && (
                  <p className="text-xs text-[#8A96A8] dark:text-[#6E7A8A] mt-1">
                    {lang === 'th'
                      ? 'วันที่โดยประมาณ — ไม่มีการแจ้งเตือนอัตโนมัติ'
                      : 'Approximate — no automated reminder'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Apply + Track (desktop) */}
          <div className="hidden md:flex gap-3 pt-4">
            <ApplyButton full={false} />
            <TrackButton scholarshipId={s.scholarship_id} size="md" />
          </div>

        </CardSection>

        {/* ── 6. FOOTER ─────────────────────────────────────────────────── */}
        <div className="px-1 space-y-2 pb-2">
          {(s.last_verified || s.source_url) && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {s.last_verified && (
                <p className="text-xs text-[#8A96A8] dark:text-[#6E7A8A]">
                  {lang === 'th' ? 'อัปเดตล่าสุด ' : 'Last verified '}
                  {fmtDate(s.last_verified, lang)}
                </p>
              )}
              {s.source_url && (
                <a
                  href={s.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#1B3A6B] dark:text-[#4A7FD4] hover:underline"
                >
                  {lang === 'th' ? 'ดูประกาศทางการ' : 'View official announcement'}
                  <IcoExternal />
                </a>
              )}
            </div>
          )}
          <p className="text-xs text-center text-[#ADADB8] dark:text-[#4A5568]">
            {lang === 'th'
              ? 'TunDee ไม่ใช่ตัวแทนของผู้ให้ทุน — กรุณาอ่านเงื่อนไขจากเว็บไซต์ทางการ'
              : 'TunDee is not affiliated with the funder — read official terms on the funder\'s website.'}
          </p>
        </div>

      </div>

      {/* ── STICKY MOBILE CTA ─────────────────────────────────────────────── */}
      <div
        className="md:hidden fixed bottom-[60px] left-0 right-0 z-50 bg-white/95 dark:bg-[#0A1628]/95 backdrop-blur-sm border-t border-[#E5E5EA] dark:border-[#1A2E4A] px-4 py-3 flex gap-3 items-center"
        aria-label={lang === 'th' ? 'ปุ่มสมัครทุน' : 'Apply CTA'}
      >
        <ApplyButton full={false} />
        <TrackButton scholarshipId={s.scholarship_id} size="sm" />
      </div>

    </div>
  );
}
