'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function AuthForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  const [tab,           setTab]           = useState<'login' | 'signup'>('login');
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error,         setError]         = useState('');
  const [sent,          setSent]          = useState(false);
  const [cooldown,      setCooldown]      = useState(0);
  const [lang,          setLang]          = useState<'th' | 'en'>('th');

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.tundee.org';

  // ── On mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('tundee_lang') as 'th' | 'en' | null;
    if (saved === 'th' || saved === 'en') setLang(saved);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/scholarships');
    });

    const err = searchParams.get('error');
    if (err === 'auth_failed' || err === 'auth_callback_failed') {
      setError(
        saved === 'en'
          ? 'Link expired or already used. Please request a new one.'
          : 'ลิงก์หมดอายุหรือใช้ไปแล้ว กรุณาขอลิงก์ใหม่',
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resend cooldown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function switchTab(next: 'login' | 'signup') {
    setTab(next);
    setError('');
    setSent(false);
    setPassword('');
  }

  // ── Login with password ───────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError(lang === 'th' ? 'กรุณากรอกอีเมลที่ถูกต้อง' : 'Please enter a valid email');
      return;
    }
    if (!password) {
      setError(lang === 'th' ? 'กรุณากรอกรหัสผ่าน' : 'Please enter your password');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    setLoading(false);
    if (err) {
      console.error('[TunDee] signInWithPassword:', err.message);
      setError(
        lang === 'th'
          ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
          : 'Incorrect email or password',
      );
      return;
    }
    router.replace('/scholarships');
  }

  // ── Sign up with magic link ───────────────────────────────────────────────
  async function handleMagicLink(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError(lang === 'th' ? 'กรุณากรอกอีเมลที่ถูกต้อง' : 'Please enter a valid email');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: `${siteUrl}/auth/callback`, shouldCreateUser: true },
    });
    setLoading(false);
    if (err) {
      console.error('[TunDee] signInWithOtp:', err.message);
      setError(lang === 'th' ? 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่' : 'Could not send email. Please try again.');
      return;
    }
    setSent(true);
    setCooldown(60);
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────
  async function handleGoogle() {
    setGoogleLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (err) { setError(err.message); setGoogleLoading(false); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAGIC LINK SENT STATE (Sign Up success)
  // ══════════════════════════════════════════════════════════════════════════
  if (sent) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#111111] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="bg-white dark:bg-[#1D1D1F] rounded-2xl shadow-sm border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden">
            <div className="h-1 bg-[#F0A500]" />
            <div className="px-8 py-10 text-center">
              <div className="w-20 h-20 bg-[#FFF8E7] rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">✉️</div>
              <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">
                {lang === 'th' ? 'ตรวจสอบอีเมลของคุณ' : 'Check your email'}
              </h1>
              <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93] mb-4 leading-relaxed">
                {lang === 'th' ? 'เราส่งลิงก์เข้าสู่ระบบไปที่' : 'We sent a sign-in link to'}
              </p>
              <div className="inline-block bg-[#FFF8E7] dark:bg-[#2C1F00] border border-[#F0A500]/30 text-[#D4920A] dark:text-[#F0A500] font-semibold text-sm px-5 py-2.5 rounded-full mb-6 break-all">
                {email}
              </div>
              <div className="text-left bg-[#F5F5F7] dark:bg-[#2c2c2e] rounded-xl p-4 mb-6 space-y-3">
                {[
                  { n: 1, th: 'เปิดแอป Gmail หรือ Email ของคุณ', en: 'Open your Gmail or email app' },
                  { n: 2, th: 'หาอีเมลจาก TunDee ทุนดี',         en: 'Find the email from TunDee ทุนดี' },
                  { n: 3, th: 'กดปุ่ม "เข้าสู่ระบบ" ในอีเมล',    en: 'Tap "Sign In" in the email' },
                ].map(s => (
                  <div key={s.n} className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-[#F0A500] text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{s.n}</div>
                    <p className="text-xs text-[#3a3a3c] dark:text-[#aeaeb2] leading-relaxed">{lang === 'th' ? s.th : s.en}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => handleMagicLink()}
                disabled={cooldown > 0 || loading}
                className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] text-[#6e6e73] dark:text-[#8e8e93] text-sm font-medium py-3 rounded-xl hover:bg-[#F5F5F7] dark:hover:bg-[#2c2c2e] disabled:opacity-40 transition-colors mb-3 flex items-center justify-center gap-2"
              >
                {loading && <div className="w-4 h-4 border-2 border-[#e0e0e0] border-t-[#F0A500] rounded-full animate-spin" />}
                {cooldown > 0
                  ? (lang === 'th' ? `ส่งอีกครั้งใน ${cooldown} วินาที` : `Resend in ${cooldown}s`)
                  : (lang === 'th' ? 'ส่งลิงก์ใหม่' : 'Send new link')}
              </button>
              <button onClick={() => { setSent(false); setError(''); setCooldown(0); }} className="text-sm text-[#F0A500] hover:underline">
                {lang === 'th' ? 'เปลี่ยนอีเมล' : 'Use a different email'}
              </button>
              <p className="text-xs text-[#aeaeb2] dark:text-[#6e6e73] mt-6">
                {lang === 'th' ? 'ลิงก์หมดอายุใน 1 ชั่วโมง' : 'Link expires in 1 hour'}
              </p>
            </div>
          </div>
          <p className="text-center mt-4">
            <a href="/" className="text-sm text-[#6e6e73] dark:text-[#8e8e93] hover:text-[#1D1D1F] dark:hover:text-white transition-colors">
              ← {lang === 'th' ? 'กลับหน้าแรก' : 'Back to home'}
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN FORM
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#111111] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-[#1D1D1F] rounded-2xl shadow-sm border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden">

          {/* Gold bar */}
          <div className="h-1 bg-[#F0A500]" />

          {/* Logo */}
          <div className="px-8 pt-8 pb-5 text-center">
            <a href="/" className="inline-block">
              <div className="text-3xl font-bold text-[#1D1D1F] dark:text-white mb-1" style={{ fontFamily: 'Sarabun, sans-serif' }}>
                ทุนดี
              </div>
              <div className="text-[10px] text-[#aeaeb2] dark:text-[#6e6e73] tracking-[3px] uppercase" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                TUNDEE.ORG
              </div>
            </a>
          </div>

          {/* Tabs */}
          <div className="mx-8 mb-6 p-1 bg-[#F5F5F7] dark:bg-[#2c2c2e] rounded-xl flex">
            {(['login', 'signup'] as const).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  tab === t
                    ? 'bg-white dark:bg-[#1D1D1F] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-sm'
                    : 'text-[#6e6e73] dark:text-[#8e8e93] hover:text-[#1D1D1F] dark:hover:text-white'
                }`}
              >
                {t === 'login'
                  ? (lang === 'th' ? 'เข้าสู่ระบบ' : 'Login')
                  : (lang === 'th' ? 'สมัครสมาชิก' : 'Sign Up')}
              </button>
            ))}
          </div>

          <div className="px-8 pb-8">

            {/* Error banner */}
            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Google button */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-3 border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl py-3.5 px-4 text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#2c2c2e] transition-colors disabled:opacity-50 mb-4"
            >
              {googleLoading ? (
                <div className="w-4 h-4 border-2 border-[#e0e0e0] border-t-[#F0A500] rounded-full animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {lang === 'th'
                ? (tab === 'login' ? 'เข้าสู่ระบบด้วย Google' : 'สมัครด้วย Google')
                : (tab === 'login' ? 'Continue with Google' : 'Sign up with Google')}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
              <span className="text-xs text-[#aeaeb2] dark:text-[#6e6e73] font-medium">
                {lang === 'th' ? 'หรือใช้อีเมล' : 'or use email'}
              </span>
              <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
            </div>

            {/* ── LOGIN TAB: email + password ─────────────────────────────── */}
            {tab === 'login' && (
              <form onSubmit={handleLogin} noValidate>
                <label className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
                  {lang === 'th' ? 'อีเมล' : 'Email Address'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder={lang === 'th' ? 'อีเมลของคุณ' : 'you@example.com'}
                  autoComplete="email"
                  inputMode="email"
                  disabled={loading}
                  className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-3.5 text-base text-[#1D1D1F] dark:text-[#F5F5F7] bg-white dark:bg-[#2c2c2e] placeholder-[#aeaeb2] focus:outline-none focus:border-[#F0A500] focus:ring-2 focus:ring-[#F0A500]/20 transition-colors mb-3 disabled:opacity-50"
                />

                <label className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
                  {lang === 'th' ? 'รหัสผ่าน' : 'Password'}
                </label>
                <div className="relative mb-5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                    className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-3.5 pr-11 text-base text-[#1D1D1F] dark:text-[#F5F5F7] bg-white dark:bg-[#2c2c2e] placeholder-[#aeaeb2] focus:outline-none focus:border-[#F0A500] focus:ring-2 focus:ring-[#F0A500]/20 transition-colors disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aeaeb2] hover:text-[#6e6e73] transition-colors p-1"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full bg-[#F0A500] hover:bg-[#d4920a] active:bg-[#c07a00] text-white py-4 rounded-xl font-bold text-base transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {lang === 'th' ? 'กำลังเข้าสู่ระบบ...' : 'Signing in…'}
                    </>
                  ) : (
                    lang === 'th' ? 'เข้าสู่ระบบ' : 'Login'
                  )}
                </button>

                <p className="text-center text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-4">
                  {lang === 'th' ? 'ยังไม่มีบัญชี? ' : "Don't have an account? "}
                  <button type="button" onClick={() => switchTab('signup')} className="text-[#F0A500] font-semibold hover:underline">
                    {lang === 'th' ? 'สมัครสมาชิก' : 'Sign Up'}
                  </button>
                </p>
              </form>
            )}

            {/* ── SIGN UP TAB: email only → magic link ────────────────────── */}
            {tab === 'signup' && (
              <form onSubmit={handleMagicLink} noValidate>
                <label className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
                  {lang === 'th' ? 'อีเมล' : 'Email Address'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder={lang === 'th' ? 'อีเมลของคุณ' : 'you@example.com'}
                  autoComplete="email"
                  inputMode="email"
                  disabled={loading}
                  className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-3.5 text-base text-[#1D1D1F] dark:text-[#F5F5F7] bg-white dark:bg-[#2c2c2e] placeholder-[#aeaeb2] focus:outline-none focus:border-[#F0A500] focus:ring-2 focus:ring-[#F0A500]/20 transition-colors mb-5 disabled:opacity-50"
                />

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full bg-[#F0A500] hover:bg-[#d4920a] active:bg-[#c07a00] text-white py-4 rounded-xl font-bold text-base transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {lang === 'th' ? 'กำลังส่ง...' : 'Sending…'}
                    </>
                  ) : (
                    lang === 'th' ? '✉️  ส่งลิงก์สมัครสมาชิก' : '✉️  Send sign-up link'
                  )}
                </button>

                <p className="text-center text-xs text-[#aeaeb2] dark:text-[#6e6e73] mt-4 leading-relaxed">
                  {lang === 'th'
                    ? 'เราจะส่งลิงก์ไปยังอีเมลของคุณ ไม่ต้องสร้างรหัสผ่าน'
                    : "We'll email you a link. No password needed."}
                </p>

                <p className="text-center text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-3">
                  {lang === 'th' ? 'มีบัญชีแล้ว? ' : 'Already have an account? '}
                  <button type="button" onClick={() => switchTab('login')} className="text-[#F0A500] font-semibold hover:underline">
                    {lang === 'th' ? 'เข้าสู่ระบบ' : 'Login'}
                  </button>
                </p>
              </form>
            )}

          </div>
        </div>

        <p className="text-center mt-4">
          <a href="/" className="text-sm text-[#6e6e73] dark:text-[#8e8e93] hover:text-[#1D1D1F] dark:hover:text-white transition-colors">
            ← {lang === 'th' ? 'กลับหน้าแรก' : 'Back to home'}
          </a>
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
