'use client';

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';
import TierBadge from '@/components/TierBadge';
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

  function formatAmount(): string {
    if (!s.amount_thb) return d.contactFunder[lang];
    const amount = s.amount_thb.toLocaleString('th-TH');
    if (s.amount_type === 'monthly') return `${amount} ${c.perMonth[lang]}`;
    if (s.amount_type === 'annual') return `${amount} ${c.perYear[lang]}`;
    return `${amount} ${c.oneTime[lang]}`;
  }

  function formatDeadline(): string {
    if (!s.deadline_date) return d.contactFunderInline[lang];
    return new Date(s.deadline_date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  return (
    <article className="bg-white border border-[#E5E5EA] rounded-[12px] p-6 flex flex-col gap-4 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-shadow duration-300 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3
            className="text-base font-semibold text-[#1D1D1F] leading-snug line-clamp-2 group-hover:text-[#F0A500] transition-colors"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {name}
          </h3>
          {funder && <p className="text-sm text-[#6E6E73] mt-1 truncate">{funder}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {s.tier && <TierBadge tier={s.tier} lang={lang} />}
          {s.funder_type && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colorClass}`}>
              {funderTypeLabel}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-[#F0A500] font-semibold text-sm" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        {formatAmount()}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        {s.welfare_card_priority && (
          <span className="text-xs bg-[#FFF8E7] text-[#B8860B] border border-[#F0A500]/30 px-2 py-0.5 rounded-full">
            {c.welfareTag[lang]}
          </span>
        )}
        <span className="text-xs bg-[#F5F5F7] text-[#6E6E73] px-2 py-0.5 rounded-full">
          {isNational ? c.national[lang] : s.province_restriction?.[0] ?? ''}
        </span>
        <span className="text-xs bg-[#F5F5F7] text-[#6E6E73] px-2 py-0.5 rounded-full">
          {isAnyField ? c.anyField[lang] : s.field_of_study?.[0] ?? ''}
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#F5F5F7]">
        <div>
          <span className="text-xs text-[#6E6E73]">{c.deadline[lang]}: </span>
          <span className="text-xs font-medium text-[#1D1D1F]">{formatDeadline()}</span>
        </div>
        <Link href={`/scholarships/${s.id}`} className="text-sm text-[#F0A500] font-medium hover:underline shrink-0">
          {c.viewDetail[lang]}
        </Link>
      </div>
    </article>
  );
}
