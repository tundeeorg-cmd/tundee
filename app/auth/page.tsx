'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';

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

function AuthForm() {
  const { lang } = useLang();
  const t = translations.auth;
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Redirect already-logged-in users
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/scholarships');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show callback error if present
  useEffect(() => {
    if (searchParams.get('error') === 'auth_callback_failed') {
      setError(lang === 'th' ? 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่' : 'Authentication failed. Please try again.');
    }
  }, [searchParams, lang]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!email || !password) {
      setError(lang === 'th' ? 'กรุณากรอกอีเมลและรหัสผ่าน' : 'Please enter your email and password.');
      return;
    }
    setLoading(true);

    if (tab === 'login') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(lang === 'th' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'Invalid email or password.');
        setLoading(false);
        return;
      }
      router.push('/scholarships');
    } else {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${siteUrl}/auth/callback` },
      });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setSuccessMsg(lang === 'th'
        ? 'ส่งอีเมลยืนยันแล้ว! กรุณาตรวจสอบกล่องจดหมาย'
        : 'Confirmation email sent! Please check your inbox.');
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (err) {
      setError(err.message);
      setGoogleLoading(false);
    }
    // On success browser navigates away — no need to reset loading
  }

  return (
    <main className="min-h-screen bg-[#F5F5F7] flex items-center justify-center px-4 py-20">
      <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5EA] w-full max-w-md p-8">
        {/* Logo */}
        <Link href="/" className="flex flex-col items-center mb-8">
          <span className="text-2xl font-semibold text-[#1D1D1F]" style={{ fontFamily: 'Sarabun, sans-serif' }}>ทุนดี</span>
          <span className="text-[10px] font-light text-[#6E6E73] tracking-widest uppercase" style={{ fontFamily: 'DM Sans, sans-serif' }}>TunDee</span>
        </Link>

        {/* Tab switch */}
        <div className="flex rounded-xl bg-[#F5F5F7] p-1 mb-6">
          {(['login', 'signup'] as Tab[]).map((t_) => (
            <button
              key={t_}
              onClick={() => { setTab(t_); setError(''); setSuccessMsg(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t_ ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#6E6E73]'
              }`}
            >
              {t_ === 'login' ? t.loginTab[lang] : t.signupTab[lang]}
            </button>
          ))}
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-[#E5E5EA] bg-white hover:bg-[#F5F5F7] transition-colors text-sm font-medium text-[#1D1D1F] mb-4 disabled:opacity-50"
        >
          {googleLoading ? <Spinner /> : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {t.googleBtn[lang]}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-[#E5E5EA]" />
          <span className="text-xs text-[#6E6E73]">{t.or[lang]}</span>
          <div className="flex-1 h-px bg-[#E5E5EA]" />
        </div>

        {/* Email / password form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1.5">{t.email[lang]}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder[lang]}
              className="w-full px-4 py-3 rounded-xl border border-[#E5E5EA] text-sm focus:outline-none focus:ring-2 focus:ring-[#F0A500] bg-white"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1.5">{t.password[lang]}</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t.passwordPlaceholder[lang]}
                className="w-full px-4 py-3 pr-11 rounded-xl border border-[#E5E5EA] text-sm focus:outline-none focus:ring-2 focus:ring-[#F0A500] bg-white"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6E6E73] hover:text-[#1D1D1F]"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          {successMsg && (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{successMsg}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#F0A500] hover:bg-[#D4920A] text-white font-semibold py-3 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            {tab === 'login' ? t.loginBtn[lang] : t.signupBtn[lang]}
          </button>
        </form>

        {/* Switch tab hint */}
        <p className="text-center text-sm text-[#6E6E73] mt-6">
          {tab === 'login'
            ? (lang === 'th' ? 'ยังไม่มีบัญชี?' : "Don't have an account?")
            : (lang === 'th' ? 'มีบัญชีแล้ว?' : 'Already have an account?')}{' '}
          <button
            onClick={() => { setTab(tab === 'login' ? 'signup' : 'login'); setError(''); setSuccessMsg(''); }}
            className="text-[#F0A500] font-medium hover:underline"
          >
            {tab === 'login' ? t.signupTab[lang] : t.loginTab[lang]}
          </button>
        </p>
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
