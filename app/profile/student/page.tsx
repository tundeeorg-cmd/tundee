'use client';

import { useState, useEffect } from 'react';
import { useLang } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentProfileForm {
  province: string;
  area_type: string;
  household_income_band: string;
  welfare_card: boolean;
  school_type: string;
  first_generation: boolean | null;
  gender: string;
  birth_year: string;
  gpa: string;
  intended_level: string;
  intended_field: string;
  language_pref: string;
  consent_research: boolean;
  guardian_consent: boolean;
}

const BLANK: StudentProfileForm = {
  province: '', area_type: '', household_income_band: '',
  welfare_card: false, school_type: '', first_generation: null,
  gender: '', birth_year: '', gpa: '', intended_level: '',
  intended_field: '', language_pref: 'th',
  consent_research: false, guardian_consent: false,
};

// ─── Labels ───────────────────────────────────────────────────────────────────

const INCOME_BANDS = [
  { value: 'band_1', th: 'น้อยกว่า ฿50,000 / ปี',         en: '< ฿50,000 / year' },
  { value: 'band_2', th: '฿50,000 – ฿100,000 / ปี',        en: '฿50k – ฿100k / year' },
  { value: 'band_3', th: '฿100,000 – ฿180,000 / ปี',       en: '฿100k – ฿180k / year' },
  { value: 'band_4', th: '฿180,000 – ฿300,000 / ปี',       en: '฿180k – ฿300k / year' },
  { value: 'band_5', th: '฿300,000 – ฿500,000 / ปี',       en: '฿300k – ฿500k / year' },
  { value: 'band_6', th: '฿500,000 – ฿1,000,000 / ปี',    en: '฿500k – ฿1m / year' },
  { value: 'band_7', th: 'มากกว่า ฿1,000,000 / ปี',       en: '> ฿1m / year' },
];

const SCHOOL_TYPES = [
  { value: 'government',   th: 'รัฐบาล',         en: 'Government' },
  { value: 'private',      th: 'เอกชน',          en: 'Private' },
  { value: 'international',th: 'นานาชาติ',        en: 'International' },
  { value: 'vocational',   th: 'อาชีวศึกษา',      en: 'Vocational' },
  { value: 'home_school',  th: 'เรียนที่บ้าน',    en: 'Home school' },
];

const LEVELS = [
  { value: 'high_school',           th: 'มัธยมศึกษา',          en: 'High school' },
  { value: 'vocational_certificate', th: 'ปวช./ปวส.',           en: 'Vocational certificate' },
  { value: 'associate_degree',      th: 'อนุปริญญา',           en: 'Associate degree' },
  { value: 'bachelor',              th: 'ปริญญาตรี',           en: 'Bachelor\'s' },
  { value: 'master',                th: 'ปริญญาโท',            en: 'Master\'s' },
  { value: 'phd',                   th: 'ปริญญาเอก',           en: 'PhD' },
];

// ─── Field explanation tooltip ────────────────────────────────────────────────

