'use client';

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';
import SaveButton from '@/components/SaveButton';
import { getDeadlineInfo, DEADLINE_COLOR_MAP } from '@/lib/deadline';
import type { Scholarship } from '@/lib/types';

interface Props {
  scholarship: Scholarship;
}

const FUNDER_TYPE_COLORS: Record<string, string> = {
  government: 'bg-blue-50 text-blue-700',
  corporate: 'bg-purple-50 text-purple-700',
  foundation: 'bg-green-50 text-green-700',
  royal: 'bg-amber-50 text-amber-700',
  university: 'bg-rose-50 text-rose-700',
};

export default function ScholarshipCard({ scholarship: s }: Props) {
  const { lang } = useLang();
  const c = translations.card;
  const ft = translations.funderTypes;
  const d = translations.detail;

  const name = lang === 'th' ? s.name_th : (s.name_en ?? s.name_th);
  const funder = lang === 'th' ? s.funder_name_th : (s.funder_name_en ?? s.funder_name_th);
  const funderTypeLabel = s.funder_type
    ? (ft[s.funder_type as keyof typeof ft]?.[lang] ?? s.funder_type)
    : '';
  const colorClass = s.funder_type
    ? (FUNDER_TYPE_COLORS[s.funder_type] ?? 'bg-gray-50 text-gray-600')
    : 'bg-gray-50 text-gray-600';
  const isNational = !s.province_restriction || s.province_restriction.includes('national');
  const isAnyField = !s.field_of_study || s.field_of_study.includes('any');

  // Deadline urgency
  const deadlineInfo = getDeadlineInfo(s.deadline_date);
  const deadlineColors = DEADLINE_COLOR_MAP[deadlineInfo.color];
  const deadlineLabel = lang === 'th' ? deadlineInfo.label : deadlineInfo.labelEn;

  const isNew = s.created_at &&
    (Date.now() - new Date(s.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000;

  function formatAmount(): string {
    if (!s.amount_thb) return d.contactFunder[lang];
    const amount = s.amount_thb.toLocaleString('th-TH');
    if (s.amount_type === 'monthly') return `${amount} ${c.perMonth[lang]}`;
    if (s.amount_type === 'annual') return `${amount} ${c.perYear[lang]}`;
    return `${amount} ${c.oneTime[lang]}`;
  }

  return (
    <article className="scholarship-card-hover bg-white dark:bg-[#161B27] border border-[#E5E5EA] dark:border-[#232B3E] rounded-[12px] p-6 flex flex-col gap-4 group relative">

      {/* Save button top-right absolute */}
      <div className="absolute top-4 right-4 z-10">
        <SaveButton scholarshipId={s.id} size="sm" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 pr-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap mb-0.5">
            <h3
              className="text-base font-semibold text-[#1D1D1F] dark:text-white leading-snug line-clamp-2 group-hover:text-[#2E6BE6] transition-colors"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
            >
              {name}
            </h3>
            {isNew && (
              <span className="shrink-0 text-[10px] font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-700 mt-0.5">
                {lang === 'th' ? 'ใหม่' : 'New'}
              </span>
            )}
          </div>
          {funder && <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mt-1 truncate">{funder}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {s.funder_type && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colorClass}`}>
              {funderTypeLabel}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-[#2E6BE6] font-semibold text-sm" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        {formatAmount()}
      </div>

      {/* Tags max 3 visible */}
      <div className="flex flex-wrap gap-2">
        {s.welfare_card_priority && (
          <span className="text-xs bg-[#EFF4FF] dark:bg-[#162552] text-[#2E6BE6] dark:text-[#5B8EF0] border border-[#2E6BE6]/30 px-2 py-0.5 rounded-full">
            {c.welfareTag[lang]}
          </span>
        )}
        <span className="text-xs bg-[#F7F9FC] dark:bg-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] px-2 py-0.5 rounded-full">
          {isNational ? c.national[lang] : s.province_restriction?.[0] ?? ''}
        </span>
        <span className="text-xs bg-[#F7F9FC] dark:bg-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] px-2 py-0.5 rounded-full">
          {isAnyField ? c.anyField[lang] : s.field_of_study?.[0] ?? ''}
        </span>
        {s.min_gpa !== null && s.min_gpa !== undefined && (
          <span className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full">
            GPA {s.min_gpa.toFixed(1)}+
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#F5F5F7] dark:border-[#232B3E]">
        {/* Deadline urgency pill */}
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full border"
          style={{
            background: deadlineColors.bg,
            color: deadlineColors.text,
            borderColor: deadlineColors.border,
          }}
        >
          {deadlineLabel}
        </span>
        <Link href={`/scholarships/${s.id}`} className="text-sm text-[#2E6BE6] font-medium hover:underline shrink-0">
          {c.viewDetail[lang]}
        </Link>
      </div>
    </article>
  );
}
