'use client';

import { useId, useMemo, useState, useEffect } from 'react';
import { useLang } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { logFunnelEvent } from '@/lib/research/funnel';
import {
  PROVINCES, AREA_TYPES, INCOME_BANDS, SCHOOL_TYPES, PARENT_EDUCATION,
  INTENDED_LEVELS, INTENDED_FIELDS, LANGUAGE_PREFS, SCHOLARSHIP_TYPE_PREFS,
  deriveRegion, regionLabel, isMinor, computeAge,
  validateGpa, validateBirthYear, validateMonthlyIncome, validateClassRankPct, validateHouseholdSize,
  computeCompleteness,
  type BilingualOption,
} from '@/lib/studentProfile';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentProfileFormData {
  province: string;
  area_type: string;
  household_income_band: string;
  welfare_card: boolean;
  school_type: string;
  school_province: string;
  first_generation: boolean | null;
  parent_education: string;
  household_size: string;
  monthly_income_thb: string;
  class_rank_pct: string;
  disability_status: string;
  gender: string;
  birth_year: string;
  gpa: string;
  intended_level: string;
  intended_field: string;
  preferred_scholarship_types: string[];
  language_pref: string;
  consent_research: boolean;
  guardian_consent: boolean;
}

const BLANK: StudentProfileFormData = {
  province: '', area_type: '', household_income_band: '',
  welfare_card: false, school_type: '', school_province: '',
  first_generation: null, parent_education: '', household_size: '',
  monthly_income_thb: '', class_rank_pct: '', disability_status: '',
  gender: '', birth_year: '', gpa: '', intended_level: '',
  intended_field: '', preferred_scholarship_types: [], language_pref: 'th',
  consent_research: false, guardian_consent: false,
};

// ─── Field explanation tooltip ────────────────────────────────────────────────

function WhyInfo({ th, en, lang }: { th: string; en: string; lang: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-[10px] w-4 h-4 rounded-full bg-[#E5E5EA] dark:bg-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] inline-flex items-center justify-center hover:bg-[#D1D1D6] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
        aria-label={lang === 'th' ? 'เหตุผลที่เราขอข้อมูลนี้' : 'Why we ask for this'}
        aria-expanded={open}
      >?</button>
      {open && (
        <div role="tooltip" className="absolute z-20 left-0 top-5 w-64 bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-lg p-3 text-xs text-[#6E6E73] dark:text-[#8E8E93] shadow-lg">
          {lang === 'th' ? th : en}
          <button type="button" onClick={() => setOpen(false)} aria-label={lang === 'th' ? 'ปิด' : 'Close'} className="absolute top-1 right-2 text-[#ADADB8]">✕</button>
        </div>
      )}
    </span>
  );
}

// ─── Completeness bar ─────────────────────────────────────────────────────────

function CompletenessBar({ pct, lang }: { pct: number; lang: string }) {
  return (
    <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-[#1D1D1F] dark:text-white">
          {lang === 'th' ? `โปรไฟล์สมบูรณ์ ${pct}%` : `Profile ${pct}% complete`}
        </p>
        <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">{pct}/100</span>
      </div>
      <div className="w-full h-2 rounded-full bg-[#F5F7FA] dark:bg-[#0D1F35] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-[#1B3A6B] transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-2">
        {lang === 'th'
          ? 'กรอกเพิ่มเพื่อรับการจับคู่ทุนที่แม่นยำขึ้น และช่วยงานวิจัยความเท่าเทียมทางการศึกษา'
          : 'Fill in more for better scholarship matching and to strengthen our educational-equity research.'}
      </p>
    </div>
  );
}

// ─── Field (a11y: label programmatically tied to its control via useId) ──────
// Must live at module scope — defining it inside the form component would
// give React a new function identity every render, forcing every input to
// unmount/remount (and lose focus) on each keystroke.

function Field({ lang, th: labelTh, en: labelEn, required, whyTh, whyEn, error: fieldError, children }: {
  lang: string; th: string; en: string; required?: boolean;
  whyTh?: string; whyEn?: string; error?: string | null;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[#1D1D1F] dark:text-white flex items-center gap-1">
        {lang === 'th' ? labelTh : labelEn}
        {required
          ? <span className="text-red-500" aria-hidden>*</span>
          : <span className="text-[10px] font-normal text-[#AEAEB2]">({lang === 'th' ? 'ไม่บังคับ' : 'optional'})</span>}
        {whyTh && whyEn && <WhyInfo th={whyTh} en={whyEn} lang={lang} />}
      </label>
      {children(id)}
      {fieldError && <p className="text-xs text-red-500" role="alert">{fieldError}</p>}
    </div>
  );
}

function Options({ options, lang }: { options: BilingualOption[]; lang: string }) {
  return (
    <>
      <option value="">{lang === 'th' ? '-- เลือก --' : '-- Select --'}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{lang === 'th' ? o.th : o.en}</option>
      ))}
    </>
  );
}

