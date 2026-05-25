'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLang } from '@/lib/LanguageContext';
import { translations, PROVINCES_TH, FIELDS_OF_STUDY } from '@/lib/translations';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const GRADE_LEVELS = ['M4', 'M5', 'M6', 'uni', 'graduate'] as const;

export default function ProfilePage() {
  const { lang } = useLang();
  const router = useRouter();
  const p = translations.profile;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Form state
  const [province, setProvince] = useState('');
  const [gpa, setGpa] = useState('');
  const [incomeBracket, setIncomeBracket] = useState<number>(4);
  const [welfareCard, setWelfareCard] = useState(false);
  const [gradeLevel, setGradeLevel] = useState('M6');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  // Load user + existing profile
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setAuthLoading(false);
        return;
      }
      setUser(data.user);

      // Load existing profile
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profile) {
          setProvince(profile.province_id ?? '');
          setGpa(profile.gpa != null ? String(profile.gpa) : '');
          setIncomeBracket(profile.income_bracket ?? 4);
          setWelfareCard(profile.welfare_card ?? false);
          setGradeLevel(profile.grade_level ?? 'M6');
          setSelectedFields(profile.fields_of_interest?.filter((f: string) => f !== 'any') ?? []);
        }
      } catch {
        // no profile yet — form stays empty, that's fine
      }

      setAuthLoading(false);
    });
  }, []);

  function toggleField(field: string) {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }

  async function handleSave() {
    if (!user) return;
    setSaveState('saving');

    const gpaNum = parseFloat(gpa);
    const profileData = {
      id: user.id,
      province_id: province || null,
      gpa: !isNaN(gpaNum) && gpaNum >= 0 && gpaNum <= 4 ? gpaNum : null,
      income_bracket: incomeBracket,
      welfare_card: welfareCard,
      grade_level: gradeLevel,
      fields_of_interest: selectedFields.length > 0 ? selectedFields : ['any'],
      updated_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase.from('profiles').upsert(profileData);
      if (error) throw error;
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F0A500] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center px-4">
        <div className="bg-white rounded-[20px] shadow-[0_4px_40px_rgba(0,0,0,0.1)] p-10 max-w-sm w-full text-center">
          <div className="text-5xl mb-5">🔒</div>
          <h2
            className="text-xl font-semibold text-[#1D1D1F] mb-2"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {p.notLoggedIn[lang]}
          </h2>
          <p className="text-sm text-[#6E6E73] mb-6">{p.notLoggedInSub[lang]}</p>
          <Link
            href="/auth"
            className="inline-block bg-[#F0A500] text-white font-semibold px-8 py-3 rounded-full hover:bg-[#D4920A] transition-colors text-sm"
          >
            {p.loginBtn[lang]}
          </Link>
        </div>
      </div>
    );
  }

  // ── Saved success state ────────────────────────────────────────────────
  if (saveState === 'saved') {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center px-4">
        <div className="bg-white rounded-[20px] shadow-[0_4px_40px_rgba(0,0,0,0.1)] p-10 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2
            className="text-xl font-semibold text-[#1D1D1F] mb-2"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {p.saved[lang]}
          </h2>
          <p className="text-sm text-[#6E6E73] mb-8">{p.savedSub[lang]}</p>
          <Link
            href="/scholarships"
            className="inline-block bg-[#F0A500] text-white font-semibold px-8 py-3 rounded-full hover:bg-[#D4920A] transition-colors text-sm"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {p.viewMatches[lang]}
          </Link>
          <button
            onClick={() => setSaveState('idle')}
            className="block mx-auto mt-4 text-sm text-[#6E6E73] hover:text-[#1D1D1F]"
          >
            {lang === 'th' ? 'แก้ไขโปรไฟล์' : 'Edit profile'}
          </button>
        </div>
      </div>
    );
  }

  // ── Profile form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E5EA]">
        <div className="max-w-[680px] mx-auto px-6 py-10">
          <h1
            className="text-3xl text-[#1D1D1F] mb-2"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif', fontWeight: 300 }}
          >
            {p.title[lang]}
          </h1>
          <p className="text-sm text-[#6E6E73]">{p.subtitle[lang]}</p>
        </div>
      </div>

      <div className="max-w-[680px] mx-auto px-6 py-10 space-y-6">

        {/* Error banner */}
        {saveState === 'error' && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {p.saveError[lang]}
          </div>
        )}

        {/* ── Card: Basic info ──────────────────────────────────────── */}
        <div className="bg-white rounded-[16px] border border-[#E5E5EA] p-6 space-y-5">
          <h2 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider">
            {lang === 'th' ? 'ข้อมูลพื้นฐาน' : 'Basic Info'}
          </h2>

          {/* Grade level */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
              {p.gradeLevel[lang]}
            </label>
            <div className="flex flex-wrap gap-2">
              {GRADE_LEVELS.map((gl) => (
                <button
                  key={gl}
                  type="button"
                  onClick={() => setGradeLevel(gl)}
                  className={`text-sm px-4 py-2 rounded-full border transition-colors ${
                    gradeLevel === gl
                      ? 'bg-[#F0A500] text-white border-[#F0A500]'
                      : 'border-[#E5E5EA] text-[#6E6E73] hover:border-[#F0A500]'
                  }`}
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                >
                  {p.gradeLevels[gl][lang]}
                </button>
              ))}
            </div>
          </div>

          {/* Province */}
          <div>
            <label htmlFor="province" className="block text-sm font-medium text-[#1D1D1F] mb-2">
              {p.province[lang]}
            </label>
            <select
              id="province"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="w-full text-sm border border-[#E5E5EA] rounded-lg px-3 py-2.5 bg-white text-[#1D1D1F] focus:outline-none focus:border-[#F0A500] transition-colors"
            >
              <option value="">{p.provincePlaceholder[lang]}</option>
              {PROVINCES_TH.map((prov) => (
                <option key={prov} value={prov}>{prov}</option>
              ))}
            </select>
          </div>

          {/* GPA */}
          <div>
            <label htmlFor="gpa" className="block text-sm font-medium text-[#1D1D1F] mb-2">
              {p.gpa[lang]}
            </label>
            <input
              id="gpa"
              type="number"
              min="0"
              max="4"
              step="0.01"
              value={gpa}
              onChange={(e) => setGpa(e.target.value)}
              placeholder="เช่น 3.50"
              className="w-full text-sm border border-[#E5E5EA] rounded-lg px-3 py-2.5 bg-white text-[#1D1D1F] focus:outline-none focus:border-[#F0A500] transition-colors placeholder:text-[#ADADB8]"
            />
          </div>
        </div>

        {/* ── Card: Financial info ──────────────────────────────────── */}
        <div className="bg-white rounded-[16px] border border-[#E5E5EA] p-6 space-y-5">
          <h2 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider">
            {lang === 'th' ? 'ข้อมูลทางการเงิน' : 'Financial Info'}
          </h2>

          {/* Income bracket */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
              {p.income[lang]}
            </label>
            <div className="space-y-2">
              {([1, 2, 3, 4, 5, 6, 7] as const).map((bracket) => (
                <button
                  key={bracket}
                  type="button"
                  onClick={() => setIncomeBracket(bracket)}
                  className={`w-full text-left text-sm px-4 py-2.5 rounded-lg border transition-colors ${
                    incomeBracket === bracket
                      ? 'bg-[#FFF8E7] border-[#F0A500] text-[#1D1D1F]'
                      : 'border-[#E5E5EA] text-[#6E6E73] hover:border-[#F0A500]/50'
                  }`}
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                >
                  <span className={`font-medium mr-2 ${incomeBracket === bracket ? 'text-[#F0A500]' : 'text-[#ADADB8]'}`}>
                    {bracket}.
                  </span>
                  {p.incomeBrackets[bracket][lang]}
                </button>
              ))}
            </div>
          </div>

          {/* Welfare card */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={welfareCard}
              onChange={(e) => setWelfareCard(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#F0A500] shrink-0"
            />
            <div>
              <div className="text-sm font-medium text-[#1D1D1F]">{p.welfareCard[lang]}</div>
              <div className="text-xs text-[#6E6E73] mt-0.5">{p.welfareCardSub[lang]}</div>
            </div>
          </label>
        </div>

        {/* ── Card: Fields of interest ──────────────────────────────── */}
        <div className="bg-white rounded-[16px] border border-[#E5E5EA] p-6 space-y-4">
          <div>
            <h2 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wider mb-1">
              {p.fields[lang]}
            </h2>
            <p className="text-xs text-[#ADADB8]">{p.fieldsSub[lang]}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FIELDS_OF_STUDY.map((field) => {
              const label = lang === 'th' ? field.th : field.en;
              const isSelected = selectedFields.includes(field.th);
              return (
                <button
                  key={field.th}
                  type="button"
                  onClick={() => toggleField(field.th)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    isSelected
                      ? 'bg-[#F0A500] text-white border-[#F0A500]'
                      : 'border-[#E5E5EA] text-[#6E6E73] hover:border-[#F0A500]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {selectedFields.length === 0 && (
            <p className="text-xs text-[#ADADB8] italic">
              {lang === 'th' ? '— ไม่ได้เลือก จะแสดงทุนทุกสาขา —' : '— None selected, will show all fields —'}
            </p>
          )}
        </div>

        {/* ── Save button ───────────────────────────────────────────── */}
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className="w-full bg-[#F0A500] text-white font-semibold py-4 rounded-full hover:bg-[#D4920A] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
          style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
        >
          {saveState === 'saving' ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              {p.saving[lang]}
            </>
          ) : (
            p.saveBtn[lang]
          )}
        </button>

        {/* Sign out */}
        <div className="text-center pb-4">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/');
            }}
            className="text-xs text-[#ADADB8] hover:text-[#6E6E73] transition-colors"
          >
            {p.signOut[lang]}
          </button>
        </div>

      </div>
    </div>
  );
}
