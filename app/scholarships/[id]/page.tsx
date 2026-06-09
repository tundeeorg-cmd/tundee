'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef, useCallback } from 'react';
// Note: ChecklistStep type no longer needed using InteractiveChecklist component
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ApplicationChecklist from '@/components/ApplicationChecklist';
import SaveButton from '@/components/SaveButton';
import { useLang } from '@/lib/LanguageContext';
import { supabase, getScholarshipById } from '@/lib/supabase';
import { logScholarshipViewed, logScholarshipApplied } from '@/lib/research/events';
import { translations, PROVINCE_EN_MAP, DOCUMENT_EN_MAP } from '@/lib/translations';
import type { Scholarship } from '@/lib/types';

// Match data stored by the browse page when navigating from My Matches tab
interface StoredMatchData {
  raw_score: number;
  fairness_score: number;
  correction_applied: number;
  fairness_boosted: boolean;
  reasons: string[];
  reasons_en: string[];
}

function loadMatchData(id: string): StoredMatchData | null {
  try {
    const raw = sessionStorage.getItem(`tundee_match_${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Fairness Tooltip ─────────────────────────────────────────────────────
function FairnessTooltip({ lang }: { lang: string }) {
  const [open, setOpen] = useState(false);
  const d = translations.detail;
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-1.5 w-4 h-4 rounded-full bg-[#2E6BE6]/20 text-[#2E6BE6] text-[10px] font-bold flex items-center justify-center hover:bg-[#2E6BE6]/30 transition-colors"
        aria-label="Fairness info"
      >
        i
      </button>
      {open && (
        <div className="absolute bottom-6 left-0 z-20 w-72 bg-white border border-[#E5E5EA] rounded-[10px] shadow-lg p-3 text-xs text-[#6E6E73] leading-relaxed"
          style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
          {d.fairnessTooltip[lang as 'th' | 'en']}
          <button onClick={() => setOpen(false)} className="block mt-2 text-[#2E6BE6] font-medium">
            {lang === 'th' ? 'ปิด' : 'Close'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Why This Matched Panel ────────────────────────────────────────────────
function ExplainabilityPanel({ matchData, lang }: { matchData: StoredMatchData; lang: string }) {
  const d = translations.detail;
  const reasons = lang === 'th' ? matchData.reasons : matchData.reasons_en;
  const rawPct = Math.round(matchData.raw_score * 100);
  const fairPct = Math.round(matchData.fairness_score * 100);
  const color = matchData.fairness_boosted ? '#2E6BE6' : '#0066CC';

  return (
    <div className="bg-[#FAFAFA] border border-[#E5E5EA] rounded-[12px] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-base">🎯</span>
        <h3 className="text-sm font-semibold text-[#1D1D1F]"
          style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
          {d.whyMatch[lang as 'th' | 'en']}
        </h3>
      </div>

      {/* Reasons */}
      {reasons.length > 0 && (
        <ul className="space-y-1.5">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[#6E6E73]">
              <span className="text-[#2E6BE6] mt-0.5 shrink-0">✓</span>
              <span style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Score bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <span className="text-xs text-[#6E6E73]">{translations.browse.matchScore[lang as 'th' | 'en']}</span>
            {matchData.fairness_boosted && <FairnessTooltip lang={lang} />}
          </div>
          <span className="text-sm font-bold" style={{ color }}>{fairPct}%</span>
        </div>
        <div className="h-2 bg-[#F7F9FC] rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${fairPct}%`, background: color }} />
        </div>
      </div>

      {/* Fairness badge + raw vs adjusted */}
      {matchData.fairness_boosted && (
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-[#2E6BE6] bg-[#EFF4FF] border border-[#2E6BE6]/30 px-2.5 py-0.5 rounded-full">
              {d.fairnessBadgeDetail[lang as 'th' | 'en']}
            </span>
          </div>
          <span className="text-[10px] text-[#ADADB8]">
            {d.rawScore[lang as 'th' | 'en']} {rawPct}% → {d.fairnessAdjusted[lang as 'th' | 'en']} {fairPct}%
          </span>
        </div>
      )}
    </div>
  );
}

function translateProvince(name: string, lang: string): string {
  if (lang === 'en') return PROVINCE_EN_MAP[name] ?? name;
  return name;
}

