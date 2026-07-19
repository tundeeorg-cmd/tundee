'use client';

import type { TdScholarship } from '@/lib/tdScholarships/types';
import { useLang } from '@/lib/LanguageContext';
import TrackButton from './TrackButton';

const FUNDER_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  'Thai University':                   { label: 'มหาวิทยาลัย', color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  'Thai Government / Royal':           { label: 'รัฐบาล/ราชการ', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  'Corporate / Bank / Foundation':     { label: 'เอกชน/มูลนิธิ', color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  'International (open to Thais)':     { label: 'นานาชาติ', color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

const LEVEL_LABEL: Record<string, string> = {
  'High school':    'มัธยม',
  'Undergraduate':  'ป.ตรี',
  "Master's":       'ป.โท',
  'PhD':            'ป.เอก',
  'Multiple':       'หลายระดับ',
};

function formatDeadline(s: TdScholarship, lang: string): { text: string; urgent: boolean } {
  if (s.deadline_date) {
    const d = new Date(s.deadline_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
    const dateStr = d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    const urgent = days >= 0 && days <= 30;
    if (days === 0) return { text: lang === 'th' ? 'หมดเขตวันนี้' : 'Closes today', urgent: true };
    if (days < 0)  return { text: lang === 'th' ? 'หมดเขตแล้ว' : 'Expired', urgent: false };
    return { text: dateStr, urgent };
  }
  if (s.deadline_is_rolling) {
    return { text: lang === 'th' ? 'เปิดรับตลอด' : 'Rolling / see details', urgent: false };
  }
  if (s.deadline_note) return { text: s.deadline_note, urgent: false };
  return { text: lang === 'th' ? 'ดูเว็บไซต์' : 'See website', urgent: false };
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F5F7FA] dark:bg-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] border border-[#E5E5EA] dark:border-[#3A3A3C]">
      {label}
    </span>
  );
}

export default function TdScholarshipCard({ scholarship: s }: { scholarship: TdScholarship }) {
  const { lang } = useLang();
  const badge = s.funder_type ? FUNDER_TYPE_BADGE[s.funder_type] : null;
  const deadline = formatDeadline(s, lang);
  const levelLabel = s.level ? (LEVEL_LABEL[s.level] ?? s.level) : null;

  return (
    <article className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-5 flex flex-col gap-3 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-shadow duration-200">

      {/* Header */}
      <div className="flex items-start gap-2 justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-white leading-snug line-clamp-2"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
            {s.scholarship_name}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93] truncate">{s.funder}</span>
            {badge && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.color}`}>
                {badge.label}
              </span>
            )}
          </div>
        </div>

        {/* Status badge */}
        <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          {lang === 'th' ? 'เปิดรับ' : 'Open'}
        </span>
      </div>

      {/* Award amount */}
      {s.award_amount_thb && (
        <div className="text-base font-bold text-[#1B3A6B] dark:text-[#4A7FD4]"
             style={{ fontFamily: 'Lato, sans-serif' }}>
          {s.award_amount_thb}
        </div>
      )}

      {/* Eligibility chips */}
      <div className="flex flex-wrap gap-1.5">
        {levelLabel && <Chip label={levelLabel} />}
        {s.field_of_study && <Chip label={s.field_of_study.length > 28 ? s.field_of_study.slice(0, 28) + '…' : s.field_of_study} />}
        {s.region_eligibility && <Chip label={s.region_eligibility} />}
        {s.min_gpa && <Chip label={`GPA ≥ ${s.min_gpa}`} />}
        {s.income_cap_thb && <Chip label={lang === 'th' ? `รายได้ ≤ ${s.income_cap_thb.toLocaleString()} บ./ปี` : `Inc ≤ ฿${s.income_cap_thb.toLocaleString()}/yr`} />}
        {s.targets_low_income && <Chip label={lang === 'th' ? 'นักเรียนรายได้น้อย' : 'Low-income priority'} />}
        {s.language && s.language.toLowerCase() !== 'thai' && s.language.toLowerCase() !== 'ไทย' && <Chip label={s.language} />}
      </div>

      {/* Deadline */}
      <div className={`flex items-center gap-1.5 text-xs font-medium ${deadline.urgent ? 'text-orange-600 dark:text-orange-400' : 'text-[#6E6E73] dark:text-[#8E8E93]'}`}>
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{lang === 'th' ? 'หมดเขต: ' : 'Deadline: '}{deadline.text}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        <a
          href={s.application_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white text-sm font-semibold px-4 py-2 rounded-[8px] transition-colors"
          style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
        >
          {lang === 'th' ? 'สมัครทุน' : 'Apply'}
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <TrackButton scholarshipId={s.scholarship_id} size="sm" />
        <a
          href={`/scholarships/td/${s.scholarship_id}`}
          className="px-3 py-2 border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[8px] text-sm text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#1B3A6B] hover:text-[#1B3A6B] transition-colors"
          style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
        >
          {lang === 'th' ? 'รายละเอียด' : 'Details'}
        </a>
      </div>
    </article>
  );
}