const inputCls = "w-full rounded-lg border border-[#E5E5EA] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]";
const errorInputCls = "w-full rounded-lg border border-red-400 bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400";
const selectCls = inputCls;

// ─── Form ─────────────────────────────────────────────────────────────────────
// Shared by /profile (embedded, expanded by default) and /profile/student
// (standalone deep link). Owns its own auth check + data fetch so either host
// can mount it without threading extra state through.

export default function StudentProfileForm() {
  const { lang } = useLang();
  const supabase = createClient();

  const [form,    setForm]    = useState<StudentProfileFormData>(BLANK);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  const birthYearNum = form.birth_year ? parseInt(form.birth_year, 10) : null;
  const minor = isMinor(birthYearNum);
  const age = birthYearNum !== null && !Number.isNaN(birthYearNum) ? computeAge(birthYearNum) : null;

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      setLoggedIn(true);
      const { data: profile } = await supabase
        .from('student_profile')
        .select('*')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (profile) {
        setForm({
          province:              profile.province             ?? '',
          area_type:             profile.area_type            ?? '',
          household_income_band: profile.household_income_band ?? '',
          welfare_card:          profile.welfare_card         ?? false,
          school_type:           profile.school_type          ?? '',
          school_province:       profile.school_province      ?? '',
          first_generation:      profile.first_generation     ?? null,
          parent_education:      profile.parent_education     ?? '',
          household_size:        profile.household_size?.toString()     ?? '',
          monthly_income_thb:    profile.monthly_income_thb?.toString() ?? '',
          class_rank_pct:        profile.class_rank_pct?.toString()     ?? '',
          disability_status:     profile.disability_status    ?? '',
          gender:                profile.gender               ?? '',
          birth_year:            profile.birth_year?.toString() ?? '',
          gpa:                   profile.gpa?.toString()        ?? '',
          intended_level:        profile.intended_level        ?? '',
          intended_field:        profile.intended_field        ?? '',
          preferred_scholarship_types: profile.preferred_scholarship_types ?? [],
          language_pref:         profile.language_pref         ?? 'th',
          consent_research:      profile.consent_research      ?? false,
          guardian_consent:      profile.guardian_consent      ?? false,
        });
      }
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof StudentProfileFormData>(k: K, v: StudentProfileFormData[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function toggleScholarshipType(value: string) {
    setForm(f => ({
      ...f,
      preferred_scholarship_types: f.preferred_scholarship_types.includes(value)
        ? f.preferred_scholarship_types.filter(v => v !== value)
        : [...f.preferred_scholarship_types, value],
    }));
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const gpaError            = validateGpa(form.gpa, lang);
  const birthYearError      = validateBirthYear(form.birth_year, lang);
  const incomeError         = validateMonthlyIncome(form.monthly_income_thb, lang);
  const rankError           = validateClassRankPct(form.class_rank_pct, lang);
  const householdSizeError  = validateHouseholdSize(form.household_size, lang);
  const hasValidationErrors = !!(gpaError || birthYearError || incomeError || rankError || householdSizeError);

  const completeness = useMemo(() => computeCompleteness(form), [form]);

  const derivedRegion = form.province ? deriveRegion(form.province) : null;

  async function submitForm(overrides: Partial<StudentProfileFormData> = {}) {
    const next = { ...form, ...overrides };
    if (minor && next.consent_research && !next.guardian_consent) {
      setError(lang === 'th'
        ? 'ต้องได้รับความยินยอมจากผู้ปกครองก่อนจึงจะเปิดใช้ความยินยอมงานวิจัยได้ (ผู้ที่อายุต่ำกว่า 18 ปี)'
        : 'Guardian consent is required before research consent can be enabled (users under 18).');
      return false;
    }
    setSaving(true);
    setError(null);

    const res = await fetch('/api/profile/student', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        ...next,
        birth_year:          next.birth_year          ? parseInt(next.birth_year, 10)   : null,
        gpa:                  next.gpa                 ? parseFloat(next.gpa)            : null,
        monthly_income_thb:   next.monthly_income_thb  ? Number(next.monthly_income_thb) : null,
        household_size:       next.household_size      ? Number(next.household_size)     : null,
        class_rank_pct:       next.class_rank_pct      ? Number(next.class_rank_pct)      : null,
      }),
    });

    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setError((resBody as { error?: string }).error ?? 'Unknown error');
      setSaving(false);
      return false;
    }

    setForm(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    setSaving(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) logFunnelEvent({ eventType: 'profile_updated', userId: user.id });
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasValidationErrors) return;
    await submitForm();
  }

  async function handleWithdrawConsent() {
    await submitForm({ consent_research: false });
  }

  async function handleDownloadData() {
    const res = await fetch('/api/profile/student');
    if (!res.ok) return;
    const body = await res.json();
    const blob = new Blob([JSON.stringify(body.profile ?? {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tundee-my-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Unauthenticated ────────────────────────────────────────────────────────

  if (!loading && !loggedIn) {
    return (
      <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[16px] p-10 text-center">
        <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-4">
          {lang === 'th' ? 'กรุณาเข้าสู่ระบบก่อน' : 'Please log in first.'}
        </p>
        <a href="/auth" className="inline-block px-5 py-2 rounded-full text-sm font-semibold text-white bg-[#1B3A6B]">
          {lang === 'th' ? 'เข้าสู่ระบบ' : 'Log in'}
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <CompletenessBar pct={completeness} lang={lang} />

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* ── Section: About you ────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-4">
            {lang === 'th' ? 'เกี่ยวกับคุณ' : 'About you'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field lang={lang}
              th="ปีเกิด" en="Birth year"
              whyTh="ใช้คำนวณอายุ เพื่อตรวจสอบว่าต้องขอความยินยอมจากผู้ปกครองก่อนหรือไม่"
              whyEn="Used to compute age and check whether guardian consent is required."
              error={birthYearError}
            >
              {id => (
                <input id={id} className={birthYearError ? errorInputCls : inputCls} type="number" min="1990" max="2015"
                  value={form.birth_year} onChange={e => set('birth_year', e.target.value)}
                  placeholder={lang === 'th' ? 'เช่น 2009' : 'e.g. 2009'} />
              )}
            </Field>
            <Field lang={lang}
              th="เพศ (ตามที่ระบุเอง)" en="Gender (self-described)"
              whyTh="ไม่บังคับ ใช้เพื่อวิเคราะห์ความเท่าเทียมตามเพศเท่านั้น"
              whyEn="Optional. Used only to analyse gender equity in scholarship access."
            >
              {id => (
                <input id={id} className={inputCls} value={form.gender} onChange={e => set('gender', e.target.value)}
                  placeholder={lang === 'th' ? 'กรอกหรือเว้นว่างได้' : 'Type or leave blank'} />
              )}
            </Field>
            <Field lang={lang} th="ภาษาที่ใช้งาน" en="Language preference">
              {id => (
                <select id={id} className={selectCls} value={form.language_pref} onChange={e => set('language_pref', e.target.value)}>
                  <Options lang={lang} options={LANGUAGE_PREFS} />
                </select>
              )}
            </Field>
            <Field lang={lang}
              th="ความพิการ / ความต้องการพิเศษ" en="Disability / accessibility needs"
              whyTh="ไม่บังคับ ใช้เพื่อศึกษาการเข้าถึงทุนของนักเรียนที่มีความพิการเท่านั้น"
              whyEn="Optional. Used only to study scholarship access for students with disabilities."
            >
              {id => (
                <input id={id} className={inputCls} value={form.disability_status} onChange={e => set('disability_status', e.target.value)}
                  placeholder={lang === 'th' ? 'กรอกหรือเว้นว่างได้' : 'Type or leave blank'} />
              )}
            </Field>
          </div>
          {age !== null && (
            <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-3">
              {lang === 'th' ? `อายุโดยประมาณ: ${age} ปี` : `Estimated age: ${age}`}
              {minor && (lang === 'th' ? ' · ต่ำกว่า 18 ปี (ต้องได้รับความยินยอมจากผู้ปกครองสำหรับความยินยอมงานวิจัย)' : ' · Under 18 (guardian consent required for research consent)')}
            </p>
          )}
        </section>

        {/* ── Section: Where you're from ────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-4">
            {lang === 'th' ? 'ที่อยู่อาศัย' : "Where you're from"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field lang={lang}
              th="จังหวัด" en="Province"
              whyTh="ใช้ศึกษาว่านักเรียนจากต่างจังหวัดมีโอกาสเข้าถึงทุนได้เท่ากันหรือไม่"
              whyEn="Used to study whether students from different provinces have equal access to scholarships."
            >
              {id => (
                <select id={id} className={selectCls} value={form.province} onChange={e => set('province', e.target.value)}>
                  <Options lang={lang} options={PROVINCES} />
                </select>
              )}
            </Field>
            <Field lang={lang}
              th="ลักษณะพื้นที่" en="Area type"
              whyTh="ใช้เปรียบเทียบนักเรียนในเมือง ชานเมือง และชนบท"
              whyEn="Used to compare urban, peri-urban, and rural students."
            >
              {id => (
                <select id={id} className={selectCls} value={form.area_type} onChange={e => set('area_type', e.target.value)}>
                  <Options lang={lang} options={AREA_TYPES} />
                </select>
              )}
            </Field>
          </div>
          {derivedRegion && (
            <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-3">
              {lang === 'th' ? 'ภูมิภาค (คำนวณอัตโนมัติ): ' : 'Region (auto-derived): '}
              <span className="font-medium text-[#1D1D1F] dark:text-white">{regionLabel(derivedRegion, lang)}</span>
            </p>
          )}
        </section>

        {/* ── Section: Family & finances ────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-4">
            {lang === 'th' ? 'ครอบครัวและฐานะเศรษฐกิจ' : 'Family & finances'}
          </h2>
          <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
            {lang === 'th'
              ? 'ข้อมูลนี้อ่อนไหวและไม่บังคับ จะไม่ถูกแชร์กับบุคคลที่สาม ใช้เพื่อวิเคราะห์ความเท่าเทียม (เมื่อคุณยินยอมงานวิจัย) และอาจช่วยจับคู่ทุนที่เหมาะกับคุณ'
              : 'This is sensitive and optional. It will not be shared with third parties. It is used for equity research (when you consent) and may also help match relevant scholarships for your own benefit.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field lang={lang}
              th="รายได้ครัวเรือนต่อปี" en="Annual household income"
              whyTh="ตัวแปรหลักในการวิเคราะห์ความเท่าเทียม"
              whyEn="The primary variable in our equity analysis."
            >
              {id => (
                <select id={id} className={selectCls} value={form.household_income_band} onChange={e => set('household_income_band', e.target.value)}>
                  <Options lang={lang} options={INCOME_BANDS} />
                </select>
              )}
            </Field>
            <Field lang={lang}
              th="รายได้ครัวเรือนต่อเดือน (บาท)" en="Monthly household income (THB)"
              whyTh="ใช้ควบคู่กับช่วงรายได้เพื่อความแม่นยำในการวิเคราะห์"
              whyEn="Used alongside the income band for more precise analysis."
              error={incomeError}
            >
              {id => (
                <input id={id} className={incomeError ? errorInputCls : inputCls} type="number" min="0" value={form.monthly_income_thb}
                  onChange={e => set('monthly_income_thb', e.target.value)} placeholder={lang === 'th' ? 'เช่น 15000' : 'e.g. 15000'} />
              )}
            </Field>
            <Field lang={lang} th="ขนาดครัวเรือน" en="Household size" error={householdSizeError}>
              {id => (
                <input id={id} className={householdSizeError ? errorInputCls : inputCls} type="number" min="1" max="30" value={form.household_size}
                  onChange={e => set('household_size', e.target.value)} placeholder={lang === 'th' ? 'จำนวนสมาชิก' : 'Number of members'} />
              )}
            </Field>
            <Field lang={lang}
              th="การศึกษาของผู้ปกครอง" en="Parent education"
              whyTh="ใช้ศึกษาความสัมพันธ์ระหว่างการศึกษาของผู้ปกครองและโอกาสรับทุน"
              whyEn="Used to study the relationship between parent education and scholarship access."
            >
              {id => (
                <select id={id} className={selectCls} value={form.parent_education} onChange={e => set('parent_education', e.target.value)}>
                  <Options lang={lang} options={PARENT_EDUCATION} />
                </select>
              )}
            </Field>
            <Field lang={lang}
              th="นักศึกษารุ่นแรกในครอบครัว" en="First-generation student"
              whyTh="ใช้ศึกษาผลกระทบของทุนต่อนักศึกษารุ่นแรกที่เรียนต่อระดับอุดมศึกษา"
              whyEn="Used to study the impact of scholarships on first-generation students."
            >
              {id => (
                <select id={id} className={selectCls} value={form.first_generation === null ? '' : String(form.first_generation)}
                  onChange={e => set('first_generation', e.target.value === '' ? null : e.target.value === 'true')}>
                  <option value="">{lang === 'th' ? '-- เลือก --' : '-- Select --'}</option>
                  <option value="true">{lang === 'th' ? 'ใช่ ฉันเป็นคนแรกในครอบครัวที่เรียนต่อ' : 'Yes — first in family to pursue tertiary education'}</option>
                  <option value="false">{lang === 'th' ? 'ไม่ใช่' : 'No'}</option>
                </select>
              )}
            </Field>
            <Field lang={lang}
              th="บัตรสวัสดิการแห่งรัฐ" en="Welfare card"
              whyTh="ทุนหลายประเภทกำหนดสิทธิ์ตามบัตรสวัสดิการแห่งรัฐ"
              whyEn="Many scholarships use welfare card status as an eligibility criterion."
            >
              {id => (
                <label htmlFor={id} className="flex items-center gap-2 mt-1 cursor-pointer">
                  <input id={id} type="checkbox" checked={form.welfare_card} onChange={e => set('welfare_card', e.target.checked)}
                    className="rounded focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                  <span className="text-sm text-[#1D1D1F] dark:text-white">
                    {lang === 'th' ? 'มีบัตรสวัสดิการแห่งรัฐ' : 'I have a government welfare card'}
                  </span>
                </label>
              )}
            </Field>
          </div>
        </section>

        {/* ── Section: Education ────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-4">
            {lang === 'th' ? 'การศึกษา' : 'Education'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field lang={lang}
              th="ประเภทสถานศึกษา" en="School type"
              whyTh="ศึกษาว่าประเภทโรงเรียนส่งผลต่อโอกาสรับทุนหรือไม่"
              whyEn="We study whether school type correlates with scholarship access."
            >
              {id => (
                <select id={id} className={selectCls} value={form.school_type} onChange={e => set('school_type', e.target.value)}>
                  <Options lang={lang} options={SCHOOL_TYPES} />
                </select>
              )}
            </Field>
            <Field lang={lang} th="จังหวัดที่ตั้งโรงเรียน" en="School province">
              {id => (
                <select id={id} className={selectCls} value={form.school_province} onChange={e => set('school_province', e.target.value)}>
                  <Options lang={lang} options={PROVINCES} />
                </select>
              )}
            </Field>
            <Field lang={lang}
              th="เกรดเฉลี่ย (GPAX)" en="GPA (GPAX)"
              whyTh="หลายทุนกำหนดเกรดขั้นต่ำ ใช้จับคู่ทุนที่คุณมีสิทธิ์สมัคร"
              whyEn="Many scholarships require a minimum GPA — used to match scholarships you're eligible for."
              error={gpaError}
            >
              {id => (
                <input id={id} className={gpaError ? errorInputCls : inputCls} type="number" step="0.01" min="0" max="4" value={form.gpa}
                  onChange={e => set('gpa', e.target.value)} placeholder="0.00 – 4.00" />
              )}
            </Field>
            <Field lang={lang} th="อันดับในชั้นเรียน (เปอร์เซ็นต์ไทล์)" en="Class rank (percentile)" error={rankError}>
              {id => (
                <input id={id} className={rankError ? errorInputCls : inputCls} type="number" min="0" max="100" step="0.1" value={form.class_rank_pct}
                  onChange={e => set('class_rank_pct', e.target.value)} placeholder={lang === 'th' ? 'เช่น 10 (ท็อป 10%)' : 'e.g. 10 (top 10%)'} />
              )}
            </Field>
            <Field lang={lang} th="ระดับที่ต้องการสมัคร" en="Intended level">
              {id => (
                <select id={id} className={selectCls} value={form.intended_level} onChange={e => set('intended_level', e.target.value)}>
                  <Options lang={lang} options={INTENDED_LEVELS} />
                </select>
              )}
            </Field>
            <Field lang={lang} th="สาขาที่สนใจ" en="Intended field of study">
              {id => (
                <select id={id} className={selectCls} value={form.intended_field} onChange={e => set('intended_field', e.target.value)}>
                  <Options lang={lang} options={INTENDED_FIELDS} />
                </select>
              )}
            </Field>
          </div>
        </section>

        {/* ── Section: Preferences ──────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-1">
            {lang === 'th' ? 'ความชอบ (ช่วยการจับคู่)' : 'Preferences (aids matching)'}
          </h2>
          <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-3">
            {lang === 'th' ? 'ไม่บังคับ เลือกได้มากกว่า 1 ประเภท' : 'Optional. Select any that apply.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {SCHOLARSHIP_TYPE_PREFS.map(opt => {
              const active = form.preferred_scholarship_types.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleScholarshipType(opt.value)}
                  aria-pressed={active}
                  className={`text-sm px-3 py-1.5 rounded-full border transition-all ${
                    active
                      ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] font-medium'
                      : 'border-[#E5E5EA] dark:border-[#1A2E4A] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#1B3A6B]/60'
                  }`}
                >
                  {lang === 'th' ? opt.th : opt.en}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Section: Research Consent ──────────────────────────────────── */}
        <section className="bg-[#F5F7FA] dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-5">
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-3">
            {lang === 'th' ? 'ความยินยอมการวิจัย' : 'Research Consent'}
          </h2>
          <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-4 leading-relaxed">
            {lang === 'th'
              ? 'ทีม TunDee ศึกษาว่าแพลตฟอร์มนี้ช่วยให้นักเรียนอย่างคุณค้นหาและได้รับทุนการศึกษาได้ดีขึ้นหรือไม่ ข้อมูลของคุณจะถูกแปลงเป็นรหัสไม่ระบุตัวตน (pseudonymised) ก่อนนำไปวิเคราะห์ — ชื่อ อีเมล และข้อมูลระบุตัวตนทั้งหมดจะถูกลบออก การให้ความยินยอมนี้เป็นความสมัครใจ ไม่มีผลต่อการใช้งานเว็บไซต์หรือการจับคู่ทุน และคุณสามารถถอนความยินยอมได้ทุกเมื่อ ฐานทางกฎหมาย: พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562 มาตรา 19'
              : 'The TunDee team studies whether this platform helps students like you find and win scholarships. Your data is pseudonymised (identifiers replaced with a hash) before analysis — your name, email, and all identifying fields are excluded. This is voluntary: it does not affect your ability to use the site or receive scholarship matches, and you can withdraw at any time. Legal basis: PDPA B.E. 2562 Section 19 (consent).'}
          </p>
          <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-4">
            {lang === 'th'
              ? 'หมายเหตุ: ข้อมูลอ่อนไหว (รายได้ เพศ ความพิการ) จะถูกใช้ในงานวิจัยเฉพาะเมื่อคุณยินยอมเท่านั้น แต่ยังคงถูกใช้เพื่อจับคู่ทุนเพื่อประโยชน์ของคุณเองได้แม้ไม่ยินยอมงานวิจัย'
              : 'Note: sensitive fields (income, gender, disability) are used for research only when you consent below. They may still be used to match scholarships for your own benefit either way.'}
          </p>

          {minor && (
            <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-300 mb-3">
                {lang === 'th'
                  ? 'เนื่องจากคุณมีอายุต่ำกว่า 18 ปี จำเป็นต้องได้รับความยินยอมจากผู้ปกครองก่อนจึงจะเปิดใช้ความยินยอมงานวิจัยได้'
                  : 'Because you are under 18, guardian consent is required before research consent can be turned on.'}
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={form.guardian_consent}
                  onChange={e => {
                    const checked = e.target.checked;
                    set('guardian_consent', checked);
                    if (!checked) set('consent_research', false);
                  }}
                  className="rounded mt-0.5 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                <span className="text-sm text-amber-800 dark:text-amber-300">
                  {lang === 'th'
                    ? 'ผู้ปกครองยินยอม — ผู้ปกครองของฉันได้อ่านและยินยอมให้ข้อมูลนี้ถูกใช้ในการวิจัย'
                    : 'My parent or guardian agrees — they have read and consented to this data being used for research.'}
                </span>
              </label>
            </div>
          )}

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.consent_research}
              disabled={minor && !form.guardian_consent}
              onChange={e => set('consent_research', e.target.checked)}
              className="rounded mt-0.5 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
            <span className={`text-sm ${minor && !form.guardian_consent ? 'text-[#AEAEB2]' : 'text-[#1D1D1F] dark:text-white'}`}>
              {lang === 'th'
                ? 'ฉันยินยอมให้ข้อมูลการใช้งานและโปรไฟล์นักเรียนของฉัน (ในรูปแบบไม่ระบุตัวตน) ถูกใช้เพื่อการวิจัยความเท่าเทียมทางการศึกษา'
                : 'I consent to my usage data and student profile (pseudonymised) being used for educational equity research.'}
            </span>
          </label>
          {form.consent_research && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-2">
              {lang === 'th' ? '✓ ขอบคุณสำหรับการมีส่วนร่วมในการวิจัย' : '✓ Thank you for contributing to the research.'}
            </p>
          )}
        </section>

        {/* ── Section: Data & privacy rights ─────────────────────────────── */}
        <section className="border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-5">
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-1">
            {lang === 'th' ? 'ข้อมูลของคุณและสิทธิความเป็นส่วนตัว' : 'Your data & privacy rights'}
          </h2>
          <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-4">
            {lang === 'th'
              ? 'คุณแก้ไขโปรไฟล์นี้ได้ทุกเมื่อ ดูสิทธิทั้งหมดของคุณได้ที่หน้านโยบายความเป็นส่วนตัว'
              : 'You can edit this profile any time. See all your rights on our Privacy Policy page.'}{' '}
            <a href="/privacy" className="text-[#1B3A6B] dark:text-[#4A7FD4] hover:underline">
              {lang === 'th' ? 'นโยบายความเป็นส่วนตัว →' : 'Privacy Policy →'}
            </a>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleDownloadData}
              className="text-sm px-4 py-2 rounded-lg border border-[#E5E5EA] dark:border-[#1A2E4A] text-[#1D1D1F] dark:text-white hover:border-[#1B3A6B] transition-colors">
              {lang === 'th' ? '⬇ ดาวน์โหลดข้อมูลของฉัน' : '⬇ Download my data'}
            </button>
            <a href="mailto:hello@tundee.org?subject=Data%20deletion%20request"
              className="text-sm px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
              {lang === 'th' ? '🗑 ขอให้ลบข้อมูล' : '🗑 Request deletion'}
            </a>
            {form.consent_research && (
              <button type="button" onClick={handleWithdrawConsent} disabled={saving}
                className="text-sm px-4 py-2 rounded-lg text-red-600 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50">
                {lang === 'th' ? 'ถอนความยินยอมงานวิจัย' : 'Withdraw research consent'}
              </button>
            )}
          </div>
        </section>

        {/* ── Error / Save (bottom of form, full width) ──────────────────── */}
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || hasValidationErrors}
          className="w-full py-3 rounded-[10px] text-sm font-semibold text-white bg-[#1B3A6B] hover:bg-[#2E5FA3] disabled:opacity-50 transition-colors"
        >
          {saving
            ? (lang === 'th' ? 'กำลังบันทึก...' : 'Saving...')
            : saved
            ? (lang === 'th' ? '✓ บันทึกแล้ว' : '✓ Saved')
            : (lang === 'th' ? 'บันทึกข้อมูล' : 'Save profile')}
        </button>
      </form>
    </div>
  );
}
