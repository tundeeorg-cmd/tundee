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
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  // Redirect already-logged-in users
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.location.href = '/scholarships';
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show callback error if present
  useEffect(() => {
    if (searchParams.get('error') === 'auth_callback_failed') {
      setError(lang === 'th'
        ? 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google กรุณาลองใหม่'
        : 'Google sign-in failed. Please try again.');
    }
  }, [searchParams, lang]);

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL ?? '');

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setNeedsConfirmation(false);

    if (!email.trim()) {
      setError(lang === 'th' ? 'กรุณากรอกอีเมล' : 'Please enter your email.');
      return;
    }
    if (!password) {
      setError(lang === 'th' ? 'กรุณากรอกรหัสผ่าน' : 'Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      if (tab === 'login') {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

        if (err) {
          console.error('[TunDee] signInWithPassword error:', err.message, err.status);

          // Email not confirmed — show resend option
          if (err.message.toLowerCase().includes('not confirmed') || err.message.toLowerCase().includes('email')) {
            setNeedsConfirmation(true);
            setError(lang === 'th'
              ? 'อีเมลยังไม่ได้รับการยืนยัน กรุณาตรวจสอบกล่องจดหมายของคุณ'
              : 'Email not confirmed. Please check your inbox for a verification link.');
          } else if (err.message.toLowerCase().includes('invalid') || err.status === 400) {
            setError(lang === 'th'
              ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
              : 'Incorrect email or password. Please try again.');
          } else {
            setError(err.message);
          }
          setLoading(false);
          return;
        }

        if (data.session) {
          // Use window.location for a full reload — guarantees the session cookie
          // is picked up by the server before the next page loads
          window.location.href = '/scholarships';
          return; // Don't setLoading(false) — page is navigating away
        }

        // Unexpected: session is null but no error
        setError(lang === 'th' ? 'เกิดข้อผิดพลาด กรุณาลองใหม่' : 'Something went wrong. Please try again.');
        setLoading(false);

      } else {
        // Sign up
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${siteUrl}/auth/callback` },
        });

        if (err) {
          console.error('[TunDee] signUp error:', err.message);
          if (err.message.toLowerCase().includes('already registered')) {
            setError(lang === 'th'
              ? 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ'
              : 'This email is already registered. Please log in instead.');
          } else {
            setError(err.message);
          }
          setLoading(false);
          return;
        }

        setSuccessMsg(lang === 'th'
          ? '✅ ส่งอีเมลยืนยันแล้ว! กรุณาตรวจสอบกล่องจดหมายและคลิกลิงก์เพื่อยืนยันบัญชี'
          : '✅ Confirmation email sent! Check your inbox and click the link to activate your account.');
        setLoading(false);
      }
    } catch (ex) {
      console.error('[TunDee] auth exception:', ex);
      setError(lang === 'th' ? 'เกิดข้อผิดพลาด กรุณาลองใหม่' : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  async function handleResendConfirmation() {
    if (!email.trim()) return;
    setResendLoading(true);
    try {
      await supabase.auth.resend({ type: 'signup', email: email.trim() });
      setSuccessMsg(lang === 'th'
        ? '✅ ส่งอีเมลยืนยันใหม่แล้ว! กรุณาตรวจสอบกล่องจดหมาย'
        : '✅ Confirmation email resent! Check your inbox.');
      setError('');
      setNeedsConfirmation(false);
    } catch {
      // ignore
    }
    setResendLoading(false);
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
    <main className="min-h-screen bg-[#F5F5F7] dark:bg-[#000000] flex items-center justify-center px-4 py-20">
      <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-sm border border-[#E5E5EA] dark:border-[#38383A] w-full max-w-md p-8">

        {/* Logo */}
        <Link href="/" className="flex flex-col items-center mb-8">
          <span className="text-2xl font-semibold text-[#1D1D1F] dark:text-white" style={{ fontFamily: 'Sarabun, sans-serif' }}>ทุนดี</span>
          <span className="text-[10px] font-light text-[#6E6E73] dark:text-[#8E8E93] tracking-widest uppercase" style={{ fontFamily: 'DM Sans, sans-serif' }}>TunDee</span>
        </Link>

        {/* Tab switch */}
        <div className="flex rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] p-1 mb-6">
          {(['login', 'signup'] as Tab[]).map((t_) => (
            <button
              key={t_}
              type="button"
              onClick={() => { setTab(t_); setError(''); setSuccessMsg(''); setNeedsConfirmation(false); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t_
                  ? 'bg-white dark:bg-[#3A3A3C] text-[#1D1D1F] dark:text-white shadow-sm'
                  : 'text-[#6E6E73] dark:text-[#8E8E93]'
              }`}
            >
              {t_ === 'login' ? t.loginTab[lang] : t.signupTab[lang]}
            </button>
          ))}
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-[#E5E5EA] dark:border-[#38383A] bg-white dark:bg-[#2C2C2E] hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C] transition-colors text-sm font-medium text-[#1D1D1F] dark:text-white mb-4 disabled:opacity-50"
        >
          {googleLoading ? <Spinner /> : (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
          <div className="flex-1 h-px bg-[#E5E5EA] dark:bg-[#38383A]" />
          <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">{t.or[lang]}</span>
          <div className="flex-1 h-px bg-[#E5E5EA] dark:bg-[#38383A]" />
        </div>

        {/* Email / password form */}
        <form onSubmit={handleEmailAuth} noValidate className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
              {t.email[lang]}
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder[lang]}
              className="w-full px-4 py-3 rounded-xl border border-[#E5E5EA] dark:border-[#38383A] text-sm focus:outline-none focus:ring-2 focus:ring-[#F0A500] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white placeholder:text-[#ADADB8]"
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
              {t.password[lang]}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t.passwordPlaceholder[lang]}
                className="w-full px-4 py-3 pr-11 rounded-xl border border-[#E5E5EA] dark:border-[#38383A] text-sm focus:outline-none focus:ring-2 focus:ring-[#F0A500] bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white placeholder:text-[#ADADB8]"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white"
                tabIndex={-1}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              {needsConfirmation && (
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resendLoading}
                  className="mt-2 text-sm font-semibold text-[#F0A500] hover:underline disabled:opacity-50"
                >
                  {resendLoading ? '...' : (lang === 'th' ? 'ส่งอีเมลยืนยันใหม่ →' : 'Resend confirmation email →')}
                </button>
              )}
            </div>
          )}

          {/* Success message */}
          {successMsg && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3">
              <p className="text-sm text-green-700 dark:text-green-400">{successMsg}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#F0A500] hover:bg-[#D4920A] active:bg-[#C07A00] text-white font-semibold py-3.5 rounded-xl text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading && <Spinner />}
            {loading
              ? (lang === 'th' ? 'กำลังเข้าสู่ระบบ...' : 'Signing in...')
              : (tab === 'login' ? t.loginBtn[lang] : t.signupBtn[lang])}
          </button>
        </form>

        {/* Switch tab hint */}
        <p className="text-center text-sm text-[#6E6E73] dark:text-[#8E8E93] mt-6">
          {tab === 'login'
            ? (lang === 'th' ? 'ยังไม่มีบัญชี?' : "Don't have an account?")
            : (lang === 'th' ? 'มีบัญชีแล้ว?' : 'Already have an account?')}{' '}
          <button
            type="button"
            onClick={() => { setTab(tab === 'login' ? 'signup' : 'login'); setError(''); setSuccessMsg(''); setNeedsConfirmation(false); }}
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
