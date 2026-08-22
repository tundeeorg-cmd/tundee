'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import { PREVIEW_COOKIE, PREVIEW_PARAM, decodePreviewInput } from '@/lib/preview/types';
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_PARAM,
  CONSENT_VERSION,
} from '@/lib/consent';

// ─── Suspense wrapper ─────────────────────────────────────────────────────────
// useSearchParams() REQUIRES Suspense without a fallback prop the page is blank

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#2E6BE6] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  );
}

// ─── Error copy ───────────────────────────────────────────────────────────────

/** Maps an `?error=` code from a callback route to student-facing copy. */
function authErrorMessage(code: string, lang: string): string {
  const th = lang === 'th';
  switch (code) {
    case 'line_cancelled':
      return th ? 'ยกเลิกการเข้าสู่ระบบด้วย LINE' : 'LINE sign-in was cancelled.';
    case 'line_not_configured':
      return th
        ? 'ระบบ LINE ยังไม่พร้อมใช้งาน กรุณาใช้ Google หรืออีเมลแทน'
        : 'LINE login is not available yet. Please use Google or email.';
    case 'line_state_mismatch':
    case 'line_no_code':
    case 'line_no_id_token':
    case 'line_verify_failed':
    case 'line_no_sub':
    case 'line_token_exchange':
      return th
        ? 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
        : 'LINE sign-in failed. Please try again.';
    case 'line_user_provisioning':
    case 'line_session_failed':
      return th
        ? 'สร้างบัญชีจาก LINE ไม่สำเร็จ กรุณาลองใหม่ หรือใช้ Google/อีเมลแทน'
        : "Couldn't finish LINE sign-in. Please try again, or use Google or email.";
    default:
      return th
        ? 'ลิงก์หมดอายุหรือใช้ไปแล้ว กรุณาขอลิงก์ใหม่'
        : 'Link expired or already used. Please try again.';
  }
}

// ─── Auth form ────────────────────────────────────────────────────────────────

function AuthForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();
  const { lang }     = useLang();

  const [email,         setEmail]         = useState('');
  const [sent,          setSent]          = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [lineLoading,   setLineLoading]   = useState(false);
  const [error,         setError]         = useState('');
  const [cooldown,      setCooldown]      = useState(0);
  const [consent,       setConsent]       = useState(false);

  const isSignup = searchParams.get('from') === 'signup';

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.tundee.org';

  // Post-login destination. Visitors arriving from the /start preview carry
  // `next=/scholarships?from=preview` so they land on their own matched results
  // instead of a generic list. Same-origin paths only.
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
    ? rawNext
    : '/scholarships';

  /** Reads a non-httpOnly cookie in the browser. */
  function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  }

  /**
   * Consent and the /start answers ride in the callback URL, not only in cookies.
   * An email magic link is commonly opened in a different browser from the one
   * that began signup — cookies are gone there, but the link's own query string
   * survives, so the callback can still write a complete profile and skip the
   * setup wizard entirely.
   */
  function buildCallbackUrl(): string {
    const qs = new URLSearchParams({ next });
    qs.set(CONSENT_PARAM, CONSENT_VERSION);
    const preview = readCookie(PREVIEW_COOKIE);
    if (preview && decodePreviewInput(preview)) qs.set(PREVIEW_PARAM, preview);
    return `${siteUrl}/auth/callback?${qs.toString()}`;
  }

  /** Records consent for the Google and LINE paths, which return to this browser. */
  function recordConsent() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${CONSENT_COOKIE}=${CONSENT_VERSION}; Max-Age=${CONSENT_COOKIE_MAX_AGE}` +
      `; Path=/; SameSite=Lax${secure}`;
  }

  const busy = loading || googleLoading || lineLoading;
  /** Every signup path is gated on consent — PDPA, and the callback writes a row. */
  const blocked = busy || !consent;

  useEffect(() => {
    // Already logged in → redirect
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(next);
    });

    // Handle error params from callback
    const err = searchParams.get('error');
    if (err) {
      setError(authErrorMessage(err, lang));
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
    recordConsent();

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: buildCallbackUrl(),
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
      options: { emailRedirectTo: buildCallbackUrl(), shouldCreateUser: true },
    });
    setLoading(false);
    setCooldown(60);
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  async function signInWithGoogle() {
    setGoogleLoading(true);
    setError('');
    recordConsent();
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: buildCallbackUrl() },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setGoogleLoading(false);
    }
  }

  // ── LINE login ───────────────────────────────────────────────────────────────
  // Supabase has no LINE provider, so this goes through our own bridge route
  // (app/api/auth/line/*), which mints a Supabase session from a verified LINE
  // identity and then hands off to the same /auth/callback as every other method.
  function signInWithLine() {
    setLineLoading(true);
    setError('');
    recordConsent();
    window.location.href = `/api/auth/line/start?next=${encodeURIComponent(next)}`;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUCCESS STATE email sent
  // ════════════════════════════════════════════════════════════════════════════
  if (sent) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
            <div className="h-1 bg-[#1B3A6B]" />
            <div className="px-8 py-10 text-center">
              <div className="w-20 h-20 bg-[#EBF2FF] rounded-full flex items-center justify-center mx-auto mb-6 text-[#1B3A6B]">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m2 7 10 7 10-7"/>
                </svg>
              </div>
              <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2"
                  style={{ fontFamily: 'Sarabun, sans-serif' }}>
                {lang === 'th' ? 'ตรวจสอบอีเมลของคุณ' : 'Check your email'}
              </h1>
              <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93] mb-3">
                {lang === 'th' ? 'เราส่งลิงก์เข้าสู่ระบบไปที่' : 'We sent a login link to'}
              </p>
              <div className="inline-block bg-[#EBF2FF] dark:bg-[#162552] border border-[#2E6BE6]/30 text-[#1E57CC] dark:text-[#5B8EF0] font-semibold text-sm px-5 py-2.5 rounded-full mb-6 break-all">
                {email}
              </div>

              {/* Steps */}
              <div className="text-left bg-[#F7F9FC] dark:bg-[#0D1F35] rounded-xl p-4 mb-6 space-y-3">
                {[
                  { n: 1, th: 'เปิดแอป Gmail หรือ Email ของคุณ', en: 'Open your Gmail or email app' },
                  { n: 2, th: 'หาอีเมลจาก TunDee ทุนดี',         en: 'Find the email from TunDee' },
                  { n: 3, th: 'กดปุ่ม "เข้าสู่ระบบ" ในอีเมล',    en: 'Tap the "Log in" button in the email' },
                ].map((s) => (
                  <div key={s.n} className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-[#1B3A6B] text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
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
                  <div className="w-4 h-4 border-2 border-[#e0e0e0] border-t-[#1B3A6B] rounded-full animate-spin" />
                )}
                {cooldown > 0
                  ? (lang === 'th' ? `ส่งอีกครั้งใน ${cooldown} วินาที` : `Resend in ${cooldown} seconds`)
                  : (lang === 'th' ? 'ส่งลิงก์ใหม่' : 'Resend link')}
              </button>

              <button
                onClick={() => { setSent(false); setError(''); setCooldown(0); }}
                className="text-sm text-[#1B3A6B] hover:underline"
              >
                {lang === 'th' ? 'เปลี่ยนอีเมล' : 'Change email'}
              </button>

              <p className="text-xs text-[#aeaeb2] dark:text-[#6e6e73] mt-5">
                {lang === 'th' ? 'ลิงก์หมดอายุใน 1 ชั่วโมง' : 'This link expires in 1 hour'}
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
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">

          {/* Blue accent bar */}
          <div className="h-1 bg-[#1B3A6B]" />

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

            {/* ── One-tap providers ──────────────────────────────────────────
                Google and LINE first: on phones these are a single tap with no
                app-switch to an inbox, which is where email drop-off happens. */}

            {/* ── PDPA consent ───────────────────────────────────────────────
                Inline here rather than as step 0 of /profile/setup: with consent
                in hand at callback time the profile can be written server-side and
                the user sent straight to their matches, instead of through a
                nine-step wizard that re-asks what /start already collected. */}
            <label
              className="flex items-start gap-3 mb-3 cursor-pointer select-none"
              style={{ fontFamily: 'Sarabun, sans-serif' }}
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => { setConsent(e.target.checked); setError(''); }}
                className="mt-0.5 w-5 h-5 shrink-0 accent-[#1B3A6B] rounded"
              />
              <span className="text-sm leading-relaxed text-[#6E7A8A] dark:text-[#8e9bb0]">
                ฉันยอมรับ{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1B3A6B] dark:text-[#8FB4FF] underline"
                >
                  ข้อกำหนดการใช้งาน
                </a>
                {' '}และ{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1B3A6B] dark:text-[#8FB4FF] underline"
                >
                  นโยบายความเป็นส่วนตัว
                </a>
                {' '}และยินยอมให้ TunDee เก็บข้อมูลการศึกษาของฉันเพื่อแนะนำทุนที่ตรงกับฉัน
              </span>
            </label>
            {!consent && (
              <p
                className="mb-4 text-xs text-[#8A96A8] dark:text-[#7A8FA8]"
                style={{ fontFamily: 'Sarabun, sans-serif' }}
              >
                กรุณายอมรับข้อกำหนดก่อนดำเนินการต่อ
              </p>
            )}

            {/* Google OAuth */}
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={blocked}
              className="w-full flex items-center justify-center gap-3 border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl py-4 px-4 text-base font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F7F9FC] dark:hover:bg-[#2c2c2e] transition-colors disabled:opacity-50 mb-3"
              style={{ fontFamily: 'Sarabun, sans-serif' }}
            >
              {googleLoading ? (
                <div className="w-5 h-5 border-2 border-[#e0e0e0] border-t-[#1B3A6B] rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
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

            {/* LINE login */}
            <button
              type="button"
              onClick={signInWithLine}
              disabled={blocked}
              className="w-full flex items-center justify-center gap-3 bg-[#06C755] hover:bg-[#05B34C] rounded-xl py-4 px-4 text-base font-semibold text-white transition-colors disabled:opacity-50 mb-4"
              style={{ fontFamily: 'Sarabun, sans-serif' }}
            >
              {lineLoading ? (
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                </svg>
              )}
              {isSignup
                ? (lang === 'th' ? 'สร้างบัญชีด้วย LINE' : 'Sign up with LINE')
                : (lang === 'th' ? 'เข้าสู่ระบบด้วย LINE' : 'Continue with LINE')}
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
                // No autoFocus: email is now the fallback method, and stealing
                // focus here would pop the phone keyboard over the one-tap buttons.
                disabled={blocked}
                style={{ fontSize: '16px' }}
                className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-3.5 text-[#1D1D1F] dark:text-[#F5F5F7] dark:bg-[#0D1F35] placeholder-[#aeaeb2] focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 transition-colors mb-4 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={blocked}
                className="w-full bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white py-4 rounded-xl font-bold text-base transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {lang === 'th' ? 'กำลังส่ง...' : 'Sending…'}
                  </>
                ) : isSignup ? (
                  lang === 'th' ? 'สร้างบัญชีด้วยอีเมล' : 'Create account with email'
                ) : (
                  lang === 'th' ? 'ส่งลิงก์เข้าสู่ระบบ' : 'Send sign-in link'
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
