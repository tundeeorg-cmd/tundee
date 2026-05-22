'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ChecklistUI from '@/components/ChecklistUI';
import { useLang } from '@/lib/LanguageContext';
import { getScholarshipById, getChecklistSteps } from '@/lib/supabase';
import { translations } from '@/lib/translations';
import type { ChecklistStep, Scholarship } from '@/lib/types';

const FUNDER_TYPE_COLORS: Record<string, string> = {
  government: 'bg-blue-50 text-blue-700 border-blue-200',
  corporate: 'bg-purple-50 text-purple-700 border-purple-200',
  foundation: 'bg-green-50 text-green-700 border-green-200',
  royal: 'bg-amber-50 text-amber-700 border-amber-200',
  university: 'bg-rose-50 text-rose-700 border-rose-200',
};

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${className}`}>
      {children}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-[#F5F5F7] last:border-0">
      <dt className="text-sm text-[#6E6E73] sm:w-44 shrink-0">{label}</dt>
      <dd className="text-sm text-[#1D1D1F] font-medium flex-1">{value}</dd>
    </div>
  );
}

export default function ScholarshipDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { lang } = useLang();
  const [scholarship, setScholarship] = useState<Scholarship | null>(null);
  const [steps, setSteps] = useState<ChecklistStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChecklist, setShowChecklist] = useState(false);
  const checklistRef = useRef<HTMLDivElement>(null);

  const d = translations.detail;
  const ft = translations.funderTypes;

  useEffect(() => {
    Promise.all([getScholarshipById(id), getChecklistSteps()]).then(([s, st]) => {
      setScholarship(s);
      setSteps(st);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-20">
        <div className="h-8 w-32 bg-[#F5F5F7] rounded animate-pulse mb-8" />
        <div className="h-12 w-3/4 bg-[#F5F5F7] rounded animate-pulse mb-4" />
        <div className="h-6 w-1/2 bg-[#F5F5F7] rounded animate-pulse" />
      </div>
    );
  }

  if (!scholarship) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-20 text-center">
        <p className="text-[#6E6E73]">ไม่พบทุนนี้ / Scholarship not found</p>
        <Link href="/scholarships" className="mt-4 inline-block text-[#F0A500] hover:underline">
          {d.back[lang]}
        </Link>
      </div>
    );
  }

  const s = scholarship;
  const name = lang === 'th' ? s.name_th : (s.name_en ?? s.name_th);
  const nameSecondary = lang === 'th' ? s.name_en : s.name_th;
  const funder = lang === 'th' ? s.funder_name_th : (s.funder_name_en ?? s.funder_name_th);
  const description = lang === 'th' ? s.description_th : (s.description_en ?? s.description_th);
  const funderTypeLabel = s.funder_type ? ft[s.funder_type][lang] : '';
  const funderColor = s.funder_type ? FUNDER_TYPE_COLORS[s.funder_type] : '';

  const isNational = !s.province_restriction || s.province_restriction.includes('national');
  const isAnyField = !s.field_of_study || s.field_of_study.includes('any');

  function formatAmount(): string {
    if (!s.amount_thb) return d.contactFunder[lang];
    const amt = s.amount_thb.toLocaleString('th-TH');
    if (s.amount_type === 'monthly') return `${amt} ${d.perMonth[lang]}`;
    if (s.amount_type === 'annual') return `${amt} ${d.perYear[lang]}`;
    return `${amt} ${d.oneTime[lang]}`;
  }

  function formatDeadline(): string {
    if (!s.deadline_date) return d.noDeadline[lang];
    return new Date(s.deadline_date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        {/* Back */}
        <Link
          href="/scholarships"
          className="inline-flex items-center text-sm text-[#6E6E73] hover:text-[#F0A500] transition-colors mb-8"
        >
          {d.back[lang]}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-10">
            {/* Header */}
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {s.funder_type && (
                  <Pill className={funderColor}>{funderTypeLabel}</Pill>
                )}
                {s.welfare_card_priority && (
                  <Pill className="bg-[#FFF8E7] text-[#B8860B] border-[#F0A500]/40">
                    {d.welfareCardPill[lang]}
                  </Pill>
                )}
              </div>
              <h1
                className="text-2xl md:text-4xl text-[#1D1D1F] mb-2 leading-tight"
                style={{
                  fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif',
                  fontWeight: 400,
                }}
              >
                {name}
              </h1>
              {nameSecondary && (
                <p className="text-[#6E6E73] text-base mb-1">{nameSecondary}</p>
              )}
              {funder && (
                <p className="text-[#6E6E73] text-sm">{funder}</p>
              )}
            </div>

            {/* Key stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#FFF8E7] border border-[#F0A500]/20 rounded-[12px] p-5">
                <div className="text-xs text-[#6E6E73] mb-1">{d.amount[lang]}</div>
                <div
                  className="text-lg font-semibold text-[#F0A500]"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {formatAmount()}
                </div>
              </div>
              <div className="bg-[#F5F5F7] rounded-[12px] p-5">
                <div className="text-xs text-[#6E6E73] mb-1">{d.deadline[lang]}</div>
                <div className="text-sm font-semibold text-[#1D1D1F]">{formatDeadline()}</div>
              </div>
              <div className="bg-[#F5F5F7] rounded-[12px] p-5">
                <div className="text-xs text-[#6E6E73] mb-1">{d.funderType[lang]}</div>
                <div className="text-sm font-semibold text-[#1D1D1F]">{funderTypeLabel}</div>
              </div>
            </div>

            {/* Description */}
            {description && (
              <div>
                <h2
                  className="text-lg font-semibold text-[#1D1D1F] mb-3"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                >
                  {d.description[lang]}
                </h2>
                <p
                  className="text-[#6E6E73] leading-relaxed text-[15px]"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                >
                  {description}
                </p>
              </div>
            )}

            {/* Eligibility table */}
            <div>
              <h2
                className="text-lg font-semibold text-[#1D1D1F] mb-4"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {d.eligibility[lang]}
              </h2>
              <dl className="border border-[#E5E5EA] rounded-[12px] px-5 divide-y divide-[#F5F5F7]">
                <InfoRow
                  label={d.minGpa[lang]}
                  value={s.min_gpa ? s.min_gpa.toFixed(2) : d.gpaAny[lang]}
                />
                <InfoRow
                  label={d.maxIncome[lang]}
                  value={
                    s.max_income_thb
                      ? `${s.max_income_thb.toLocaleString('th-TH')} ${d.incomeUnit[lang]}`
                      : d.incomeAny[lang]
                  }
                />
                <InfoRow
                  label={d.provinces[lang]}
                  value={
                    isNational
                      ? translations.common.national[lang]
                      : (s.province_restriction ?? []).join(', ')
                  }
                />
                <InfoRow
                  label={d.fields[lang]}
                  value={
                    isAnyField
                      ? translations.common.anyField[lang]
                      : (s.field_of_study ?? []).join(', ')
                  }
                />
                <InfoRow
                  label={d.welfareCard[lang]}
                  value={s.welfare_card_priority ? d.welfareYes[lang] : d.welfareNo[lang]}
                />
              </dl>
            </div>

            {/* Documents */}
            {s.documents_required && s.documents_required.length > 0 && (
              <div>
                <h2
                  className="text-lg font-semibold text-[#1D1D1F] mb-4"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                >
                  {d.documents[lang]}
                </h2>
                <ul className="space-y-2">
                  {s.documents_required.map((doc, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="w-4 h-4 text-[#F0A500] mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-[#1D1D1F]">{doc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Checklist */}
            <div ref={checklistRef}>
              {showChecklist && <ChecklistUI steps={steps} />}
            </div>
          </div>

          {/* Sticky sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              {/* Apply CTA */}
              {s.application_url ? (
                <a
                  href={s.application_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-[#F0A500] text-white font-semibold py-4 px-6 rounded-full hover:bg-[#D4920A] transition-colors duration-200 text-sm"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                >
                  {d.applyNow[lang]}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ) : null}

              {/* Start checklist */}
              <button
                onClick={() => {
                  setShowChecklist(true);
                  setTimeout(() => {
                    checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
                className="flex items-center justify-center gap-2 w-full border border-[#F0A500] text-[#F0A500] font-semibold py-4 px-6 rounded-full hover:bg-[#FFF8E7] transition-colors duration-200 text-sm"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {d.startChecklist[lang]}
              </button>

              {/* Quick info card */}
              <div className="bg-[#F5F5F7] rounded-[12px] p-5 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#6E6E73]">{d.amount[lang]}</span>
                  <span className="font-semibold text-[#F0A500]">{formatAmount()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6E6E73]">{d.deadline[lang]}</span>
                  <span className="font-medium text-[#1D1D1F] text-right">{formatDeadline()}</span>
                </div>
                {s.min_gpa && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6E6E73]">{d.minGpa[lang]}</span>
                    <span className="font-medium text-[#1D1D1F]">{s.min_gpa.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
