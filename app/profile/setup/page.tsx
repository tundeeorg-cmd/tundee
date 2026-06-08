'use client';

/**
 * /profile/setup — Duolingo-style 6-step onboarding wizard.
 * Redirected here from /auth/callback when profile is incomplete.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import { PROVINCES_TH, FIELDS_OF_STUDY } from '@/lib/translations';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 6;

const GRADE_OPTIONS = [
  { value: 'M1-M3',    th: 'ม.1–3',        en: 'Grade 7–9' },
  { value: 'M4-M6',    th: 'ม.4–6',        en: 'Grade 10–12' },
  { value: 'vocational',th: 'ปวช./ปวส.',   en: 'Vocational' },
  { value: 'uni',       th: 'ปริญญาตรี',   en: 'Undergraduate' },
  { value: 'graduate',  th: 'บัณฑิตศึกษา', en: 'Graduate' },
];

const INCOME_OPTIONS = [
  { value: 1, th: 'ต่ำกว่า 5,000 บาท/เดือน',      en: 'Under ฿5,000/month' },
  { value: 2, th: '5,000 – 10,000 บาท/เดือน',     en: '฿5,000 – ฿10,000/month' },
  { value: 3, th: '10,000 – 15,000 บาท/เดือน',    en: '฿10,000 – ฿15,000/month' },
  { value: 4, th: '15,000 – 20,000 บาท/เดือน',    en: '฿15,000 – ฿20,000/month' },
  { value: 5, th: '20,000 – 30,000 บาท/เดือน',    en: '฿20,000 – ฿30,000/month' },
  { value: 6, th: '30,000 – 50,000 บาท/เดือน',    en: '฿30,000 – ฿50,000/month' },
  { value: 7, th: 'มากกว่า 50,000 บาท/เดือน',     en: 'Over ฿50,000/month' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

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
          className="h-full bg-[#F0A500] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
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
  const [displayName,    setDisplayName]    = useState('');
  const [gradeLevel,     setGradeLevel]     = useState('');
  const [gpa,            setGpa]            = useState('');
  const [province,       setProvince]       = useState('');
  const [incomeBracket,  setIncomeBracket]  = useState(4);
  const [welfareCard,    setWelfareCard]    = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  // Auth guard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/auth');
      } else {
        setAuthLoading(false);
        // Pre-fill name from Google if available
        const name = data.session.user.user_metadata?.full_name ?? data.session.user.user_metadata?.name ?? '';
        if (name) setDisplayName(name);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleField(value: string) {
    setSelectedFields(prev =>
      prev.includes(value) ? prev.filter(x => x !== value) : [...prev, value]
    );
  }

  function nextStep() {
    setError('');
    // Validate current step
    if (step === 2 && gpa) {
      const n = parseFloat(gpa);
      if (isNaN(n) || n < 0 || n > 4) {
        setError(lang === 'th' ? 'GPA ต้องอยู่ระหว่าง 0.00 – 4.00' : 'GPA must be between 0.00 and 4.00');
        return;
      }
    }
    setStep(s => s + 1);
  }

  function prevStep() {
    setError('');
    setStep(s => s - 1);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth'); return; }

      const gpaNum = gpa ? parseFloat(gpa) : null;

      const { error: upsertErr } = await supabase.from('profiles').upsert({
        id:               session.user.id,
        display_name:     displayName.trim() || null,
        grade_level:      gradeLevel || null,
        province_id:      province || null,
        gpa:              gpaNum,
        income_bracket:   incomeBracket,
        welfare_card:     welfareCard,
        fields_of_interest: selectedFields.length > 0 ? selectedFields : ['any'],
        last_active_at:   new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      });

      if (upsertErr) {
        setError(upsertErr.message);
        setSaving(false);
        return;
      }

      router.replace('/scholarships');
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#111111] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F0A500]/30 border-t-[#F0A500] rounded-full animate-spin" />
      </div>
    );
  }

  const filteredProvinces = PROVINCES_TH.filter(p =>
    p.toLowerCase().includes(provinceQuery.toLowerCase())
  );

  // ── Shared layout wrapper ─────────────────────────────────────────────────
  const Container = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#111111] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Back + progress */}
        <div className="mb-6">
          {step > 0 && (
            <button
              onClick={prevStep}
              className="text-sm text-[#6e6e73] dark:text-[#8e8e93] hover:text-[#1D1D1F] dark:hover:text-white mb-4 flex items-center gap-1 transition-colors"
            >
              ← {lang === 'th' ? 'ย้อนกลับ' : 'Back'}
            </button>
          )}
          <ProgressBar step={step} total={TOTAL_STEPS} />
        </div>

        <div className="bg-white dark:bg-[#1D1D1F] rounded-2xl shadow-sm border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden">
          <div className="h-1 bg-[#F0A500]" />
          <div className="px-7 py-8">
            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 0 — Name
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 0) {
    return (
      <Container>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">👋</div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
            {lang === 'th' ? 'คุณชื่ออะไร?' : "What's your name?"}
          </h1>
          <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]">
            {lang === 'th' ? 'ชื่อที่ใช้แสดงในโปรไฟล์' : 'This will appear on your profile'}
          </p>
        </div>

        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder={lang === 'th' ? 'ชื่อของคุณ' : 'Your name'}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="w-full text-center text-2xl font-light border-0 border-b-2 border-[#e0e0e0] dark:border-[#3a3a3c] focus:border-[#F0A500] focus:outline-none bg-transparent text-[#1D1D1F] dark:text-[#F5F5F7] placeholder-[#aeaeb2] py-3 mb-8 transition-colors"
          style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          onKeyDown={e => { if (e.key === 'Enter') nextStep(); }}
        />

        <button
          onClick={nextStep}
          className="w-full bg-[#F0A500] hover:bg-[#d4920a] text-white font-bold py-4 rounded-xl transition-colors"
        >
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
        <p className="text-center mt-3">
          <button onClick={nextStep} className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors">
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </Container>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Grade level
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 1) {
    return (
      <Container>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🎓</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
            {lang === 'th' ? 'คุณกำลังเรียนอยู่ชั้นไหน?' : 'What grade are you in?'}
          </h1>
        </div>

        <div className="space-y-2 mb-6">
          {GRADE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setGradeLevel(opt.value); setStep(2); }}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all ${
                gradeLevel === opt.value
                  ? 'border-[#F0A500] bg-[#FFF8E7] dark:bg-[#2C1F00]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] hover:border-[#F0A500]/50 bg-white dark:bg-[#2c2c2e]'
              }`}
            >
              <span className="flex-1 font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]"
                    style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
                {lang === 'th' ? opt.th : opt.en}
              </span>
              {gradeLevel === opt.value && (
                <span className="text-[#F0A500] font-bold">✓</span>
              )}
            </button>
          ))}
        </div>

        <p className="text-center">
          <button onClick={() => setStep(2)} className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors">
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </Container>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 — GPA
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 2) {
    return (
      <Container>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">📊</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
            {lang === 'th' ? 'เกรดเฉลี่ยของคุณคือเท่าไหร่?' : 'What is your GPA?'}
          </h1>
          <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]">
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
            onChange={e => setGpa(e.target.value)}
            placeholder="3.50"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            inputMode="decimal"
            className="text-center text-4xl font-light w-40 border-0 border-b-2 border-[#e0e0e0] dark:border-[#3a3a3c] focus:border-[#F0A500] focus:outline-none bg-transparent text-[#1D1D1F] dark:text-[#F5F5F7] placeholder-[#aeaeb2] py-2 transition-colors"
            onKeyDown={e => { if (e.key === 'Enter') nextStep(); }}
          />
          <p className="text-xs text-[#aeaeb2] mt-2">0.00 – 4.00</p>
        </div>

        <button onClick={nextStep} className="w-full bg-[#F0A500] hover:bg-[#d4920a] text-white font-bold py-4 rounded-xl transition-colors mb-3">
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
        <p className="text-center">
          <button onClick={() => { setGpa(''); nextStep(); }} className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors">
            {lang === 'th' ? 'ยังไม่รู้ / ข้ามก่อน' : "Not sure yet / Skip"}
          </button>
        </p>
      </Container>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Province
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 3) {
    return (
      <Container>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">📍</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
            {lang === 'th' ? 'คุณอยู่จังหวัดไหน?' : 'Which province are you from?'}
          </h1>
        </div>

        <div className="relative mb-3">
          <input
            type="text"
            value={provinceQuery}
            onChange={e => setProvinceQuery(e.target.value)}
            placeholder={lang === 'th' ? 'ค้นหาจังหวัด...' : 'Search province...'}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="w-full px-4 py-3 text-base border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl bg-white dark:bg-[#2c2c2e] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:border-[#F0A500] focus:ring-2 focus:ring-[#F0A500]/20 placeholder-[#aeaeb2]"
          />
        </div>

        <div className="max-h-52 overflow-y-auto border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl mb-4 divide-y divide-[#f0f0f0] dark:divide-[#3a3a3c]">
          {filteredProvinces.slice(0, 20).map(pv => (
            <button
              key={pv}
              onClick={() => { setProvince(pv); setStep(4); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                province === pv
                  ? 'bg-[#FFF8E7] dark:bg-[#2C1F00] text-[#F0A500] font-semibold'
                  : 'bg-white dark:bg-[#2c2c2e] text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#3a3a3c]'
              }`}
              style={{ fontFamily: 'Sarabun, sans-serif' }}
            >
              {pv}
              {province === pv && <span className="float-right text-[#F0A500]">✓</span>}
            </button>
          ))}
          {filteredProvinces.length === 0 && (
            <p className="text-center text-sm text-[#aeaeb2] py-4">
              {lang === 'th' ? 'ไม่พบจังหวัด' : 'Province not found'}
            </p>
          )}
        </div>

        <p className="text-center">
          <button onClick={() => setStep(4)} className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors">
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </Container>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4 — Income & welfare card
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 4) {
    return (
      <Container>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">💰</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
            {lang === 'th' ? 'รายได้ครัวเรือนต่อเดือน' : 'Monthly household income'}
          </h1>
          <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93]">
            {lang === 'th' ? 'ใช้กรองทุนที่มีเงื่อนไขรายได้' : 'Used to match income-restricted scholarships'}
          </p>
        </div>

        <div className="space-y-1.5 mb-5">
          {INCOME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setIncomeBracket(opt.value)}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                incomeBracket === opt.value
                  ? 'border-[#F0A500] bg-[#FFF8E7] dark:bg-[#2C1F00] font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] text-[#6e6e73] dark:text-[#aeaeb2] hover:border-[#F0A500]/50'
              }`}
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
            >
              {lang === 'th' ? opt.th : opt.en}
            </button>
          ))}
        </div>

        {/* Welfare card toggle */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-[#F5F5F7] dark:bg-[#2c2c2e] rounded-xl border border-[#e0e0e0] dark:border-[#3a3a3c] mb-6">
          <div>
            <p className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
              {lang === 'th' ? 'บัตรสวัสดิการแห่งรัฐ' : 'State Welfare Card'}
            </p>
            <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-0.5">
              {lang === 'th' ? 'มีบัตรสวัสดิการแห่งรัฐ' : 'I have a state welfare card'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWelfareCard(!welfareCard)}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${welfareCard ? 'bg-[#F0A500]' : 'bg-[#D1D1D6] dark:bg-[#636366]'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${welfareCard ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <button onClick={nextStep} className="w-full bg-[#F0A500] hover:bg-[#d4920a] text-white font-bold py-4 rounded-xl transition-colors">
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
      </Container>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5 — Fields of interest
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 5) {
    return (
      <Container>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">📚</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
            {lang === 'th' ? 'สนใจเรียนด้านไหน?' : 'What do you want to study?'}
          </h1>
          <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93]">
            {lang === 'th' ? 'เลือกได้หลายอย่าง' : 'Select all that apply'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {FIELDS_OF_STUDY.map(f => (
            <button
              key={f.th}
              type="button"
              onClick={() => toggleField(f.th)}
              className={`px-3.5 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                selectedFields.includes(f.th)
                  ? 'border-[#F0A500] bg-[#FFF8E7] dark:bg-[#2C1F00] text-[#D4920A] dark:text-[#F0A500]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] text-[#6e6e73] dark:text-[#aeaeb2] hover:border-[#F0A500]/50'
              }`}
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
            >
              {lang === 'th' ? f.th : f.en}
            </button>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#F0A500] hover:bg-[#d4920a] text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
      </Container>
    );
  }

  return null;
}
