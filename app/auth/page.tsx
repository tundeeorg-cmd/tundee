'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';
import { supabase } from '@/lib/supabase';

type Tab = 'login' | 'signup';

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function InputField({
  label,
  type,
  value,
  onChange,
  placeholder,
  error,
  showToggle,
  onToggle,
  showText,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  showToggle?: boolean;
  onToggle?: () => void;
  showText?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1D1D1F] mb-1.5" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={showToggle && showText ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-4 py-3 ${showToggle ? 'pr-11' : ''} rounded-lg border text-sm text-[#1D1D1F] bg-white outline-none focus:border-[#F0A500] focus:ring-2 focus:ring-[#F0A500]/10 transition-all placeholder:text-[#ADADB8] ${error ? 'border-red-400 bg-red-50/30' : 'border-[#E5E5EA]'}`}
        />
        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6E6E73] hover:text-[#1D1D1F] transition-colors"
            tabIndex={-1}
          >
            <EyeIcon open={!!showText} />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}

export default function AuthPage() {
  const { lang } = useLang();
  const a = translations.auth;

  const [tab, setTab] = useState<Tab>('login');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  function resetForm() {
    setErrors({});
    setSuccess('');
    setName('');
    setEmail('');
    setPassword('');
    setConfirm('');
    setShowPass(false);
    setShowConfirm(false);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (tab === 'signup' && !name.trim()) errs.name = a.nameRequired[lang];
    if (!email.trim()) errs.email = a.emailRequired[lang];
    if (!password) errs.password = a.passwordRequired[lang];
    else if (password.length < 8) errs.password = a.passwordMin[lang];
    if (tab === 'signup' && password !== confirm) errs.confirm = a.passwordMismatch[lang];
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    setSuccess('');

    try {
      if (tab === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });
        if (error) throw error;
        setSuccess(a.successSignup[lang]);
        resetForm();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setSuccess(a.successLogin[lang]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrors({ form: message });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-[420px]">
        {/* Card */}
        <div className="bg-white rounded-[20px] shadow-[0_4px_6px_rgba(0,0,0,0.05),0_20px_40px_rgba(0,0,0,0.1)] p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex flex-col items-center gap-0.5">
              <span className="text-2xl font-semibold text-[#1D1D1F]" style={{ fontFamily: 'Sarabun, sans-serif' }}>
                ทุนดี
              </span>
              <span className="text-[10px] font-light text-[#6E6E73] tracking-widest uppercase" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                TunDee
              </span>
            </Link>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-[#F5F5F7] rounded-[10px] p-1 mb-7">
            {(['login', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); resetForm(); }}
                className={`flex-1 py-2 text-sm font-medium rounded-[8px] transition-all duration-200 ${tab === t ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#6E6E73] hover:text-[#1D1D1F]'}`}
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {t === 'login' ? a.loginTab[lang] : a.signupTab[lang]}
              </button>
            ))}
          </div>

          {/* Success */}
          {success && (
            <div className="mb-5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              {success}
            </div>
          )}

          {/* Form-level error */}
          {errors.form && (
            <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {errors.form}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {tab === 'signup' && (
              <InputField
                label={a.fullName[lang]}
                type="text"
                value={name}
                onChange={setName}
                placeholder={a.fullNamePlaceholder[lang]}
                error={errors.name}
              />
            )}

            <InputField
              label={a.email[lang]}
              type="email"
              value={email}
              onChange={setEmail}
              placeholder={a.emailPlaceholder[lang]}
              error={errors.email}
            />

            <InputField
              label={a.password[lang]}
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={a.passwordPlaceholder[lang]}
              error={errors.password}
              showToggle
              onToggle={() => setShowPass((v) => !v)}
              showText={showPass}
            />

            {tab === 'signup' && (
              <InputField
                label={a.confirmPassword[lang]}
                type="password"
                value={confirm}
                onChange={setConfirm}
                placeholder={a.confirmPlaceholder[lang]}
                error={errors.confirm}
                showToggle
                onToggle={() => setShowConfirm((v) => !v)}
                showText={showConfirm}
              />
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#F0A500] text-white font-semibold py-3 rounded-full hover:bg-[#D4920A] transition-colors duration-200 disabled:opacity-60 flex items-center justify-center gap-2 text-sm mt-2"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
            >
              {loading && <Spinner />}
              {tab === 'login' ? a.loginBtn[lang] : a.signupBtn[lang]}
            </button>
          </form>

          {/* OR divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-[#E5E5EA]" />
            <span className="text-xs text-[#6E6E73] font-medium tracking-wider">{a.or[lang]}</span>
            <div className="flex-1 h-px bg-[#E5E5EA]" />
          </div>

          {/* Google sign-in */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 border border-[#E5E5EA] bg-white text-[#1D1D1F] font-medium py-3 rounded-full hover:bg-[#F5F5F7] transition-colors duration-200 text-sm disabled:opacity-60"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            {googleLoading ? <Spinner /> : <GoogleLogo />}
            {a.googleBtn[lang]}
          </button>
        </div>
      </div>
    </div>
  );
}