function WhyInfo({ th, en, lang }: { th: string; en: string; lang: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-[10px] w-4 h-4 rounded-full bg-[#E5E5EA] dark:bg-[#232B3E] text-[#6E6E73] dark:text-[#8E8E93] inline-flex items-center justify-center hover:bg-[#D1D1D6] transition-colors"
        aria-label="Why we collect this"
      >?</button>
      {open && (
        <div className="absolute z-20 left-0 top-5 w-64 bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-lg p-3 text-xs text-[#6E6E73] dark:text-[#8E8E93] shadow-lg">
          {lang === 'th' ? th : en}
          <button type="button" onClick={() => setOpen(false)} className="absolute top-1 right-2 text-[#ADADB8]">✕</button>
        </div>
      )}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentProfilePage() {
  const { lang } = useLang();
  const router   = useRouter();
  const supabase = createClient();

  const [form,    setForm]    = useState<StudentProfileForm>(BLANK);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  const currentYear = new Date().getFullYear();
  const birthYear = parseInt(form.birth_year, 10);
  const isMinor = !isNaN(birthYear) && (currentYear - birthYear) < 18;

  const font = lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';

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
          first_generation:      profile.first_generation     ?? null,
          gender:                profile.gender               ?? '',
          birth_year:            profile.birth_year?.toString() ?? '',
          gpa:                   profile.gpa?.toString()        ?? '',
          intended_level:        profile.intended_level        ?? '',
          intended_field:        profile.intended_field        ?? '',
          language_pref:         profile.language_pref         ?? 'th',
          consent_research:      profile.consent_research      ?? false,
          guardian_consent:      profile.guardian_consent      ?? false,
        });
      }
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof StudentProfileForm>(k: K, v: StudentProfileForm[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isMinor && !form.guardian_consent) {
      setError(lang === 'th'
        ? 'ผู้ปกครองต้องยินยอมก่อนสำหรับผู้ที่อายุต่ำกว่า 18 ปี'
        : 'Guardian consent required for users under 18.');
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch('/api/profile/student', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        ...form,
        birth_year: form.birth_year ? parseInt(form.birth_year, 10) : null,
        gpa:        form.gpa        ? parseFloat(form.gpa)          : null,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? 'Unknown error');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  // ── Unauthenticated ────────────────────────────────────────────────────────

  if (!loading && !loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] dark:bg-[#07111F] px-4" style={{ fontFamily: font }}>
        <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[16px] p-10 max-w-sm text-center">
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-4">
            {lang === 'th' ? 'กรุณาเข้าสู่ระบบก่อน' : 'Please log in first.'}
          </p>
          <a href="/auth" className="inline-block px-5 py-2 rounded-full text-sm font-semibold text-white bg-[#1B3A6B]">
            {lang === 'th' ? 'เข้าสู่ระบบ' : 'Log in'}
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#07111F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Field component ────────────────────────────────────────────────────────

  function Field({ label, th: labelTh, en: labelEn, required, whyTh, whyEn, children }: {
    label?: string; th: string; en: string; required?: boolean;
    whyTh?: string; whyEn?: string; children: React.ReactNode;
  }) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[#1D1D1F] dark:text-white flex items-center gap-1">
          {lang === 'th' ? labelTh : (labelEn ?? label ?? labelTh)}
          {required && <span className="text-red-500">*</span>}
          {whyTh && whyEn && <WhyInfo th={whyTh} en={whyEn} lang={lang} />}
        </label>
        {children}
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border border-[#E5E5EA] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] text-[#1D1D1F] dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]";
  const selectCls = inputCls;

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#07111F] pb-16" style={{ fontFamily: font }}>
      {/* Header */}
      <div className="bg-white dark:bg-[#0A1628] border-b border-[#E5E5EA] dark:border-[#1A2E4A]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <button onClick={() => router.back()} className="text-xs text-[#6E6E73] hover:text-[#1D1D1F] mb-4 block">
            ← {lang === 'th' ? 'กลับ' : 'Back'}
          </button>
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-white">
            {lang === 'th' ? 'ข้อมูลนักเรียน (สำหรับวิจัย)' : 'Student Research Profile'}
          </h1>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mt-2">
            {lang === 'th'
              ? 'ข้อมูลนี้ใช้ในการวิจัยความเท่าเทียมในการเข้าถึงทุนการศึกษา ทุกช่องเป็นตัวเลือก ยกเว้นที่ระบุว่าจำเป็น'
              : 'This data is used for research on equitable scholarship access. All fields are optional unless marked required.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Section: Location ─────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-4">
            {lang === 'th' ? 'ที่อยู่อาศัย' : 'Location'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              th="จังหวัด" en="Province"
              whyTh="ใช้เพื่อศึกษาว่านักเรียนจากต่างจังหวัดมีโอกาสเข้าถึงทุนได้เท่ากันหรือไม่"
              whyEn="Used to study whether students from different provinces have equal access to scholarships."
            >
              <input className={inputCls} value={form.province} onChange={e => set('province', e.target.value)}
                placeholder={lang === 'th' ? 'เช่น เชียงใหม่' : 'e.g. Chiang Mai'} />
            </Field>
            <Field
              th="พื้นที่" en="Area type"
              whyTh="ใช้เปรียบเทียบนักเรียนในเมืองและชนบท"
              whyEn="Used to compare urban vs. rural students."
            >
              <select className={selectCls} value={form.area_type} onChange={e => set('area_type', e.target.value)}>
                <option value="">{lang === 'th' ? '-- เลือก --' : '-- Select --'}</option>
                <option value="urban">{lang === 'th' ? 'เมือง / ในเขตเทศบาล' : 'Urban / municipal'}</option>
                <option value="rural">{lang === 'th' ? 'ชนบท / นอกเขตเทศบาล' : 'Rural / outside municipal'}</option>
              </select>
            </Field>
          </div>
        </section>

        {/* ── Section: Economic Background ──────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-4">
            {lang === 'th' ? 'ฐานะเศรษฐกิจครัวเรือน' : 'Household Economic Background'}
          </h2>
          <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
            {lang === 'th'
              ? 'ข้อมูลนี้มีความอ่อนไหวสูง จะไม่ถูกแชร์กับบุคคลที่สาม และใช้เพื่อวิเคราะห์ว่านักเรียนรายได้น้อยได้รับการแนะนำทุนที่เหมาะสมหรือไม่'
              : 'This is sensitive data. It will not be shared with third parties. It is used to analyse whether low-income students receive fair scholarship recommendations.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              th="รายได้ครัวเรือนต่อปี" en="Annual household income"
              whyTh="ตัวแปรหลักในการวิเคราะห์ความเท่าเทียม"
              whyEn="The primary variable in our equity analysis."
            >
              <select className={selectCls} value={form.household_income_band} onChange={e => set('household_income_band', e.target.value)}>
                <option value="">{lang === 'th' ? '-- เลือก --' : '-- Select --'}</option>
                {INCOME_BANDS.map(b => (
                  <option key={b.value} value={b.value}>{lang === 'th' ? b.th : b.en}</option>
                ))}
              </select>
            </Field>
            <Field
              th="บัตรสวัสดิการแห่งรัฐ" en="Welfare card"
              whyTh="ทุนหลายประเภทกำหนดสิทธิ์ตามบัตรสวัสดิการ"
              whyEn="Many scholarships use welfare card status as an eligibility criterion."
            >
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input type="checkbox" checked={form.welfare_card} onChange={e => set('welfare_card', e.target.checked)} className="rounded" />
                <span className="text-sm text-[#1D1D1F] dark:text-white">
                  {lang === 'th' ? 'มีบัตรสวัสดิการแห่งรัฐ' : 'I have a government welfare card'}
                </span>
              </label>
            </Field>
          </div>
        </section>

        {/* ── Section: Education ────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-4">
            {lang === 'th' ? 'การศึกษา' : 'Education'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              th="ประเภทสถานศึกษา" en="School type"
              whyTh="ศึกษาว่าประเภทโรงเรียนส่งผลต่อโอกาสรับทุนหรือไม่"
              whyEn="We study whether school type correlates with scholarship access."
            >
              <select className={selectCls} value={form.school_type} onChange={e => set('school_type', e.target.value)}>
                <option value="">{lang === 'th' ? '-- เลือก --' : '-- Select --'}</option>
                {SCHOOL_TYPES.map(s => (
                  <option key={s.value} value={s.value}>{lang === 'th' ? s.th : s.en}</option>
                ))}
              </select>
            </Field>
            <Field
              th="เกรดเฉลี่ย (GPA)" en="GPA"
              whyTh="หลายทุนกำหนดเกรดขั้นต่ำ"
              whyEn="Many scholarships require a minimum GPA."
            >
              <input className={inputCls} type="number" step="0.01" min="0" max="4" value={form.gpa}
                onChange={e => set('gpa', e.target.value)}
                placeholder="0.00 – 4.00" />
            </Field>
            <Field
              th="นักศึกษารุ่นแรกในครอบครัว" en="First-generation student"
              whyTh="ใช้ศึกษาผลกระทบของทุนต่อนักศึกษารุ่นแรก"
              whyEn="Used to study the impact of scholarships on first-generation students."
            >
              <select className={selectCls} value={form.first_generation === null ? '' : String(form.first_generation)}
                onChange={e => set('first_generation', e.target.value === '' ? null : e.target.value === 'true')}>
                <option value="">{lang === 'th' ? '-- เลือก --' : '-- Select --'}</option>
                <option value="true">{lang === 'th' ? 'ใช่ ฉันเป็นคนแรกในครอบครัวที่เรียนต่อ ม.ปลาย/มหาวิทยาลัย' : 'Yes — first in family to pursue tertiary education'}</option>
                <option value="false">{lang === 'th' ? 'ไม่ใช่' : 'No'}</option>
              </select>
            </Field>
            <Field th="ระดับที่ต้องการสมัคร" en="Intended level">
              <select className={selectCls} value={form.intended_level} onChange={e => set('intended_level', e.target.value)}>
                <option value="">{lang === 'th' ? '-- เลือก --' : '-- Select --'}</option>
                {LEVELS.map(l => (
                  <option key={l.value} value={l.value}>{lang === 'th' ? l.th : l.en}</option>
                ))}
              </select>
            </Field>
            <Field th="สาขาที่สนใจ" en="Intended field of study">
              <input className={inputCls} value={form.intended_field}
                onChange={e => set('intended_field', e.target.value)}
                placeholder={lang === 'th' ? 'เช่น วิศวกรรมศาสตร์, พยาบาล' : 'e.g. Engineering, Nursing'} />
            </Field>
          </div>
        </section>

        {/* ── Section: Personal (optional, self-described) ───────────────── */}
        <section>
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-4">
            {lang === 'th' ? 'ข้อมูลส่วนตัว (ไม่บังคับ)' : 'Personal Info (optional)'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              th="เพศ (ตามที่ระบุเอง)" en="Gender (self-described)"
              whyTh="ไม่บังคับ ใช้เพื่อวิเคราะห์ความเท่าเทียมตามเพศ"
              whyEn="Optional. Used to analyse gender equity in scholarship access."
            >
              <input className={inputCls} value={form.gender} onChange={e => set('gender', e.target.value)}
                placeholder={lang === 'th' ? 'กรอกหรือเว้นว่างได้' : 'Type or leave blank'} />
            </Field>
            <Field
              th="ปีเกิด" en="Birth year"
              whyTh="ใช้ตรวจสอบว่าต้องการความยินยอมจากผู้ปกครองหรือไม่"
              whyEn="Used to check whether guardian consent is required."
            >
              <input className={inputCls} type="number" min="1990" max={currentYear}
                value={form.birth_year} onChange={e => set('birth_year', e.target.value)}
                placeholder="เช่น 2009" />
            </Field>
          </div>

          {isMinor && (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-300 mb-3">
                {lang === 'th'
                  ? 'เนื่องจากคุณมีอายุต่ำกว่า 18 ปี จำเป็นต้องได้รับความยินยอมจากผู้ปกครองก่อนที่จะใช้ข้อมูลนี้ในการวิจัย'
                  : 'Because you are under 18, guardian consent is required before your data can be used for research.'}
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={form.guardian_consent}
                  onChange={e => set('guardian_consent', e.target.checked)} className="rounded mt-0.5" />
                <span className="text-sm text-amber-800 dark:text-amber-300">
                  {lang === 'th'
                    ? 'ผู้ปกครองของฉันได้อ่านและยินยอมให้ข้อมูลนี้ถูกใช้ในการวิจัย'
                    : 'My parent/guardian has read and consented to this data being used for research.'}
                </span>
              </label>
            </div>
          )}
        </section>

        {/* ── Section: Research Consent ──────────────────────────────────── */}
        <section className="bg-[#F5F7FA] dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-5">
          <h2 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-3">
            {lang === 'th' ? 'ความยินยอมการวิจัย' : 'Research Consent'}
          </h2>
          <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-4 leading-relaxed">
            {lang === 'th'
              ? 'ทีม TunDee วิจัยด้านความเท่าเทียมในการเข้าถึงทุนการศึกษาในประเทศไทย ข้อมูลของคุณจะถูกแปลงเป็นรหัสไม่ระบุตัวตน (pseudonymised) ก่อนนำไปวิเคราะห์ ชื่อ อีเมล และข้อมูลระบุตัวตนทั้งหมดจะถูกลบออก คุณสามารถถอนความยินยอมได้ตลอดเวลา ฐานทางกฎหมาย: พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562 มาตรา 19'
              : 'The TunDee team researches equitable access to scholarships in Thailand. Your data will be pseudonymised (user ID replaced with a hash) before analysis. Your name, email, and all identifying fields are excluded. You may withdraw consent at any time. Legal basis: PDPA 2562 Section 19 (consent).'}
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.consent_research}
              onChange={e => set('consent_research', e.target.checked)} className="rounded mt-0.5" />
            <span className="text-sm text-[#1D1D1F] dark:text-white">
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

        {/* ── Error / Save ──────────────────────────────────────────────── */}
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 rounded-[10px] text-sm font-semibold text-white bg-[#1B3A6B] hover:bg-[#2E5FA3] disabled:opacity-50 transition-colors"
          >
            {saving
              ? (lang === 'th' ? 'กำลังบันทึก...' : 'Saving...')
              : saved
              ? (lang === 'th' ? '✓ บันทึกแล้ว' : '✓ Saved')
              : (lang === 'th' ? 'บันทึกข้อมูล' : 'Save profile')}
          </button>
          {form.consent_research && (
            <button
              type="button"
              onClick={() => { set('consent_research', false); handleSubmit({ preventDefault: () => {} } as React.FormEvent); }}
              className="px-4 py-3 rounded-[10px] text-sm text-red-600 border border-red-200 dark:border-red-800 hover:bg-red-50 transition-colors"
            >
              {lang === 'th' ? 'ถอนความยินยอม' : 'Withdraw consent'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
