'use client';

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';
import SaveButton from '@/components/SaveButton';
import { getDeadlineInfo } from '@/lib/deadline';
import type { Scholarship } from '@/lib/types';

interface Props {
  scholarship: Scholarship;
}

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
  const isNational = !s.province_restriction || s.province_restriction.includes('national');
  const isAnyField = !s.field_of_study || s.field_of_study.includes('any');

  // Deadline — plain colored text only
  const deadlineInfo = getDeadlineInfo(s.deadline_date);
  const deadlineLabel = lang === 'th' ? deadlineInfo.label : deadlineInfo.labelEn;
  const deadlineTextColor =
    deadlineInfo.color === 'red'    ? '#DC2626' :
    deadlineInfo.color === 'orange' ? '#D97706' :
    deadlineInfo.color === 'green'  ? '#16A34A' :
    '#6E7A8A';

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
    <article className="scholarship-card-hover bg-white dark:bg-[#0A1628] border border-[#E8ECF2] dark:border-[#1A2E4A] rounded-[12px] p-5 flex flex-col gap-3 group relative">

      {/* Save button top-right */}
      <div className="absolute top-4 right-4 z-10">
        <SaveButton scholarshipId={s.id} size="sm" />
      </div>

      {/* Funder type — plain uppercase text */}
      <div className="flex items-center gap-2 flex-wrap pr-8">
        {funderTypeLabel && (
          <span
            className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#8A96A8]"
            style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
          >
            {funderTypeLabel}
          </span>
        )}
        {isNew && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EBF2FF] text-[#1B3A6B]">
            {lang === 'th' ? 'ใหม่' : 'NEW'}
          </span>
        )}
      </div>

      {/* Name */}
      <h3
        className="text-[15px] font-semibold text-[#0A2342] dark:text-white leading-snug line-clamp-2"
        style={{ fontFamily: lang === 'th' ? "'Sarabun', sans-serif" : 'var(--font-lato), Lato, sans-serif' }}
      >
        {name}
      </h3>

      {/* Funder */}
      {funder && (
        <p className="text-[13px] text-[#6E7A8A] dark:text-[#7A8FA8] truncate">{funder}</p>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        {s.welfare_card_priority && (
          <span className="text-xs bg-[#EBF2FF] dark:bg-[#0D1F35] text-[#1B3A6B] dark:text-[#4A7FD4] px-2 py-0.5 rounded-full">
            {c.welfareTag[lang]}
          </span>
        )}
        <span className="text-xs bg-[#F5F7FA] dark:bg-[#0D1F35] text-[#6E7A8A] dark:text-[#7A8FA8] px-2 py-0.5 rounded-full">
          {isNational ? c.national[lang] : s.province_restriction?.[0] ?? ''}
        </span>
        <span className="text-xs bg-[#F5F7FA] dark:bg-[#0D1F35] text-[#6E7A8A] dark:text-[#7A8FA8] px-2 py-0.5 rounded-full">
          {isAnyField ? c.anyField[lang] : s.field_of_study?.[0] ?? ''}
        </span>
        {s.min_gpa !== null && s.min_gpa !== undefined && (
          <span className="text-xs bg-[#EBF2FF] dark:bg-[#0D1F35] text-[#1B3A6B] dark:text-[#4A7FD4] px-2 py-0.5 rounded-full">
            GPA {s.min_gpa.toFixed(1)}+
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#F0F2F6] dark:border-[#1A2E4A]">
        {/* Deadline — plain colored text */}
        <span
          className="text-[12px] font-medium"
          style={{ color: deadlineTextColor, fontFamily: 'var(--font-lato), Lato, sans-serif' }}
        >
          {deadlineLabel}
        </span>
        {/* Amount */}
        <span
          className="text-[14px] font-bold text-[#1B3A6B] dark:text-[#4A7FD4] shrink-0"
          style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
        >
          {formatAmount()}
        </span>
      </div>

      {/* Full-card link */}
      <Link href={`/scholarships/${s.id}`} className="absolute inset-0 rounded-[12px]" aria-label={name} />
    </article>
  );
}
