'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ─── Suspense wrapper ─────────────────────────────────────────────────────────
// useSearchParams() REQUIRES Suspense without a fallback prop the page is blank

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#2E6BE6] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  );
}

// ─── Auth form ────────────────────────────────────────────────────────────────

function AuthForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  const [email,         setEmail]         = useState('');
  const [sent,          setSent]          = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error,         setError]         = useState('');
  const [cooldown,      setCooldown]      = useState(0);
  const [lang,          setLang]          = useState<'th' | 'en'>('th');

  const isSignup = searchParams.get('from') === 'signup';

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.tundee.org';

  useEffect(() => {
    // Read stored language preference
    try {
      const saved = localStorage.getItem('tundee_lang');
      if (saved === 'en') setLang('en');
    } catch {
      // localStorage unavailable (SSR guard)
    }

    // Already logged in → redirect
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/scholarships');
    });

    // Handle error params from callback
    const err = searchParams.get('error');
    if (err) {
      setError(
        'ลิงก์หมดอายุหรือใช้ไปแล้ว กรุณาขอลิงก์ใหม่ · Link expired or already used. Please try again.'
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // ── Send magic link ──────────────────────────────────────────────────────────
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError(lang === 'th' ? 'กรุณากรอกอีเมลที่ถูกต้อง' : 'Please enter a valid email');
      return;
    }
    setLoading(true);
    setError('');

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    setLoading(false);
    if (otpError) {
      console.error('[TunDee] signInWithOtp:', otpError.message);
      setError(lang === 'th' ? 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่' : 'Failed to send. Please try again.');
      return;
    }
    setSent(true);
    setCooldown(60);
  }

  // ── Resend ───────────────────────────────────────────────────────────────────
  async function resend() {
    if (cooldown > 0) return;
    setLoading(true);
    await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${siteUrl}/auth/callback`, shouldCreateUser: true },
    });
    setLoading(false);
    setCooldown(60);
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  async function signInWithGoogle() {
    setGoogleLoading(true);
    setError('');
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setGoogleLoading(false);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUCCESS STATE email sent
  // ════════════════════════════════════════════════════════════════════════════
  if (sent) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="bg-white dark:bg-[#1D1D1F] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
            <div className="h-1 bg-[#2E6BE6]" />
            <div className="px-8 py-10 text-center">
              <div className="w-20 h-20 bg-[#EFF4FF] rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
                ✉️
              </div>
              <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2"
                  style={{ fontFamily: 'Sarabun, sans-serif' }}>
                {lang === 'th' ? 'ตรวจสอบอีเมลของคุณ' : 'Check your email'}
              </h1>
              <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93] mb-3">
                {lang === 'th' ? 'เราส่งลิงก์เข้าสู่ระบบไปที่' : 'We sent a sign-in link to'}
              </p>
              <div className="inline-block bg-[#EFF4FF] dark:bg-[#162552] border border-[#2E6BE6]/30 text-[#1E57CC] dark:text-[#5B8EF0] font-semibold text-sm px-5 py-2.5 rounded-full mb-6 break-all">
                {email}
              </div>

              {/* Steps */}
              <div className="text-left bg-[#F7F9FC] dark:bg-[#2c2c2e] rounded-xl p-4 mb-6 space-y-3">
                {[
                  { n: 1, th: 'เปิดแอป Gmail หรือ Email ของคุณ', en: 'Open your Gmail or email app' },
                  { n: 2, th: 'หาอีเมลจาก TunDee ทุนดี',         en: 'Find the email from TunDee ทุนดี' },
                  { n: 3, th: 'กดปุ่ม "เข้าสู่ระบบ" ในอีเมล',    en: 'Tap the sign-in button in the email' },
                ].map((s) => (
                  <div key={s.n} className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-[#2E6BE6] text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      {s.n}
                    </div>
                    <p className="text-xs text-[#3a3a3c] dark:text-[#aeaeb2] leading-relaxed">
                      {lang === 'th' ? s.th : s.en}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={resend}
                disabled={cooldown > 0 || loading}
                className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] text-[#6e6e73] dark:text-[#8e8e93] text-sm font-medium py-3 rounded-xl hover:bg-[#F7F9FC] dark:hover:bg-[#2c2c2e] disabled:opacity-40 transition-colors mb-3 flex items-center justify-center gap-2"
              >
                {loading && (
                  <div className="w-4 h-4 border-2 border-[#e0e0e0] border-t-[#2E6BE6] rounded-full animate-spin" />
                )}
                {cooldown > 0
                  ? (lang === 'th' ? `ส่งอีกครั้งใน ${cooldown} วินาที` : `Resend in ${cooldown}s`)
                  : (lang === 'th' ? 'ส่งลิงก์ใหม่' : 'Resend link')}
              </button>

              <button
                onClick={() => { setSent(false); setError(''); setCooldown(0); }}
                className="text-sm text-[#2E6BE6] hover:underline"
              >
                {lang === 'th' ? 'เปลี่ยนอีเมล' : 'Use a different email'}
              </button>

              <p className="text-xs text-[#aeaeb2] dark:text-[#6e6e73] mt-5">
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

  // ════════════════════════════════════════════════════════════════════════════
  // MAIN FORM
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-[#1D1D1F] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">

          {/* Blue accent bar */}
          <div className="h-1 bg-[#2E6BE6]" />

          {/* Logo */}
          <div className="px-8 pt-8 pb-6 text-center">
            <a href="/">
              <div className="text-3xl font-bold text-[#1D1D1F] dark:text-white mb-1"
                   style={{ fontFamily: 'Sarabun, sans-serif' }}>
                ทุนดี
              </div>
              <div className="text-[10px] text-[#aeaeb2] dark:text-[#6e6e73] tracking-[3px] uppercase mb-3"
                   style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                TUNDEE.ORG
              </div>
            </a>
            {isSignup ? (
              <>
                <h1 className="text-lg font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1"
                    style={{ fontFamily: 'Sarabun, sans-serif' }}>
                  {lang === 'th' ? 'สร้างบัญชีฟรี' : 'Create a free account'}
                </h1>
                <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]"
                   style={{ fontFamily: 'Sarabun, sans-serif' }}>
                  {lang === 'th' ? 'เพื่อดูทุนที่ตรงกับโปรไฟล์ของคุณ' : 'To see scholarships matched to your profile'}
                </p>
              </>
            ) : (
              <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]"
                 style={{ fontFamily: 'Sarabun, sans-serif' }}>
                {lang === 'th' ? 'ค้นหาทุนการศึกษาที่เหมาะกับคุณ' : 'Find the scholarship you deserve'}
              </p>
            )}
          </div>

          <div className="px-8 pb-8">

            {/* Error */}
            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Google OAuth */}
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-3 border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl py-3.5 px-4 text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F7F9FC] dark:hover:bg-[#2c2c2e] transition-colors disabled:opacity-50 mb-4"
            >
              {googleLoading ? (
                <div className="w-4 h-4 border-2 border-[#e0e0e0] border-t-[#2E6BE6] rounded-full animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {isSignup
                ? (lang === 'th' ? 'สร้างบัญชีด้วย Google' : 'Sign up with Google')
                : (lang === 'th' ? 'เข้าสู่ระบบด้วย Google' : 'Continue with Google')}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
              <span className="text-xs text-[#aeaeb2] dark:text-[#6e6e73] font-medium">
                {lang === 'th' ? 'หรือใช้อีเมล' : 'or use email'}
              </span>
              <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
            </div>

            {/* Magic link form */}
            <form onSubmit={sendMagicLink} noValidate>
              <label className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
                {lang === 'th' ? 'อีเมลของคุณ' : 'Your email'}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                disabled={loading || googleLoading}
                style={{ fontSize: '16px' }}
                className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-3.5 text-[#1D1D1F] dark:text-[#F5F5F7] dark:bg-[#2c2c2e] placeholder-[#aeaeb2] focus:outline-none focus:border-[#2E6BE6] focus:ring-2 focus:ring-[#2E6BE6]/20 transition-colors mb-4 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] active:bg-[#1848B0] text-white py-4 rounded-xl font-bold text-base transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {lang === 'th' ? 'กำลังส่ง...' : 'Sending…'}
                  </>
                ) : isSignup ? (
                  lang === 'th' ? '✉️  สร้างบัญชีด้วยอีเมล' : '✉️  Create account with email'
                ) : (
                  lang === 'th' ? '✉️  ส่งลิงก์เข้าสู่ระบบ' : '✉️  Send sign-in link'
                )}
              </button>
            </form>

            <p className="text-center text-xs text-[#aeaeb2] dark:text-[#6e6e73] mt-4 leading-relaxed"
               style={{ fontFamily: 'Sarabun, sans-serif' }}>
              {isSignup
                ? (lang === 'th' ? 'ฟรีตลอด ไม่มีค่าใช้จ่าย' : 'Always free. No credit card required.')
                : (lang === 'th' ? 'ถ้ายังไม่มีบัญชี ระบบจะสร้างให้อัตโนมัติ ฟรีตลอด' : "No account yet? We'll create one automatically. Always free.")}
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