function translateDocument(doc: string, lang: string): string {
  if (lang === 'en') return DOCUMENT_EN_MAP[doc] ?? doc;
  return doc;
}

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
  const [loading, setLoading] = useState(true);
  const [matchData, setMatchData] = useState<StoredMatchData | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const checklistRef = useRef<HTMLDivElement>(null);

  const d = translations.detail;
  const ft = translations.funderTypes;

  useEffect(() => {
    // Load match data from sessionStorage (set by browse page My Matches tab)
    setMatchData(loadMatchData(id));

    getScholarshipById(id).then((s) => {
      setScholarship(s);
      setLoading(false);
    });

    // Research: log that this scholarship was viewed (fire-and-forget)
    logScholarshipViewed(id);
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-20">
        <div className="h-8 w-32 bg-[#F7F9FC] rounded animate-pulse mb-8" />
        <div className="h-12 w-3/4 bg-[#F7F9FC] rounded animate-pulse mb-4" />
        <div className="h-6 w-1/2 bg-[#F7F9FC] rounded animate-pulse" />
      </div>
    );
  }

  if (!scholarship) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-20 text-center">
        <p className="text-[#6E6E73]">ไม่พบทุนนี้ / Scholarship not found</p>
        <Link href="/scholarships" className="mt-4 inline-block text-[#2E6BE6] hover:underline">
          {d.back[lang]}
        </Link>
      </div>
    );
  }

  const s = scholarship;
  const sx = s as Scholarship & {
    tier?: 'SAFETY' | 'TARGET' | 'REACH';
    renewable?: boolean;
    bond_obligation?: boolean;
    english_level?: string;
    english_score_required?: string | null;
    special_skills?: string[];
    talents?: string[];
    grade_levels?: string[];
  };

  const GRADE_LABEL: Record<string, { th: string; en: string }> = {
    M1: { th: 'ม.1', en: 'M1 (Gr.7)' },
    M2: { th: 'ม.2', en: 'M2 (Gr.8)' },
    M3: { th: 'ม.3', en: 'M3 (Gr.9)' },
    M4: { th: 'ม.4', en: 'M4 (Gr.10)' },
    M5: { th: 'ม.5', en: 'M5 (Gr.11)' },
    M6: { th: 'ม.6', en: 'M6 (Gr.12)' },
    'ม.ต้น': { th: 'ม.ต้น (ม.1–3)', en: 'Lower Secondary' },
    'ม.ปลาย': { th: 'ม.ปลาย (ม.4–6)', en: 'Upper Secondary' },
    'ปวช.': { th: 'ปวช.', en: 'Vocational Cert.' },
    'ปวส.': { th: 'ปวส.', en: 'Vocational Diploma' },
    vocational: { th: 'สายอาชีพ', en: 'Vocational' },
    uni: { th: 'ปริญญาตรี', en: 'Undergraduate' },
    graduate: { th: 'บัณฑิตศึกษา', en: 'Graduate' },
  };

  const name = lang === 'th' ? s.name_th : (s.name_en ?? s.name_th);
  const nameSecondary = lang === 'th' ? s.name_en : s.name_th;
  const funder = lang === 'th' ? s.funder_name_th : (s.funder_name_en ?? s.funder_name_th);
  const description = lang === 'th' ? s.description_th : (s.description_en ?? s.description_th);
  const funderTypeLabel = s.funder_type
    ? (ft[s.funder_type as keyof typeof ft]?.[lang] ?? s.funder_type)
    : '';
  const funderColor = s.funder_type
    ? (FUNDER_TYPE_COLORS[s.funder_type] ?? 'bg-gray-50 text-gray-600 border-gray-200')
    : '';

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

  const isExpired = s.deadline_date !== null && new Date(s.deadline_date) < new Date();

  return (
    <div className="bg-white dark:bg-[#000000] min-h-screen">
      <style>{`
        @media print {
          nav, .no-print, button:not(.print-keep), .sticky { display: none !important; }
          body { font-size: 12pt; background: white; }
          .print-break { page-break-before: always; }
          a[href]::after { content: " (" attr(href) ")"; font-size: 9pt; color: #666; }
        }
      `}</style>
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        {/* Back */}
        <Link
          href="/scholarships"
          className="inline-flex items-center text-sm text-[#6E6E73] hover:text-[#2E6BE6] transition-colors mb-8"
        >
          {d.back[lang]}
        </Link>

        {/* Expired deadline warning */}
        {isExpired && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 flex items-start gap-3">
            <span className="text-lg shrink-0">⚠️</span>
            <p className="text-red-700 dark:text-red-400 font-semibold text-sm">
              {lang === 'th'
                ? 'ทุนนี้หมดเขตรับสมัครแล้ว ตรวจสอบเว็บไซต์ทุนสำหรับรอบถัดไป'
                : 'This scholarship deadline has passed check the funder\'s website for the next cycle'}
            </p>
          </div>
        )}

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
                  <Pill className="bg-[#EFF4FF] text-[#2E6BE6] border-[#2E6BE6]/40">
                    {d.welfareCardPill[lang]}
                  </Pill>
                )}
              </div>
              <h1
                className="text-2xl md:text-4xl text-[#1D1D1F] mb-2 leading-tight"
                style={{
                  fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif',
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
              <div className="bg-[#EFF4FF] border border-[#2E6BE6]/20 rounded-[12px] p-5">
                <div className="text-xs text-[#6E6E73] mb-1">{d.amount[lang]}</div>
                <div
                  className="text-lg font-semibold text-[#2E6BE6]"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                >
                  {formatAmount()}
                </div>
              </div>
              <div className="bg-[#F7F9FC] rounded-[12px] p-5">
                <div className="text-xs text-[#6E6E73] mb-1">{d.deadline[lang]}</div>
                <div className="text-sm font-semibold text-[#1D1D1F]">{formatDeadline()}</div>
              </div>
              <div className="bg-[#F7F9FC] rounded-[12px] p-5">
                <div className="text-xs text-[#6E6E73] mb-1">{d.funderType[lang]}</div>
                <div className="text-sm font-semibold text-[#1D1D1F]">{funderTypeLabel}</div>
              </div>
            </div>

            {/* Description */}
            {description && (
              <div>
                <h2
                  className="text-lg font-semibold text-[#1D1D1F] mb-3"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
                >
                  {d.description[lang]}
                </h2>
                <p
                  className="text-[#6E6E73] leading-relaxed text-[15px]"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
                >
                  {description}
                </p>
              </div>
            )}

            {/* Eligibility table */}
            <div>
              <h2
                className="text-lg font-semibold text-[#1D1D1F] mb-4"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
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
                      : (s.province_restriction ?? []).map((p) => translateProvince(p, lang)).join(', ')
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
                {/* Grade levels (new array field) */}
                {sx.grade_levels && sx.grade_levels.length > 0 && (
                  <InfoRow
                    label={d.gradeLevelsLabel[lang]}
                    value={sx.grade_levels.map(g => GRADE_LABEL[g]?.[lang as 'th' | 'en'] ?? g).join(', ')}
                  />
                )}
                {/* Renewable */}
                {sx.renewable != null && (
                  <InfoRow
                    label={d.renewable[lang]}
                    value={sx.renewable ? d.boolYes[lang] : d.boolNo[lang]}
                  />
                )}
                {/* Bond obligation */}
                {sx.bond_obligation != null && (
                  <InfoRow
                    label={d.bondObligation[lang]}
                    value={sx.bond_obligation ? d.boolYes[lang] : d.boolNo[lang]}
                  />
                )}
                {/* English level */}
                {sx.english_level && sx.english_level !== 'none' && (
                  <InfoRow
                    label={d.englishLevel[lang]}
                    value={sx.english_level}
                  />
                )}
                {/* English score required */}
                {sx.english_score_required && (
                  <InfoRow
                    label={d.scoreRequired[lang]}
                    value={sx.english_score_required}
                  />
                )}
                {/* Special skills */}
                {sx.special_skills && sx.special_skills.length > 0 && (
                  <InfoRow
                    label={d.specialSkills[lang]}
                    value={
                      <div className="flex flex-wrap gap-1.5">
                        {sx.special_skills.map((skill, i) => (
                          <span key={i} className="text-xs bg-[#F7F9FC] text-[#6E6E73] px-2.5 py-1 rounded-full border border-[#E5E5EA]">
                            {skill}
                          </span>
                        ))}
                      </div>
                    }
                  />
                )}
                {/* Talents */}
                {sx.talents && sx.talents.length > 0 && (
                  <InfoRow
                    label={d.talents[lang]}
                    value={
                      <div className="flex flex-wrap gap-1.5">
                        {sx.talents.map((t, i) => (
                          <span key={i} className="text-xs bg-[#F7F9FC] text-[#6E6E73] px-2.5 py-1 rounded-full border border-[#E5E5EA]">
                            {t}
                          </span>
                        ))}
                      </div>
                    }
                  />
                )}
              </dl>
            </div>

            {/* Explainability panel (only when coming from My Matches tab) */}
            {matchData && <ExplainabilityPanel matchData={matchData} lang={lang} />}

            {/* Documents */}
            {s.documents_required && s.documents_required.length > 0 && (
              <div>
                <h2
                  className="text-lg font-semibold text-[#1D1D1F] mb-4"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
                >
                  {d.documents[lang]}
                </h2>
                <ul className="space-y-2">
                  {s.documents_required.map((doc, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="w-4 h-4 text-[#2E6BE6] mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-[#1D1D1F]">{translateDocument(doc, lang)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Interactive checklist saves progress to applications table */}
            <div ref={checklistRef}>
              <ApplicationChecklist
                scholarshipId={id}
                applicationUrl={s.application_url ?? null}
                lang={lang as 'th' | 'en'}
              />
            </div>
          </div>

          {/* Sticky sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              {/* Apply CTA */}
              {(() => {
                const canApply = s.application_url && s.application_url !== 'CHECK_WEBSITE';
                const applyHref = canApply
                  ? s.application_url!
                  : `https://www.google.com/search?q=${encodeURIComponent((s.name_th ?? '') + ' สมัคร')}`;
                const trackClick = async () => {
                  try {
                    const { data: { user: clickUser } } = await supabase.auth.getUser();
                    if (clickUser) {
                      // Fetch GPA at time of click — key variable for Regression Discontinuity analysis
                      const { data: profile } = await supabase
                        .from('profiles')
                        .select('gpa')
                        .eq('id', clickUser.id)
                        .maybeSingle();

                      await supabase.from('applications').upsert(
                        {
                          user_id:             clickUser.id,
                          scholarship_id:      s.id,
                          status:              'started',
                          clicked_through_at:  new Date().toISOString(),
                          gpa_at_application:  profile?.gpa ?? null,
                        },
                        { onConflict: 'user_id,scholarship_id' }
                      );

                      // Research: log apply event (fire-and-forget)
                      logScholarshipApplied(s.id);
                    }
                  } catch { /* silent */ }
                };
                return (
                  <a
                    href={applyHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={trackClick}
                    className={`flex items-center justify-center gap-2 w-full font-semibold py-4 px-6 rounded-full transition-colors duration-200 text-sm ${
                      canApply
                        ? 'bg-[#2E6BE6] text-white hover:bg-[#1E57CC]'
                        : 'bg-[#F7F9FC] dark:bg-[#232B3E] text-[#1D1D1F] dark:text-white hover:bg-[#E5E5EA] dark:hover:bg-[#38383A] border border-[#E5E5EA] dark:border-[#232B3E]'
                    }`}
                    style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
                  >
                    {canApply
                      ? <>
                          {d.applyNow[lang]}
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </>
                      : <>
                          {lang === 'th' ? 'ค้นหาข้อมูลทุนนี้' : 'Search for this scholarship'}
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </>
                    }
                  </a>
                );
              })()}

              {/* Share + Print */}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const url = window.location.href;
                    const title = lang === 'th' ? s.name_th : (s.name_en ?? s.name_th);
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title,
                          text: lang === 'th' ? `พบทุน ${title} บน TunDee` : `Check out ${title} on TunDee`,
                          url,
                        });
                      } catch { /* user cancelled */ }
                    } else {
                      await navigator.clipboard.writeText(url);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2500);
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full border border-[#E5E5EA] dark:border-[#232B3E] text-xs font-medium text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6] hover:text-[#2E6BE6] transition-colors no-print"
                >
                  {linkCopied ? '✓ ' : '🔗 '}
                  {linkCopied
                    ? (lang === 'th' ? 'คัดลอกแล้ว' : 'Copied!')
                    : (lang === 'th' ? 'แชร์' : 'Share')}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full border border-[#E5E5EA] dark:border-[#232B3E] text-xs font-medium text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#2E6BE6] hover:text-[#2E6BE6] transition-colors no-print"
                >
                  🖨️ {lang === 'th' ? 'พิมพ์' : 'Print'}
                </button>
              </div>

              {/* Save scholarship */}
              <div className="flex items-center justify-center gap-2 py-2">
                <SaveButton scholarshipId={s.id} size="md" />
              </div>

              {/* Scroll to checklist */}
              <button
                onClick={() => {
                  checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="flex items-center justify-center gap-2 w-full border border-[#2E6BE6] text-[#2E6BE6] font-semibold py-4 px-6 rounded-full hover:bg-[#EFF4FF] transition-colors duration-200 text-sm"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
              >
                {d.startChecklist[lang]}
              </button>

              {/* Quick info card */}
              <div className="bg-[#F7F9FC] rounded-[12px] p-5 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#6E6E73]">{d.amount[lang]}</span>
                  <span className="font-semibold text-[#2E6BE6]">{formatAmount()}</span>
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
