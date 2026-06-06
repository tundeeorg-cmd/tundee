'use client';

import { useLang } from '@/lib/LanguageContext';
import { translations, PROVINCES_TH, FIELDS_OF_STUDY } from '@/lib/translations';
import type { FilterState, FunderType } from '@/lib/types';

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number;
}

const FUNDER_TYPES: { value: FunderType; th: string; en: string }[] = [
  { value: 'government', th: 'รัฐบาล', en: 'Government' },
  { value: 'corporate', th: 'เอกชน', en: 'Corporate' },
  { value: 'foundation', th: 'มูลนิธิ', en: 'Foundation' },
  { value: 'royal', th: 'ราชสกุล', en: 'Royal' },
  { value: 'university', th: 'มหาวิทยาลัย', en: 'University' },
];

const GPA_OPTIONS = [
  { value: null, th: 'ไม่จำกัด', en: 'Any GPA' },
  { value: 2.0, th: 'ขั้นต่ำ 2.00', en: 'Min 2.00' },
  { value: 2.5, th: 'ขั้นต่ำ 2.50', en: 'Min 2.50' },
  { value: 2.75, th: 'ขั้นต่ำ 2.75', en: 'Min 2.75' },
  { value: 3.0, th: 'ขั้นต่ำ 3.00', en: 'Min 3.00' },
  { value: 3.25, th: 'ขั้นต่ำ 3.25', en: 'Min 3.25' },
  { value: 3.5, th: 'ขั้นต่ำ 3.50', en: 'Min 3.50' },
];

export default function ScholarshipFilters({ filters, onChange, resultCount }: Props) {
  const { lang } = useLang();
  const b = translations.browse;
  const update = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });

  const hasActiveFilters =
    filters.funderType !== '' || filters.minGpa !== null ||
    filters.fieldOfStudy !== '' || filters.province !== '' ||
    filters.welfareCard || filters.gradeLevel !== '';

  const clearAll = () => onChange({ funderType: '', minGpa: null, fieldOfStudy: '', province: '', welfareCard: false, gradeLevel: '' });

  return (
    <div className="bg-white border border-[#E5E5EA] rounded-[12px] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[#1D1D1F]" style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
          {b.filters[lang]}
        </h2>
        {hasActiveFilters && (
          <button onClick={clearAll} className="text-xs text-[#F0A500] hover:underline">
            {b.clearFilters[lang]}
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="text-xs text-[#6E6E73]">{resultCount} {b.results[lang]}</div>

      {/* Funder type */}
      <div>
        <label className="block text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-3">
          {b.funderType[lang]}
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => update({ funderType: '' })}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filters.funderType === '' ? 'bg-[#F0A500] text-white border-[#F0A500]' : 'border-[#E5E5EA] text-[#6E6E73] hover:border-[#F0A500]'}`}
          >
            {b.funderAll[lang]}
          </button>
          {FUNDER_TYPES.map((ft) => (
            <button
              key={ft.value}
              onClick={() => update({ funderType: ft.value })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filters.funderType === ft.value ? 'bg-[#F0A500] text-white border-[#F0A500]' : 'border-[#E5E5EA] text-[#6E6E73] hover:border-[#F0A500]'}`}
            >
              {lang === 'th' ? ft.th : ft.en}
            </button>
          ))}
        </div>
      </div>

      {/* GPA filter */}
      <div>
        <label htmlFor="gpa-filter" className="block text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-3">
          {b.minGpa[lang]}
        </label>
        <select
          id="gpa-filter"
          value={filters.minGpa ?? ''}
          onChange={(e) => update({ minGpa: e.target.value === '' ? null : Number(e.target.value) })}
          className="w-full text-sm border border-[#E5E5EA] rounded-lg px-3 py-2 bg-white text-[#1D1D1F] focus:outline-none focus:border-[#F0A500]"
        >
          {GPA_OPTIONS.map((g) => (
            <option key={String(g.value)} value={g.value ?? ''}>{lang === 'th' ? g.th : g.en}</option>
          ))}
        </select>
      </div>

      {/* Grade level */}
      <div>
        <label className="block text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-3">
          {lang === 'th' ? 'ระดับชั้น' : 'Grade Level'}
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: '', th: 'ทุกระดับ', en: 'Any' },
            { value: 'ม.ต้น', th: 'ม.ต้น (ม.1–3)', en: 'Lower Sec.' },
            { value: 'ม.ปลาย', th: 'ม.ปลาย (ม.4–6)', en: 'Upper Sec.' },
            { value: 'ปวช./ปวส.', th: 'ปวช./ปวส.', en: 'Vocational' },
            { value: 'uni', th: 'ปริญญาตรี', en: 'Bachelor' },
            { value: 'graduate', th: 'บัณฑิตศึกษา', en: 'Graduate' },
          ].map((g) => (
            <button
              key={g.value}
              onClick={() => update({ gradeLevel: g.value })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filters.gradeLevel === g.value
                  ? 'bg-[#F0A500] text-white border-[#F0A500]'
                  : 'border-[#E5E5EA] text-[#6E6E73] hover:border-[#F0A500]'
              }`}
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
            >
              {lang === 'th' ? g.th : g.en}
            </button>
          ))}
        </div>
      </div>

      {/* Field of study */}
      <div>
        <label htmlFor="field-filter" className="block text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-3">
          {b.fieldOfStudy[lang]}
        </label>
        <select
          id="field-filter"
          value={filters.fieldOfStudy}
          onChange={(e) => update({ fieldOfStudy: e.target.value })}
          className="w-full text-sm border border-[#E5E5EA] rounded-lg px-3 py-2 bg-white text-[#1D1D1F] focus:outline-none focus:border-[#F0A500]"
        >
          <option value="">{b.fieldAny[lang]}</option>
          {FIELDS_OF_STUDY.map((f) => (
            <option key={f.th} value={f.th}>{lang === 'th' ? f.th : f.en}</option>
          ))}
        </select>
      </div>

      {/* Province */}
      <div>
        <label htmlFor="province-filter" className="block text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-3">
          {b.province[lang]}
        </label>
        <select
          id="province-filter"
          value={filters.province}
          onChange={(e) => update({ province: e.target.value })}
          className="w-full text-sm border border-[#E5E5EA] rounded-lg px-3 py-2 bg-white text-[#1D1D1F] focus:outline-none focus:border-[#F0A500]"
        >
          <option value="">{b.provinceAll[lang]}</option>
          {PROVINCES_TH.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Welfare card */}
      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.welfareCard}
            onChange={(e) => update({ welfareCard: e.target.checked })}
            className="mt-0.5 w-4 h-4 accent-[#F0A500] shrink-0"
          />
          <div>
            <div className="text-sm font-medium text-[#1D1D1F]">{b.welfareCard[lang]}</div>
            <div className="text-xs text-[#6E6E73] leading-relaxed mt-0.5">{b.welfareCardSub[lang]}</div>
          </div>
        </label>
      </div>
    </div>
  );
}
