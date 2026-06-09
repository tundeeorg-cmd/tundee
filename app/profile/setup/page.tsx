'use client';

/**
 * /profile/setup Duolingo-style 8-step onboarding wizard.
 * Redirected here from /auth/callback when profile is incomplete.
 *
 * Steps:
 *   0  Name
 *   1  Prior scholarship knowledge (research)
 *   2  Grade level
 *   3  GPA
 *   4  Province
 *   5  Income & welfare card
 *   6  Fields of interest
 *   7  Recruitment source (research) + save
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import { PROVINCES_TH, FIELDS_OF_STUDY } from '@/lib/translations';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 8;

const GRADE_OPTIONS = [
  { value: 'M1-M3',     th: 'ม.1–3',        en: 'Grade 7–9' },
  { value: 'M4-M6',     th: 'ม.4–6',        en: 'Grade 10–12' },
  { value: 'vocational', th: 'ปวช./ปวส.',   en: 'Vocational' },
  { value: 'uni',        th: 'ปริญญาตรี',   en: 'Undergraduate' },
  { value: 'graduate',   th: 'บัณฑิตศึกษา', en: 'Graduate' },
];

const INCOME_OPTIONS = [
  { value: 1, th: 'ต่ำกว่า 5,000 บาท/เดือน',   en: 'Under ฿5,000/month' },
  { value: 2, th: '5,000 – 10,000 บาท/เดือน',  en: '฿5,000 – ฿10,000/month' },
  { value: 3, th: '10,000 – 15,000 บาท/เดือน', en: '฿10,000 – ฿15,000/month' },
  { value: 4, th: '15,000 – 20,000 บาท/เดือน', en: '฿15,000 – ฿20,000/month' },
  { value: 5, th: '20,000 – 30,000 บาท/เดือน', en: '฿20,000 – ฿30,000/month' },
  { value: 6, th: '30,000 – 50,000 บาท/เดือน', en: '฿30,000 – ฿50,000/month' },
  { value: 7, th: 'มากกว่า 50,000 บาท/เดือน',  en: 'Over ฿50,000/month' },
];

// Prior knowledge: display label → stored numeric value
const PRIOR_KNOWLEDGE_OPTIONS = [
  { label: '0',    th: 'ไม่รู้เลย',       en: 'None',       value: 0  },
  { label: '1–3',  th: 'รู้บ้าง 1–3 ทุน', en: '1–3 known',  value: 2  },
  { label: '4–10', th: 'รู้ 4–10 ทุน',    en: '4–10 known', value: 6  },
  { label: '10+',  th: 'รู้มากกว่า 10',   en: '10+ known',  value: 15 },
];

const RECRUITMENT_SOURCE_OPTIONS = [
  { value: 'school_teacher', th: 'ครู/อาจารย์แนะนำ',   en: 'Teacher / advisor' },
  { value: 'friend_referral', th: 'เพื่อนบอกต่อ',      en: 'Friend referral' },
  { value: 'google_search',  th: 'ค้นหาจาก Google',    en: 'Google search' },
  { value: 'social_media',   th: 'โซเชียลมีเดีย',       en: 'Social media' },
];

// ─── Helper: determine signup cohort from Thai province name or TH-XX code ───

function determineSignupCohort(provinceId: string): string {
  const v = provinceId.trim();

  // Bangkok
  if (v === 'TH-10' || v === 'กรุงเทพมหานคร') return 'wave_1_bangkok';

  // TH-XX codes — Northeast: 30–49, North: 50–58
  const codeMatch = v.match(/^TH-(\d+)$/);
  if (codeMatch) {
    const n = parseInt(codeMatch[1], 10);
    if (n >= 30 && n <= 49) return 'wave_2_northeast';
    if (n >= 50 && n <= 58) return 'wave_2_north';
    return 'wave_3_national';
  }

  // Thai province names — Northeast (อีสาน)
  const northeast = [
    'นครราชสีมา','ขอนแก่น','อุดรธานี','อุบลราชธานี','นครพนม','บึงกาฬ',
    'หนองคาย','หนองบัวลำภู','เลย','ชัยภูมิ','กาฬสินธุ์','มหาสารคาม',
    'ร้อยเอ็ด','ยโสธร','ศรีสะเกษ','อำนาจเจริญ','มุกดาหาร','สุรินทร์',
    'บุรีรัมย์','สกลนคร',
  ];
  if (northeast.includes(v)) return 'wave_2_northeast';

  // Thai province names — North
  const north = [
    'เชียงใหม่','เชียงราย','แม่ฮ่องสอน','ลำปาง','ลำพูน','พะเยา',
    'แพร่','น่าน','พิษณุโลก','สุโขทัย','ตาก','อุตรดิตถ์',
    'กำแพงเพชร','พิจิตร','เพชรบูรณ์','นครสวรรค์','อุทัยธานี',
  ];
  if (north.includes(v)) return 'wave_2_north';

  return 'wave_3_national';
}

// ─── Sub-components (defined OUTSIDE page to prevent remount on re-render) ────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step + 1) / total) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-[#aeaeb2] mb-2">
        <span>{step + 1} / {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-[#E5E5EA] dark:bg-[#3a3a3c] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#2E6BE6] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />;
}

interface WizardContainerProps {
  children: React.ReactNode;
  step: number;
  total: number;
  lang: string;
  error?: string;
  onBack?: () => void;
}
function WizardContainer({ children, step, total, lang, error, onBack }: WizardContainerProps) {
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Back + progress */}
        <div className="mb-6">
          {step > 0 && onBack && (
            <button
              onClick={onBack}
              className="text-sm text-[#6e6e73] dark:text-[#8e8e93] hover:text-[#1D1D1F] dark:hover:text-white mb-4 flex items-center gap-1 transition-colors"
            >
              ← {lang === 'th' ? 'ย้อนกลับ' : 'Back'}
            </button>
          )}
          <ProgressBar step={step} total={total} />
        </div>

        <div className="bg-white dark:bg-[#1D1D1F] rounded-2xl shadow-sm border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden">
          <div className="h-1 bg-[#2E6BE6]" />
          <div className="px-7 py-8">
            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-0.5">
                  {lang === 'th' ? 'บันทึกไม่สำเร็จ' : 'Could not save profile'}
                </p>
                <p className="text-xs font-mono text-red-500 dark:text-red-400 break-all">{error}</p>
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfileSetupPage() {
  const { lang } = useLang();
  const router   = useRouter();
  const supabase = createClient();

  const [step,          setStep]          = useState(0);
  const [authLoading,   setAuthLoading]   = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [provinceQuery, setProvinceQuery] = useState('');

  // Form values
  const [displayName,       setDisplayName]       = useState('');
  const [gradeLevel,        setGradeLevel]        = useState('');
  const [gpa,               setGpa]               = useState('');
  const [province,          setProvince]          = useState('');
  const [incomeBracket,     setIncomeBracket]     = useState(4);
  const [welfareCard,       setWelfareCard]       = useState(false);
  const [selectedFields,    setSelectedFields]    = useState<string[]>([]);
  // Research fields
  const [priorKnowledge,    setPriorKnowledge]    = useState<number | null>(null);
  const [recruitmentSource, setRecruitmentSource] = useState('');

  // Auth guard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/auth');
      } else {
        setAuthLoading(false);
        const name =
          data.session.user.user_metadata?.full_name ??
          data.session.user.user_metadata?.name ?? '';
        if (name) setDisplayName(name);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleField(value: string) {
    setSelectedFields((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]
    );
  }

  function nextStep() {
    setError('');
    // GPA is now step 3
    if (step === 3 && gpa) {
      const n = parseFloat(gpa);
      if (isNaN(n) || n < 0 || n > 4) {
        setError(lang === 'th' ? 'GPA ต้องอยู่ระหว่าง 0.00 – 4.00' : 'GPA must be between 0.00 and 4.00');
        return;
      }
    }
    setStep((s) => s + 1);
  }

  function prevStep() {
    setError('');
    setStep((s) => s - 1);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        console.error('[TunDee] getUser failed:', authError?.message);
        router.replace('/auth');
        return;
      }

      const gpaNum = gpa ? parseFloat(gpa) : null;

      const payload = {
        id:                          user.id,
        display_name:                displayName.trim() || null,
        grade_level:                 gradeLevel || null,
        province_id:                 province || null,
        gpa:                         gpaNum,
        income_bracket:              incomeBracket,
        welfare_card:                welfareCard,
        fields_of_interest:          selectedFields.length > 0 ? selectedFields : ['any'],
        // Research fields
        prior_scholarship_knowledge: priorKnowledge !== null ? priorKnowledge : null,
        recruitment_source:          recruitmentSource || 'unknown',
        signup_cohort:               province ? determineSignupCohort(province) : 'wave_3_national',
        updated_at:                  new Date().toISOString(),
      };

      console.log('[TunDee Setup] upserting profile for', user.id);

      const { error: upsertErr } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' });

      if (upsertErr) {
        console.error('[TunDee Setup] upsert error:', upsertErr.code, upsertErr.message, upsertErr.details);

        const { id: _id, ...updateFields } = payload;
        const { error: updateErr } = await supabase
          .from('profiles')
          .update(updateFields)
          .eq('id', user.id);

        if (updateErr) {
          console.error('[TunDee Setup] update error:', updateErr.code, updateErr.message, updateErr.details);
          setError(`[${updateErr.code}] ${updateErr.message}`);
          setSaving(false);
          return;
        }

        console.log('[TunDee Setup] saved via update fallback');
      } else {
        console.log('[TunDee Setup] saved via upsert');
      }

      router.replace('/scholarships');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[TunDee Setup] exception:', e);
      setError(msg);
      setSaving(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2E6BE6]/30 border-t-[#2E6BE6] rounded-full animate-spin" />
      </div>
    );
  }

  const filteredProvinces = PROVINCES_TH.filter((p) =>
    p.toLowerCase().includes(provinceQuery.toLowerCase())
  );

  const fontTh = 'Sarabun, sans-serif';
  const fontEn = 'Inter, system-ui, sans-serif';
  const font   = lang === 'th' ? fontTh : fontEn;

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 0 Name
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 0) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onBack={prevStep}>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">👋</div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'คุณชื่ออะไร?' : "What's your name?"}
          </h1>
          <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={{ fontFamily: font }}>
            {lang === 'th' ? 'ชื่อที่ใช้แสดงในโปรไฟล์' : 'This will appear on your profile'}
          </p>
        </div>

        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={lang === 'th' ? 'ชื่อของคุณ' : 'Your name'}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="w-full text-center text-2xl font-light border-0 border-b-2 border-[#e0e0e0] dark:border-[#3a3a3c] focus:border-[#2E6BE6] focus:outline-none bg-transparent text-[#1D1D1F] dark:text-[#F5F5F7] placeholder-[#aeaeb2] py-3 mb-8 transition-colors"
          style={{ fontFamily: font }}
          onKeyDown={(e) => { if (e.key === 'Enter') nextStep(); }}
        />

        <button
          onClick={nextStep}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors"
          style={{ fontFamily: font }}
        >
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
        <p className="text-center mt-3">
          <button
            onClick={nextStep}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 Prior scholarship knowledge (research)
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 1) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th'
              ? 'ก่อนใช้ทุนดี คุณรู้จักทุนการศึกษากี่ทุน?'
              : 'Before TunDee, how many scholarships did you know?'}
          </h1>
          <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-1" style={{ fontFamily: font }}>
            {lang === 'th'
              ? 'ข้อมูลนี้ใช้เพื่องานวิจัยเท่านั้น ไม่กระทบการจับคู่ทุน'
              : 'For research purposes only — does not affect matching'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {PRIOR_KNOWLEDGE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => { setPriorKnowledge(opt.value); nextStep(); }}
              className={`flex flex-col items-center justify-center px-4 py-5 rounded-xl border-2 transition-all ${
                priorKnowledge === opt.value
                  ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] hover:border-[#2E6BE6]/50'
              }`}
            >
              <span className="text-2xl font-bold text-[#2E6BE6] mb-1">{opt.label}</span>
              <span className="text-xs text-[#6e6e73] dark:text-[#aeaeb2] text-center" style={{ fontFamily: font }}>
                {lang === 'th' ? opt.th : opt.en}
              </span>
            </button>
          ))}
        </div>

        <p className="text-center">
          <button
            onClick={nextStep}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 Grade level
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 2) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🎓</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'คุณกำลังเรียนอยู่ชั้นไหน?' : 'What grade are you in?'}
          </h1>
        </div>

        <div className="space-y-2 mb-6">
          {GRADE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setGradeLevel(opt.value); setStep(3); }}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all ${
                gradeLevel === opt.value
                  ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] hover:border-[#2E6BE6]/50 bg-white dark:bg-[#2c2c2e]'
              }`}
            >
              <span
                className="flex-1 font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]"
                style={{ fontFamily: font }}
              >
                {lang === 'th' ? opt.th : opt.en}
              </span>
              {gradeLevel === opt.value && <span className="text-[#2E6BE6] font-bold">✓</span>}
            </button>
          ))}
        </div>

        <p className="text-center">
          <button
            onClick={() => setStep(3)}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 GPA
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 3) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onBack={prevStep}>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">📊</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'เกรดเฉลี่ยของคุณคือเท่าไหร่?' : 'What is your GPA?'}
          </h1>
          <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={{ fontFamily: font }}>
            {lang === 'th' ? 'ใช้สำหรับกรองทุนที่มีเงื่อนไขเกรด' : 'Used to match scholarships with GPA requirements'}
          </p>
        </div>

        <div className="text-center mb-8">
          <input
            type="number"
            min="0"
            max="4"
            step="0.01"
            value={gpa}
            onChange={(e) => setGpa(e.target.value)}
            placeholder="3.50"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            inputMode="decimal"
            className="text-center text-4xl font-light w-40 border-0 border-b-2 border-[#e0e0e0] dark:border-[#3a3a3c] focus:border-[#2E6BE6] focus:outline-none bg-transparent text-[#1D1D1F] dark:text-[#F5F5F7] placeholder-[#aeaeb2] py-2 transition-colors"
            onKeyDown={(e) => { if (e.key === 'Enter') nextStep(); }}
          />
          <p className="text-xs text-[#aeaeb2] mt-2">0.00 – 4.00</p>
        </div>

        <button
          onClick={nextStep}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors mb-3"
          style={{ fontFamily: font }}
        >
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
        <p className="text-center">
          <button
            onClick={() => { setGpa(''); nextStep(); }}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ยังไม่รู้ / ข้ามก่อน' : 'Not sure yet / Skip'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4 Province
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 4) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">📍</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'คุณอยู่จังหวัดไหน?' : 'Which province are you from?'}
          </h1>
        </div>

        <div className="relative mb-3">
          <input
            type="text"
            value={provinceQuery}
            onChange={(e) => setProvinceQuery(e.target.value)}
            placeholder={lang === 'th' ? 'ค้นหาจังหวัด...' : 'Search province...'}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="w-full px-4 py-3 text-base border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl bg-white dark:bg-[#2c2c2e] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:border-[#2E6BE6] focus:ring-2 focus:ring-[#2E6BE6]/20 placeholder-[#aeaeb2]"
            style={{ fontFamily: fontTh }}
          />
        </div>

        <div className="max-h-52 overflow-y-auto border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl mb-4 divide-y divide-[#f0f0f0] dark:divide-[#3a3a3c]">
          {filteredProvinces.slice(0, 20).map((pv) => (
            <button
              key={pv}
              onClick={() => { setProvince(pv); setStep(5); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                province === pv
                  ? 'bg-[#EFF4FF] dark:bg-[#162552] text-[#2E6BE6] font-semibold'
                  : 'bg-white dark:bg-[#2c2c2e] text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F7F9FC] dark:hover:bg-[#3a3a3c]'
              }`}
              style={{ fontFamily: fontTh }}
            >
              {pv}
              {province === pv && <span className="float-right text-[#2E6BE6]">✓</span>}
            </button>
          ))}
          {filteredProvinces.length === 0 && (
            <p className="text-center text-sm text-[#aeaeb2] py-4" style={{ fontFamily: font }}>
              {lang === 'th' ? 'ไม่พบจังหวัด' : 'Province not found'}
            </p>
          )}
        </div>

        <p className="text-center">
          <button
            onClick={() => setStep(5)}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5 Income & welfare card
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 5) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">💰</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1" style={{ fontFamily: font }}>
            {lang === 'th' ? 'รายได้ครัวเรือนต่อเดือน' : 'Monthly household income'}
          </h1>
          <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93]" style={{ fontFamily: font }}>
            {lang === 'th' ? 'ใช้กรองทุนที่มีเงื่อนไขรายได้' : 'Used to match income-restricted scholarships'}
          </p>
        </div>

        <div className="space-y-1.5 mb-5">
          {INCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setIncomeBracket(opt.value)}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                incomeBracket === opt.value
                  ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552] font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] text-[#6e6e73] dark:text-[#aeaeb2] hover:border-[#2E6BE6]/50'
              }`}
              style={{ fontFamily: font }}
            >
              {lang === 'th' ? opt.th : opt.en}
            </button>
          ))}
        </div>

        {/* Welfare card toggle */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-[#F7F9FC] dark:bg-[#2c2c2e] rounded-xl border border-[#e0e0e0] dark:border-[#3a3a3c] mb-6">
          <div>
            <p className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]" style={{ fontFamily: font }}>
              {lang === 'th' ? 'บัตรสวัสดิการแห่งรัฐ' : 'State Welfare Card'}
            </p>
            <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-0.5" style={{ fontFamily: font }}>
              {lang === 'th' ? 'มีบัตรสวัสดิการแห่งรัฐ' : 'I have a state welfare card'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWelfareCard(!welfareCard)}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
              welfareCard ? 'bg-[#2E6BE6]' : 'bg-[#D1D1D6] dark:bg-[#636366]'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                welfareCard ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <button
          onClick={nextStep}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors"
          style={{ fontFamily: font }}
        >
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6 Fields of interest
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 6) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">📚</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1" style={{ fontFamily: font }}>
            {lang === 'th' ? 'สนใจเรียนด้านไหน?' : 'What do you want to study?'}
          </h1>
          <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93]" style={{ fontFamily: font }}>
            {lang === 'th' ? 'เลือกได้หลายอย่าง' : 'Select all that apply'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {FIELDS_OF_STUDY.map((f) => (
            <button
              key={f.th}
              type="button"
              onClick={() => toggleField(f.th)}
              className={`px-3.5 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                selectedFields.includes(f.th)
                  ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552] text-[#1E57CC] dark:text-[#5B8EF0]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] text-[#6e6e73] dark:text-[#aeaeb2] hover:border-[#2E6BE6]/50'
              }`}
              style={{ fontFamily: font }}
            >
              {lang === 'th' ? f.th : f.en}
            </button>
          ))}
        </div>

        <button
          onClick={nextStep}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors"
          style={{ fontFamily: font }}
        >
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
        <p className="text-center mt-3">
          <button
            onClick={nextStep}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 7 Recruitment source (research) + final save
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 7) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">📣</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'คุณรู้จักทุนดีจากที่ไหน?' : 'How did you hear about TunDee?'}
          </h1>
          <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-1" style={{ fontFamily: font }}>
            {lang === 'th'
              ? 'ข้อมูลนี้ใช้เพื่องานวิจัยเท่านั้น ไม่กระทบการจับคู่ทุน'
              : 'For research purposes only — does not affect matching'}
          </p>
        </div>

        <div className="space-y-2 mb-6">
          {RECRUITMENT_SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRecruitmentSource(opt.value)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all ${
                recruitmentSource === opt.value
                  ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] hover:border-[#2E6BE6]/50 bg-white dark:bg-[#2c2c2e]'
              }`}
            >
              <span
                className="flex-1 font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]"
                style={{ fontFamily: font }}
              >
                {lang === 'th' ? opt.th : opt.en}
              </span>
              {recruitmentSource === opt.value && <span className="text-[#2E6BE6] font-bold">✓</span>}
            </button>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ fontFamily: font }}
        >
          {saving && <Spinner />}
          {lang === 'th' ? 'บันทึกและเริ่มค้นหาทุน →' : 'Save & Find Scholarships →'}
        </button>
        <p className="text-center mt-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors disabled:opacity-50"
          >
            {lang === 'th' ? 'ข้ามก่อน ดูทุนเลย' : 'Skip, browse scholarships now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  return null;
}
