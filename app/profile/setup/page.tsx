'use client';

/**
 * /profile/setup — First-time profile setup for new users.
 * Redirected here from /auth/callback when no profile row exists yet.
 * After saving, redirects to /scholarships.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import { translations, PROVINCES_TH, FIELDS_OF_STUDY } from '@/lib/translations';

const GRADE_LEVELS = ['M4', 'M5', 'M6', 'uni', 'graduate'] as const;

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default function ProfileSetupPage() {
  const { lang } = useLang();
  const router = useRouter();
  const supabase = createClient();
  const p = translations.profile;

  const [authLoading, setAuthLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [gradeLevel, setGradeLevel] = useState('M6');
  const [province, setProvince] = useState('');
  const [gpa, setGpa] = useState('');
  const [incomeBracket, setIncomeBracket] = useState(4);
  const [welfareCard, setWelfareCard] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  // Auth guard — if not logged in, send to /auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/auth');
      } else {
        setAuthLoading(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store Thai field names (used as DB values)
  function toggleField(thaiName: string) {
    setSelectedFields(prev =>
      prev.includes(thaiName) ? prev.filter(x => x !== thaiName) : [...prev, thaiName]
    );
  }

  async function handleSave() {
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/auth'); return; }

    const gpaNum = parseFloat(gpa);
    if (gpa && (isNaN(gpaNum) || gpaNum < 0 || gpaNum > 4)) {
      setError(lang === 'th' ? 'GPA ต้องอยู่ระหว่าง 0.00 – 4.00' : 'GPA must be between 0.00 and 4.00');
      return;
    }

    setSaving(true);
    const { error: upsertErr } = await supabase.from('profiles').upsert({
      id: session.user.id,
      grade_level: gradeLevel,
      province_id: province || null,
      gpa: gpa ? gpaNum : null,
      income_bracket: incomeBracket,
      welfare_card: welfareCard,
      fields_of_interest: selectedFields.length > 0 ? selectedFields : ['any'],
      updated_at: new Date().toISOString(),
    });

    if (upsertErr) {
      setError(upsertErr.message);
      setSaving(false);
      return;
    }

    router.push('/scholarships');
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
        <Spinner />
      </main>
    );
  }

  const incomeBrackets = [1, 2, 3, 4, 5, 6, 7];

  return (
    <main className="min-h-screen bg-[#F5F5F7] pt-20 pb-16 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#FFF3CD] mb-4">
            <span className="text-2xl">🎓</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#1D1D1F]">
            {lang === 'th' ? 'ตั้งค่าโปรไฟล์ของคุณ' : 'Set Up Your Profile'}
          </h1>
          <p className="text-sm text-[#6E6E73] mt-2">
            {lang === 'th'
              ? 'เพื่อให้เราแนะนำทุนการศึกษาที่เหมาะสมกับคุณ'
              : 'So we can match you with the right scholarships'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E5EA] shadow-sm p-6 space-y-6">
          {/* Grade Level */}
          <div>
            <label className="block text-sm font-semibold text-[#1D1D1F] mb-3">{p.gradeLevel[lang]}</label>
            <div className="flex flex-wrap gap-2">
              {GRADE_LEVELS.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGradeLevel(g)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    gradeLevel === g
                      ? 'bg-[#F0A500] border-[#F0A500] text-white'
                      : 'bg-white border-[#E5E5EA] text-[#6E6E73] hover:border-[#F0A500]'
                  }`}
                >
                  {p.gradeLevels[g][lang]}
                </button>
              ))}
            </div>
          </div>

          {/* Province */}
          <div>
            <label className="block text-sm font-semibold text-[#1D1D1F] mb-2">{p.province[lang]}</label>
            <select
              value={province}
              onChange={e => setProvince(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[#E5E5EA] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F0A500]"
            >
              <option value="">{p.provincePlaceholder[lang]}</option>
              {PROVINCES_TH.map(pv => (
                <option key={pv} value={pv}>{pv}</option>
              ))}
            </select>
          </div>

          {/* GPA */}
          <div>
            <label className="block text-sm font-semibold text-[#1D1D1F] mb-2">{p.gpa[lang]}</label>
            <input
              type="number"
              min="0"
              max="4"
              step="0.01"
              value={gpa}
              onChange={e => setGpa(e.target.value)}
              placeholder="0.00 – 4.00"
              className="w-full px-4 py-3 rounded-xl border border-[#E5E5EA] text-sm focus:outline-none focus:ring-2 focus:ring-[#F0A500]"
            />
          </div>

          {/* Income Bracket */}
          <div>
            <label className="block text-sm font-semibold text-[#1D1D1F] mb-3">{p.income[lang]}</label>
            <div className="space-y-2">
              {incomeBrackets.map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setIncomeBracket(b)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                    incomeBracket === b
                      ? 'bg-[#FFF3CD] border-[#F0A500] text-[#1D1D1F] font-medium'
                      : 'bg-white border-[#E5E5EA] text-[#6E6E73] hover:border-[#F0A500]'
                  }`}
                >
                  {p.incomeBrackets[b as keyof typeof p.incomeBrackets][lang]}
                </button>
              ))}
            </div>
          </div>

          {/* Welfare Card */}
          <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-[#E5E5EA] bg-[#F5F5F7]">
            <span className="text-sm font-medium text-[#1D1D1F]">{p.welfareCard[lang]}</span>
            <button
              type="button"
              onClick={() => setWelfareCard(!welfareCard)}
              className={`w-12 h-6 rounded-full transition-colors relative ${welfareCard ? 'bg-[#F0A500]' : 'bg-[#D1D1D6]'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${welfareCard ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Fields of Interest */}
          <div>
            <label className="block text-sm font-semibold text-[#1D1D1F] mb-3">{p.fields[lang]}</label>
            <div className="flex flex-wrap gap-2">
              {FIELDS_OF_STUDY.map(f => (
                <button
                  key={f.th}
                  type="button"
                  onClick={() => toggleField(f.th)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    selectedFields.includes(f.th)
                      ? 'bg-[#F0A500] border-[#F0A500] text-white'
                      : 'bg-white border-[#E5E5EA] text-[#6E6E73] hover:border-[#F0A500]'
                  }`}
                >
                  {f[lang]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#F0A500] hover:bg-[#D4920A] text-white font-semibold py-3.5 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Spinner />}
            {lang === 'th' ? 'บันทึกและดูทุนการศึกษา →' : 'Save & View Scholarships →'}
          </button>
        </div>
      </div>
    </main>
  );
}
