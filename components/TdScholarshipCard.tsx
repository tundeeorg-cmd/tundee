'use client';

import Link from 'next/link';
import type { TdScholarship, TdAwardValueTier } from '@/lib/tdScholarships/types';
import { useLang } from '@/lib/LanguageContext';
import TrackButton from './TrackButton';
import { formatUserDate } from '@/lib/formatDate';
import { logFunnelEvent } from '@/lib/research/funnel';

// ── Public types ──────────────────────────────────────────────────────────────

export interface TdCardMatchInfo {
  score: number;
  reasons: string[];
  reasons_en: string[];
}

interface Props {
  scholarship: TdScholarship;
  matchInfo?: TdCardMatchInfo;
  userId?: string | null;
  variant?: string | null;
}

// ── Lookup tables ─────────────────────────────────────────────────────────────

const FUNDER_TYPE_BADGE: Record<string, { th: string; en: string; color: string }> = {
  'Thai University':               { th: 'มหาวิทยาลัย',   en: 'University',    color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  'Thai Government / Royal':       { th: 'รัฐบาล/ราชการ', en: 'Government',    color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  'Corporate / Bank / Foundation': { th: 'เอกชน/มูลนิธิ', en: 'Corporate',     color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  'International (open to Thais)': { th: 'นานาชาติ',       en: 'International', color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

const LEVEL_LABEL: Record<string, { th: string; en: string }> = {
  'High school':   { th: 'มัธยม',     en: 'High School' },
  'Undergraduate': { th: 'ป.ตรี',     en: "Bachelor's"  },
  "Master's":      { th: 'ป.โท',      en: "Master's"    },
  'PhD':           { th: 'ป.เอก',     en: 'PhD'         },
  'Multiple':      { th: 'หลายระดับ', en: 'Multiple'    },
};

const AWARD_TIER_LABEL: Record<TdAwardValueTier, { th: string; en: string; color: string }> = {
  full_ride:    { th: 'ทุนเต็มจำนวน (ค่าเรียน+ค่าครองชีพ)', en: 'Full-ride',         color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800' },
  full_tuition: { th: 'ค่าเล่าเรียนเต็มจำนวน',              en: 'Full-tuition',      color: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 ring-1 ring-teal-200 dark:ring-teal-800' },
  large:        { th: 'ทุนขนาดใหญ่ (≥100k)',                en: 'Large (≥100k ฿)',   color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800' },
  medium:       { th: 'ทุนขนาดกลาง (20k–100k)',             en: 'Medium (20k–100k)', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800' },
  small:        { th: 'ทุนขนาดเล็ก (<20k)',                 en: 'Small (<20k ฿)',    color: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300' },
  stipend_only: { th: 'ค่าครองชีพ/เบี้ยเลี้ยง',              en: 'Stipend only',     color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
};

const FIELD_MAP: Record<string, { th: string; en: string }> = {
  'Any':             { th: 'ทุกสาขา', en: 'All fields' },
  'any':             { th: 'ทุกสาขา', en: 'All fields' },
  'All fields':      { th: 'ทุกสาขา', en: 'All fields' },
  'All':             { th: 'ทุกสาขา', en: 'All fields' },
  'Any / Multiple':  { th: 'ทุกสาขา', en: 'All fields' },
  'any / multiple':  { th: 'ทุกสาขา', en: 'All fields' },
  'Multiple':        { th: 'หลายสาขา', en: 'Multiple fields' },
};

const REGION_MAP: Record<string, { th: string; en: string }> = {
  'National (Thailand)': { th: 'ทั่วประเทศ',   en: 'Nationwide' },
  'National':            { th: 'ทั่วประเทศ',   en: 'Nationwide' },
  'Northeast':           { th: 'ภาคอีสาน',     en: 'Northeast'  },
  'North':               { th: 'ภาคเหนือ',     en: 'North'      },
  'South':               { th: 'ภาคใต้',       en: 'South'      },
  'Central':             { th: 'ภาคกลาง',      en: 'Central'    },
  'East':                { th: 'ภาคตะวันออก',  en: 'East'       },
  'West':                { th: 'ภาคตะวันตก',   en: 'West'       },
  'Bangkok':             { th: 'กรุงเทพฯ',     en: 'Bangkok'    },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveName(s: TdScholarship, lang: string): string {
  return lang === 'th'
    ? s.scholarship_name_th || s.scholarship_name_en || s.scholarship_name || ''
    : s.scholarship_name_en || s.scholarship_name_th || s.scholarship_name || '';
}

function resolveFunder(s: TdScholarship, lang: string): string {
  return lang === 'th'
    ? s.funder_th || s.funder_en || s.funder || ''
    : s.funder_en || s.funder_th || s.funder || '';
}

function localizeField(val: string, lang: string): string {
  return FIELD_MAP[val]?.[lang as 'th' | 'en'] ?? val;
}

function localizeRegion(val: string, lang: string): string {
  return REGION_MAP[val]?.[lang as 'th' | 'en'] ?? val;
}

function matchBg(score: number): string {
  if (score >= 0.9) return 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300';
  if (score >= 0.7) return 'bg-[#EFF4FF] dark:bg-[#162552] text-[#1B3A6B] dark:text-[#4A7FD4]';
  if (score >= 0.5) return 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300';
  return 'bg-[#F5F7FA] dark:bg-[#1A2440] text-[#6E6E73] dark:text-[#8E8E93]';
}

// ── Micro-components ──────────────────────────────────────────────────────────

function LabeledChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center text-[11px] rounded-full px-2 py-0.5 bg-[#F5F7FA] dark:bg-[#1A2440] text-[#4A4A5A] dark:text-[#8E8E93] border border-[#E5E5EA] dark:border-[#243050]">
      <span className="font-semibold mr-0.5 text-[#1B3A6B] dark:text-[#4A7FD4]">{label}:</span>
      {value}
    </span>
  );
}

function FlagChip({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center text-[11px] rounded-full px-2 py-0.5 font-medium ${color}`}>
      {label}
    </span>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function TdScholarshipCard({ scholarship: s, matchInfo, userId, variant }: Props) {
  const { lang } = useLang();
  const lo = lang as 'th' | 'en';

  const name   = resolveName(s, lang);
  const funder = resolveFunder(s, lang);
  const badge  = s.funder_type ? FUNDER_TYPE_BADGE[s.funder_type] : null;
  const tier   = s.award_value_tier ? AWARD_TIER_LABEL[s.award_value_tier] : null;
  const level  = s.level ? LEVEL_LABEL[s.level] : null;

  // Deadline
  let deadlineText = '';
  let days: number | null = null;
  if (s.deadline_date) {
    days = Math.ceil((new Date(s.deadline_date).getTime() - Date.now()) / 86_400_000);
    deadlineText = days === 0
      ? (lo === 'th' ? 'หมดเขตวันนี้' : 'Closes today')
      : days < 0
      ? (lo === 'th' ? 'หมดเขตแล้ว' : 'Expired')
      : formatUserDate(s.deadline_date, lo);
  } else if (s.deadline_is_rolling) {
    deadlineText = lo === 'th' ? 'เปิดรับตลอด' : 'Rolling / see details';
  } else if (s.deadline_note) {
    // If deadline_note is a concrete D-Mon-YYYY date stored as text, format it.
    const NOTE_DATE_RE = /^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})$/;
    const EN_MON: Record<string,string> = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
    const noteMatch = s.deadline_note.match(NOTE_DATE_RE);
    if (noteMatch) {
      const iso = `${noteMatch[3]}-${EN_MON[noteMatch[2]]}-${noteMatch[1].padStart(2,'0')}`;
      days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
      deadlineText = formatUserDate(iso, lo);
    } else {
      deadlineText = s.deadline_note;
    }
  } else {
    deadlineText = lo === 'th' ? 'ดูเว็บไซต์' : 'See website';
  }

  const deadlineColor = days === null || days < 0
    ? 'text-[#ADADB8] dark:text-[#636366]'
    : days === 0 || days <= 7
    ? 'text-red-600 dark:text-red-400'
    : days <= 30
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-[#6E6E73] dark:text-[#8E8E93]';

  const daysLabel = days !== null && days > 0
    ? (lo === 'th' ? `เหลือ ${days} วัน` : `${days}d left`)
    : null;

  return (
    <article
      className="group bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-2xl p-5 flex flex-col gap-3 hover:shadow-[0_8px_30px_rgba(27,58,107,0.10)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.30)] transition-shadow duration-200"
      aria-label={name}
    >
      {/* ── Header: name + funder ── */}
      <div className="flex items-start gap-2 justify-between">
        <div className="flex-1 min-w-0">
          <h3
            className="text-[14px] font-semibold text-[#1D1D1F] dark:text-white leading-snug line-clamp-2"
            style={{ fontFamily: lo === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
          >
            {name || (lo === 'th' ? '(ไม่มีชื่อ)' : '(No name)')}
          </h3>
          {funder && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-[12px] text-[#6E6E73] dark:text-[#8E8E93]">{funder}</span>
              {badge && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${badge.color}`}>
                  {badge[lo]}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Status pill */}
        <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true" />
          {lo === 'th' ? 'เปิดรับ' : 'Open'}
        </span>
      </div>

      {/* ── Match indicator (shown only when matchInfo provided) ── */}
      {matchInfo && (
        <div className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 ${matchBg(matchInfo.score)}`}>
          <span className="shrink-0 text-[15px] font-bold leading-none mt-0.5" aria-label={`${Math.round(matchInfo.score * 100)}% match`}>
            {Math.round(matchInfo.score * 100)}%
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold leading-none">
              {lo === 'th' ? 'ตรงกับคุณ' : 'Match for you'}
            </p>
            {(lo === 'th' ? matchInfo.reasons : matchInfo.reasons_en).length > 0 && (
              <p className="text-[11px] opacity-80 mt-1 leading-relaxed">
                {(lo === 'th' ? matchInfo.reasons : matchInfo.reasons_en).slice(0, 3).join(' • ')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Award value tier ── */}
      {tier && (
        <div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${tier.color}`}>
            {tier[lo]}
          </span>
        </div>
      )}

      {/* ── Labeled eligibility chips ── */}
      <div className="flex flex-wrap gap-1.5" aria-label={lo === 'th' ? 'คุณสมบัติ' : 'Eligibility'}>
        {level && (
          <LabeledChip label={lo === 'th' ? 'ระดับ' : 'Level'} value={level[lo]} />
        )}
        {s.field_of_study && (
          <LabeledChip
            label={lo === 'th' ? 'สาขา' : 'Field'}
            value={localizeField(s.field_of_study, lang)}
          />
        )}
        {s.region_eligibility && (
          <LabeledChip
            label={lo === 'th' ? 'ภูมิภาค' : 'Region'}
            value={localizeRegion(s.region_eligibility, lang)}
          />
        )}
        {s.min_gpa != null && (
          <LabeledChip label="GPA" value={`≥ ${s.min_gpa}`} />
        )}
        {s.income_cap_thb != null && (
          <LabeledChip
            label={lo === 'th' ? 'รายได้' : 'Income'}
            value={lo === 'th'
              ? `≤ ${s.income_cap_thb.toLocaleString()} บ./ปี`
              : `≤ ฿${s.income_cap_thb.toLocaleString()}/yr`}
          />
        )}
        {s.targets_low_income && (
          <FlagChip
            label={lo === 'th' ? 'นักเรียนรายได้น้อย' : 'Low-income priority'}
            color="bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300"
          />
        )}
        {s.welfare_card_priority && (
          <FlagChip
            label={lo === 'th' ? 'บัตรสวัสดิการ' : 'Welfare card'}
            color="bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
          />
        )}
        {s.renewable && (
          <FlagChip
            label={lo === 'th' ? '♻ ต่ออายุได้' : '♻ Renewable'}
            color="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
          />
        )}
        {s.bond_obligation && (
          <FlagChip
            label={lo === 'th' ? '⚠ มีข้อผูกพัน' : '⚠ Bond obligation'}
            color="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
          />
        )}
      </div>

      {/* ── Deadline ── */}
      <div className={`flex items-center gap-1.5 text-[12px] font-medium ${deadlineColor}`}>
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>
          <span className="text-[#6E6E73] dark:text-[#8E8E93] font-normal">{lo === 'th' ? 'หมดเขต ' : 'Deadline '}</span>
          {deadlineText}
          {daysLabel && (
            <span className="ml-1.5 font-bold">({daysLabel})</span>
          )}
        </span>
      </div>

      {/* ── Actions: Track (primary) + Details (secondary) ── */}
      <div className="flex items-center gap-2 mt-auto pt-3 border-t border-[#F0F2F5] dark:border-[#1A2440]">
        <TrackButton scholarshipId={s.scholarship_id} size="md" />
        <Link
          href={`/scholarships/td/${s.scholarship_id}`}
          onClick={() => {
            logFunnelEvent({
              eventType: 'view_detail',
              scholarshipId: s.scholarship_id,
              userId: userId ?? null,
              context: { variant: variant ?? null, from: 'list' },
            });
          }}
          className="shrink-0 px-4 py-2 border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-lg text-[13px] font-semibold text-[#1B3A6B] dark:text-[#4A7FD4] hover:bg-[#F0F4FF] dark:hover:bg-[#162552] hover:border-[#2E6BE6] transition-colors"
          style={{ fontFamily: lo === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
        >
          {lo === 'th' ? 'รายละเอียด' : 'Details'}
        </Link>
      </div>
    </article>
  );
}
