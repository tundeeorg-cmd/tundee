'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLang } from '@/lib/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { translations, PROVINCES_TH, FIELDS_OF_STUDY } from '@/lib/translations';
import { createClient } from '@/lib/supabase/client';
import { getProfile, updateDisplayName, uploadAvatar, getInitials } from '@/lib/profile';
import type { UserProfile } from '@/lib/profile';
import type { User } from '@supabase/supabase-js';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const GRADE_LEVELS = ['M4', 'M5', 'M6', 'uni', 'graduate'] as const;

export default function ProfilePage() {
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const supabase = createClient();
  const p = translations.profile;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser]             = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [saveState, setSaveState]   = useState<SaveState>('idle');

  // Account state
  const [userProfile, setUserProfile]       = useState<UserProfile | null>(null);
  const [displayName, setDisplayName]       = useState('');
  const [nameSaving, setNameSaving]         = useState(false);
  const [nameToast, setNameToast]           = useState(false);
  const [avatarUrl, setAvatarUrl]           = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading]   = useState(false);
  const [fileError, setFileError]           = useState('');

  // Matching profile state
  const [province, setProvince]             = useState('');
  const [gpa, setGpa]                       = useState('');
  const [incomeBracket, setIncomeBracket]   = useState<number>(4);
  const [welfareCard, setWelfareCard]       = useState(false);
  const [gradeLevel, setGradeLevel]         = useState('M6');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  // Safety timeout — never stay stuck on loading spinner
  useEffect(() => {
    const t = setTimeout(() => setAuthLoading(false), 3000);
    return () => clearTimeout(t);
  }, []);

  // Load user + existing profile
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        if (!data.user) return;
        setUser(data.user);

        // Account profile
        try {
          const acct = await getProfile(data.user.id);
          if (!mounted) return;
          setUserProfile(acct);
          setDisplayName(acct?.display_name ?? '');
          setAvatarUrl(acct?.avatar_url ?? null);
        } catch { /* display_name/avatar_url columns may not exist yet */ }

        // Matching profile
        try {
          const { data: profile } = await supabase
            .from('profiles').select('*').eq('id', data.user.id).maybeSingle();
          if (!mounted) return;
          if (profile) {
            setProvince(profile.province_id ?? '');
            setGpa(profile.gpa != null ? String(profile.gpa) : '');
            setIncomeBracket(profile.income_bracket ?? 4);
            setWelfareCard(profile.welfare_card ?? false);
            setGradeLevel(profile.grade_level ?? 'M6');
            setSelectedFields(profile.fields_of_interest?.filter((f: string) => f !== 'any') ?? []);
          }
        } catch { /* no profile yet */ }
      } catch (e) {
        console.error('Profile page auth error:', e);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Account handlers ──────────────────────────────────────────────── */
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { setFileError(p.fileTooLarge[lang]); return; }
    setFileError('');
    setAvatarLoading(true);
    try {
      const url = await uploadAvatar(user.id, file);
      setAvatarUrl(url);
    } catch { /* ignore */ }
    setAvatarLoading(false);
  }

  async function handleSaveName() {
    if (!user) return;
    setNameSaving(true);
    try {
      await updateDisplayName(user.id, displayName.trim());
      setNameToast(true);
      setTimeout(() => setNameToast(false), 2500);
    } catch { /* ignore */ }
    setNameSaving(false);
  }

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
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#000000] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F0A500] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#000000] flex items-center justify-center px-4">
        <div className="bg-white dark:bg-[#1C1C1E] rounded-[20px] shadow-[0_4px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_40px_rgba(0,0,0,0.5)] p-10 max-w-sm w-full text-center border border-transparent dark:border-[#38383A]">
          <div className="text-5xl mb-5">🔒</div>
          <h2
            className="text-xl font-semibold text-[#1D1D1F] dark:text-white mb-2"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {p.notLoggedIn[lang]}
          </h2>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-6">{p.notLoggedInSub[lang]}</p>
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
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#000000] flex items-center justify-center px-4">
        <div className="bg-white dark:bg-[#1C1C1E] rounded-[20px] shadow-[0_4px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_40px_rgba(0,0,0,0.5)] p-10 max-w-sm w-full text-center border border-transparent dark:border-[#38383A]">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2
            className="text-xl font-semibold text-[#1D1D1F] dark:text-white mb-2"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {p.saved[lang]}
          </h2>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-8">{p.savedSub[lang]}</p>
          <Link
            href="/scholarships"
            className="inline-block bg-[#F0A500] text-white font-semibold px-8 py-3 rounded-full hover:bg-[#D4920A] transition-colors text-sm"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {p.viewMatches[lang]}
          </Link>
          <button
            onClick={() => setSaveState('idle')}
            className="block mx-auto mt-4 text-sm text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white"
          >
            {lang === 'th' ? 'แก้ไขโปรไฟล์' : 'Edit profile'}
          </button>
        </div>
      </div>
    );
  }

  // ── Profile form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#000000]">
      {/* Header */}
      <div className="bg-white dark:bg-[#1C1C1E] border-b border-[#E5E5EA] dark:border-[#38383A]">
        <div className="max-w-[680px] mx-auto px-6 py-10">
          <h1
            className="text-3xl text-[#1D1D1F] dark:text-white mb-2"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif', fontWeight: 300 }}
          >
            {p.title[lang]}
          </h1>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]">{p.subtitle[lang]}</p>
        </div>
      </div>

      <div className="max-w-[680px] mx-auto px-6 py-10 space-y-6">

        {/* Error banner */}
        {saveState === 'error' && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
            {p.saveError[lang]}
          </div>
        )}

        {/* ── Card: Account settings ────────────────────────────────── */}
        <div className="bg-white dark:bg-[#1C1C1E] rounded-[16px] border border-[#E5E5EA] dark:border-[#38383A] p-6 space-y-5">
          <h2 className="text-xs font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-wider">
            {lang === 'th' ? 'บัญชีของคุณ' : 'Account'}
          </h2>

          {/* Avatar */}
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-16 h-16 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#F0A500] focus:ring-offset-2 dark:focus:ring-offset-[#1C1C1E] shrink-0"
              aria-label={p.changePhoto[lang]}
            >
              {avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full bg-[#F0A500] text-white flex items-center justify-center text-2xl font-semibold">
                  {getInitials(displayName || user?.email || '?')}
                </span>
              )}
              {/* overlay on hover */}
              <span className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                {avatarLoading ? (
                  <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                )}
              </span>
            </button>
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-medium text-[#F0A500] hover:text-[#D4920A] transition-colors"
              >
                {p.changePhoto[lang]}
              </button>
              <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-0.5">JPG, PNG · max 5 MB</p>
              {fileError && <p className="text-xs text-red-500 mt-0.5">{fileError}</p>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Display name */}
          <div>
            <label htmlFor="display-name" className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">
              {p.displayName[lang]}
              <span className="ml-2 text-xs text-[#ADADB8] font-normal">{displayName.length}/40</span>
            </label>
            <div className="flex gap-2">
              <input
                id="display-name"
                type="text"
                maxLength={40}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={p.displayNamePlaceholder[lang]}
                className="flex-1 text-sm border border-[#E5E5EA] dark:border-[#38383A] rounded-lg px-3 py-2.5 bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#F0A500] transition-colors placeholder:text-[#ADADB8]"
              />
              <button
                type="button"
                onClick={handleSaveName}
                disabled={nameSaving}
                className="shrink-0 bg-[#F0A500] text-white text-sm font-semibold px-4 rounded-lg hover:bg-[#D4920A] transition-colors disabled:opacity-60"
              >
                {nameToast ? p.savedToast[lang] : nameSaving ? '…' : p.saveButton[lang]}
              </button>
            </div>
          </div>

          {/* Email (readonly) */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">{p.emailLabel[lang]}</label>
            <input
              type="email"
              readOnly
              value={user?.email ?? ''}
              className="w-full text-sm border border-[#E5E5EA] dark:border-[#38383A] rounded-lg px-3 py-2.5 bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#6E6E73] dark:text-[#8E8E93] cursor-not-allowed"
            />
            <p className="text-xs text-[#ADADB8] mt-1">{p.emailNote[lang]}</p>
          </div>

          {/* Theme picker */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-3">{p.themeLabel[lang]}</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'light' as const, icon: '☀️', label: p.themeLight[lang] },
                { key: 'dark'  as const, icon: '🌙', label: p.themeDark[lang]  },
                { key: 'auto'  as const, icon: '⚙️', label: p.themeAuto[lang]  },
              ]).map(({ key, icon, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTheme(key)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-[12px] border-2 transition-all text-sm ${
                    theme === key
                      ? 'border-[#F0A500] bg-[#FFF8E7] dark:bg-[#2C1F00] text-[#D4920A] dark:text-[#F0A500] font-semibold'
                      : 'border-[#E5E5EA] dark:border-[#38383A] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#F0A500]/50'
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Language toggle */}
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-3">{p.languageLabel[lang]}</label>
            <div className="flex gap-2">
              {(['th', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`flex-1 py-2.5 rounded-[10px] border-2 text-sm font-medium transition-all ${
                    lang === l
                      ? 'border-[#F0A500] bg-[#FFF8E7] dark:bg-[#2C1F00] text-[#D4920A] dark:text-[#F0A500]'
                      : 'border-[#E5E5EA] dark:border-[#38383A] text-[#6E6E73] dark:text-[#8E8E93] hover:border-[#F0A500]/50'
                  }`}
                >
                  {l === 'th' ? '🇹🇭 ภาษาไทย' : '🇬🇧 English'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Card: Basic info ──────────────────────────────────────── */}
        <div className="bg-white dark:bg-[#1C1C1E] rounded-[16px] border border-[#E5E5EA] dark:border-[#38383A] p-6 space-y-5">
          <h2 className="text-xs font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-wider">
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
            <label htmlFor="province" className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">
              {p.province[lang]}
            </label>
            <select
              id="province"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="w-full text-sm border border-[#E5E5EA] dark:border-[#38383A] rounded-lg px-3 py-2.5 bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#F0A500] transition-colors"
            >
              <option value="">{p.provincePlaceholder[lang]}</option>
              {PROVINCES_TH.map((prov) => (
                <option key={prov} value={prov}>{prov}</option>
              ))}
            </select>
          </div>

          {/* GPA */}
          <div>
            <label htmlFor="gpa" className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">
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
              className="w-full text-sm border border-[#E5E5EA] dark:border-[#38383A] rounded-lg px-3 py-2.5 bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white focus:outline-none focus:border-[#F0A500] transition-colors placeholder:text-[#ADADB8]"
            />
          </div>
        </div>

        {/* ── Card: Financial info ──────────────────────────────────── */}
        <div className="bg-white dark:bg-[#1C1C1E] rounded-[16px] border border-[#E5E5EA] dark:border-[#38383A] p-6 space-y-5">
          <h2 className="text-xs font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-wider">
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
        <div className="bg-white dark:bg-[#1C1C1E] rounded-[16px] border border-[#E5E5EA] dark:border-[#38383A] p-6 space-y-4">
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
