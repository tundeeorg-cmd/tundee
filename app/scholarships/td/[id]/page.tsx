'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import type { TdScholarship, TdAwardValueTier } from '@/lib/tdScholarships/types';
import { logFunnelEvent } from '@/lib/research/funnel';
import TrackButton from '@/components/TrackButton';

// ── Award tier labels ─────────────────────────────────────────────────────────

const AWARD_TIER: Record<TdAwardValueTier, { th: string; en: string; color: string }> = {
  full_ride:    { th: 'ทุนเต็มจำนวน (ค่าเรียน+ค่าครองชีพ)', en: 'Full-ride',         color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  full_tuition: { th: 'ค่าเล่าเรียนเต็มจำนวน',              en: 'Full-tuition',      color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300' },
  large:        { th: 'ทุนขนาดใหญ่ (≥100k บาท)',            en: 'Large (≥100k ฿)',   color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  medium:       { th: 'ทุนขนาดกลาง (20k–100k)',             en: 'Medium (20k–100k ฿)', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
  small:        { th: 'ทุนขนาดเล็ก (<20k บาท)',             en: 'Small (<20k ฿)',    color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300' },
  stipend_only: { th: 'ค่าครองชีพ/เบี้ยเลี้ยงเท่านั้น',     en: 'Stipend only',     color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
};

const FUNDER_BADGE: Record<string, { th: string; en: string }> = {
  'Thai University':               { th: 'มหาวิทยาลัยไทย',       en: 'Thai University' },
  'Thai Government / Royal':       { th: 'รัฐบาล / ราชการ',       en: 'Government' },
  'Corporate / Bank / Foundation': { th: 'เอกชน / ธนาคาร / มูลนิธิ', en: 'Corporate' },
  'International (open to Thais)': { th: 'นานาชาติ (เปิดรับคนไทย)', en: 'International' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveName(s: TdScholarship, lang: string): string {
  if (lang === 'th') return s.scholarship_name_th ?? s.scholarship_name_en ?? s.scholarship_name ?? '';
  return s.scholarship_name_en ?? s.scholarship_name_th ?? s.scholarship_name ?? '';
}

function resolveFunder(s: TdScholarship, lang: string): string {
  if (lang === 'th') return s.funder_th ?? s.funder_en ?? s.funder ?? '';
  return s.funder_en ?? s.funder_th ?? s.funder ?? '';
}

function formatDeadline(s: TdScholarship, lang: string): { text: string; urgent: boolean } {
  if (s.deadline_date) {
    const d = new Date(s.deadline_date);
    const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
    const fmt = d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    if (days === 0) return { text: lang === 'th' ? 'หมดเขตวันนี้' : 'Closes today', urgent: true };
    if (days < 0)  return { text: lang === 'th' ? `หมดเขตแล้ว (${fmt})` : `Closed (${fmt})`, urgent: false };
    return { text: fmt, urgent: days <= 30 };
  }
  if (s.deadline_is_rolling) return { text: lang === 'th' ? 'เปิดรับตลอด / Rolling' : 'Rolling / open year-round', urgent: false };
  return { text: s.deadline_note ?? s.deadline_raw ?? (lang === 'th' ? 'ดูเว็บไซต์' : 'See website'), urgent: false };
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-3 py-3 border-b border-[#F5F5F7] dark:border-[#3A3A3C] last:border-0">
      <span className="w-44 shrink-0 text-sm text-[#6E6E73] dark:text-[#8E8E93]">{label}</span>
      <span className="flex-1 text-sm text-[#1D1D1F] dark:text-white">{value}</span>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#F5F7FA] dark:bg-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] border border-[#E5E5EA] dark:border-[#3A3A3C]">
      {label}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TdScholarshipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const supabase = createClient();
  const [scholarship, setScholarship] = useState<TdScholarship | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('td_scholarships')
        .select(`scholarship_id,
          scholarship_name_en, scholarship_name_th, scholarship_name,
          funder_en, funder_th, funder, funder_type,
          level, field_of_study,
          award_value_tier, award_amount_thb_numeric, award_type,
          renewable, bond_obligation,
          region_eligibility, targets_low_income, welfare_card_priority,
          income_cap_thb, num_recipients, min_gpa, english_requirement,
          deadline_raw, deadline_date, deadline_is_rolling, deadline_note,
          status, application_url, application_link, stale`)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#000000] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2E6BE6] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !scholarship) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#000000] pt-24 px-6 text-center">
        <p className="text-lg text-[#1D1D1F] dark:text-white mb-4">
          {lang === 'th' ? 'ไม่พบทุนนี้' : 'Scholarship not found'}
        </p>
        <Link href="/scholarships" className="text-sm text-[#2E6BE6] hover:underline">
          {lang === 'th' ? '← กลับ' : '← Back to scholarships'}
        </Link>
      </div>
    );
  }

  const s = scholarship;
  const displayName   = resolveName(s, lang);
  const displayFunder = resolveFunder(s, lang);
  const deadline      = formatDeadline(s, lang);
  const tierInfo      = s.award_value_tier ? AWARD_TIER[s.award_value_tier] : null;
  const funderBadge   = s.funder_type ? FUNDER_BADGE[s.funder_type] : null;
  const applyUrl      = s.application_url ?? s.application_link ?? '#';

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#000000] pt-20 pb-16">
      <div className="max-w-2xl mx-auto px-6">

        <div className="mb-6">
          <Link href="/scholarships" className="text-sm text-[#6E6E73] hover:text-[#2E6BE6] transition-colors">
            ← {lang === 'th' ? 'กลับ' : 'Back'}
          </Link>
        </div>

        <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#E5E5EA] dark:border-[#1A2E4A] p-6 md:p-8 space-y-6">

          {/* Header */}
          <div>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-white leading-snug"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
                {displayName || (lang === 'th' ? '(ไม่มีชื่อ)' : '(No name)')}
              </h1>
              <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {lang === 'th' ? 'เปิดรับ' : 'Open'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]">{displayFunder}</p>
              {funderBadge && (
                <span className="text-[11px] font-medium text-[#1B3A6B] dark:text-[#4A7FD4]">
                  · {lang === 'th' ? funderBadge.th : funderBadge.en}
                </span>
              )}
            </div>
          </div>

          {/* Award tier badge */}
          {tierInfo && (
            <div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${tierInfo.color}`}>
                {lang === 'th' ? tierInfo.th : tierInfo.en}
              </span>
            </div>
          )}

          {/* Award amount box (numeric) */}
          {s.award_amount_thb_numeric != null && (
            <div className="bg-[#EEF3FD] dark:bg-[#162552] rounded-xl px-5 py-4">
              <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-1">
                {lang === 'th' ? 'มูลค่าทุน' : 'Award Amount'}
              </p>
              <p className="text-2xl font-bold text-[#1B3A6B] dark:text-[#4A7FD4]" style={{ fontFamily: 'Lato, sans-serif' }}>
                ฿{s.award_amount_thb_numeric.toLocaleString()}
                {s.award_type === 'annual' ? (lang === 'th' ? '/ปี' : '/yr') :
                 s.award_type === 'monthly' ? (lang === 'th' ? '/เดือน' : '/mo') : ''}
              </p>
            </div>
          )}

          {/* Eligibility chips */}
          <div className="flex flex-wrap gap-2">
            {s.level && <Chip label={s.level} />}
            {s.field_of_study && <Chip label={s.field_of_study} />}
            {s.region_eligibility && <Chip label={s.region_eligibility} />}
            {s.min_gpa != null && <Chip label={`GPA ≥ ${s.min_gpa}`} />}
            {s.targets_low_income && <Chip label={lang === 'th' ? 'รายได้น้อย' : 'Low-income priority'} />}
            {s.welfare_card_priority && <Chip label={lang === 'th' ? 'บัตรสวัสดิการ' : 'Welfare card'} />}
            {s.renewable && <Chip label={lang === 'th' ? 'ต่ออายุได้' : 'Renewable'} />}
            {s.bond_obligation && <Chip label={lang === 'th' ? 'มีพันธะผูกพัน' : 'Bond obligation'} />}
            {s.english_requirement && s.english_requirement.toLowerCase() !== 'none' && (
              <Chip label={s.english_requirement} />
            )}
          </div>

          {/* Detail rows */}
          <div>
            <DetailRow
              label={lang === 'th' ? 'วันหมดเขต' : 'Deadline'}
              value={
                <span className={deadline.urgent ? 'text-orange-600 dark:text-orange-400 font-medium' : undefined}>
                  {deadline.text}
                </span>
              }
            />
            <DetailRow
              label={lang === 'th' ? 'จำนวนผู้รับทุน' : 'No. of Recipients'}
              value={s.num_recipients != null ? s.num_recipients.toLocaleString() : null}
            />
            <DetailRow
              label={lang === 'th' ? 'รายได้สูงสุด (บ./ปี)' : 'Income Cap (THB/yr)'}
              value={s.income_cap_thb != null ? `฿${s.income_cap_thb.toLocaleString()}` : null}
            />
          </div>

          {/* Stale warning */}
          {s.stale && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              {lang === 'th'
                ? '⚠️ ข้อมูลนี้อาจไม่เป็นปัจจุบัน กรุณาตรวจสอบจากเว็บไซต์ผู้ให้ทุนอีกครั้ง'
                : '⚠️ This listing may be out of date. Please verify details on the funder\'s website.'}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white font-semibold py-3.5 rounded-[10px] text-sm transition-colors"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
            >
              {lang === 'th' ? 'สมัครทุน' : 'Apply for this Scholarship'}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <TrackButton scholarshipId={s.scholarship_id} size="sm" />
          </div>

          <p className="text-xs text-center text-[#ADADB8]">
            {lang === 'th'
              ? 'TunDee ไม่ใช่ตัวแทนของผู้ให้ทุน — กรุณาอ่านเงื่อนไขจากเว็บไซต์ทางการ'
              : 'TunDee is not affiliated with the funder — read official terms on the funder\'s website.'}
          </p>
        </div>
      </div>
    </div>
  );
}
