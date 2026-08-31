'use client';

/**
 * The hydrated /auth form. Two ways in, and neither needs a password.
 *
 * LINE FIRST
 *   Most Thai students already have LINE open on the device. When app-to-app
 *   login can fire it is one tap, so it is the largest, greenest thing on the
 *   screen and it is first.
 *
 * EMAIL AS A SIX-DIGIT CODE, NOT A LINK
 *   Nearly all our traffic is inside the Facebook in-app browser. A link in an
 *   email opens in Chrome or Safari — a different browser with a different
 *   cookie jar — so the student lands somewhere else, signed out, with their
 *   /start answers gone. That round trip turned 79 Lead events into 10
 *   accounts, which is why the magic link was removed on 30 Aug.
 *
 *   A code does not leave the page. It is typed into the same webview that
 *   asked for it, so the session lands exactly where the student already is.
 *   That is the whole reason this exists, and it is why the email path is the
 *   one that must work inside a webview even when nothing else does. The same
 *   email still carries a link for anyone who would rather tap; lib/intake
 *   carries the /start answers across the browser boundary so that path no
 *   longer loses them either.
 *
 * The password field is gone. Existing password accounts sign in through the
 * same code — Supabase matches on the address — and nobody's credential is
 * deleted. /auth/reset still works for anyone holding an old link.
 */


import { useState, useEffect, useRef } from 'react';
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
import {
  buildEscapeUrl,
  detectInAppBrowser,
  type InAppBrowserInfo,
} from '@/lib/browser/inAppBrowser';
import { logFunnelEvent } from '@/lib/research/funnel';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import {
  isPlausibleEmail,
  normalizeEmail,
  normalizeOtpCode,
  classifyOtpError,
  likelyExpired,
  otpMessage,
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  type OtpErrorCode,
} from '@/lib/auth/otp';
import {
  INTAKE_PARAM,
  readStoredIntakeId,
  clearStoredIntakeId,
  isIntakeId,
} from '@/lib/intake/pendingIntake';

/**
 * Give up on any auth call after 20 seconds.
 *
 * A request that hangs forever behind a spinner is the worst outcome on a
 * congested mobile connection: the user cannot tell whether it is working, so
 * they wait, then leave. Failing in 20s with a Thai message that names the
 * cause is strictly better than an indefinite wait.
 */
const AUTH_TIMEOUT_MS = 20_000;

const THAI = { fontFamily: 'Sarabun, sans-serif' } as const;

/** navigator.onLine is unreliable as proof of connectivity, but a definite
 *  `false` is worth trusting: it saves a 20-second wait for a certain failure. */
function isDefinitelyOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function inAppContext(info: InAppBrowserInfo) {
  return {
    in_app_browser: info.isInApp,
    in_app_name:    info.app,
    google_blocked: info.googleBlocked,
    line_blocked:   info.lineAppToAppBlocked,
    platform:       info.platform,
  };
}

/** Reads a non-httpOnly cookie in the browser. */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// ─── Copy ─────────────────────────────────────────────────────────────────────

/**
 * Maps a failure code — from this form's own POST, or from an `?error=` a
 * callback route left behind — to student-facing copy.
 *
 * `tone` decides whether it renders as a failure or as information.
 * `reset_sent` is the case that matters: the student typed a password we could
 * not accept, and we have already emailed them a way in. Painting that red
 * reads as "you did something wrong" when the correct message is "check your
 * email, we have handled it".
 */
function authMessage(code: string, lang: string): { text: string; tone: 'error' | 'info' } {
  const th = lang === 'th';
  const error = (text: string) => ({ text, tone: 'error' as const });
  const info  = (text: string) => ({ text, tone: 'info'  as const });

  switch (code) {
    case 'reset_sent':
      return info(th
        ? 'อีเมลนี้มีบัญชีอยู่แล้ว เราส่งลิงก์ตั้งรหัสผ่านไปให้แล้ว เปิดอีเมลเพื่อตั้งรหัสผ่านใหม่'
        : 'This email already has an account. We have sent you a link to set a new password.');

    case 'google_account':
      return info(th
        ? 'บัญชีนี้สมัครด้วย Google กรุณาเข้าสู่ระบบด้วยปุ่ม Google'
        : 'This account uses Google. Please sign in with the Google button.');

    case 'line_account':
      return info(th
        ? 'บัญชีนี้สมัครด้วย LINE กรุณาเข้าสู่ระบบด้วยปุ่ม LINE'
        : 'This account uses LINE. Please sign in with the LINE button.');

    case 'weak_password':
      return error(th
        ? `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
        : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

    case 'invalid_email':
      return error(th ? 'กรุณากรอกอีเมลให้ถูกต้อง' : 'Please enter a valid email address.');

    case 'consent_required':
      return error(th
        ? 'กรุณายอมรับข้อกำหนดก่อนเข้าสู่ระบบ'
        : 'Please accept the terms before continuing.');

    case 'rate_limited':
      return error(th
        ? 'ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'
        : 'Too many attempts. Please wait a moment and try again.');

    // Only reachable if "Confirm email" is switched back on in Supabase. The
    // account exists; it just cannot sign in until the address is confirmed.
    case 'confirm_email':
      return info(th
        ? 'สร้างบัญชีแล้ว กรุณาเปิดอีเมลเพื่อยืนยันก่อนเข้าสู่ระบบ'
        : 'Account created. Please check your email to confirm before signing in.');

    case 'line_cancelled':
      return error(th ? 'ยกเลิกการเข้าสู่ระบบด้วย LINE' : 'LINE sign-in was cancelled.');

    case 'line_not_configured':
      return error(th
        ? 'ระบบ LINE ยังไม่พร้อมใช้งาน กรุณาสมัครด้วยอีเมลและรหัสผ่านแทน'
        : 'LINE login is not available. Please use email and password instead.');

    // LINE auto login failed and the retry failed too. LINE documents this as
    // indistinguishable from a CSRF attempt, so the copy points at the method
    // that always works rather than asking for a third attempt at the one that
    // just failed twice.
    case 'line_state_mismatch':
    case 'line_no_code':
    case 'line_no_id_token':
    case 'line_verify_failed':
    case 'line_nonce_mismatch':
    case 'line_no_sub':
    case 'line_token_exchange':
      return error(th
        ? 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ ลองสมัครด้วยอีเมลและรหัสผ่านได้เลย'
        : 'LINE sign-in failed. You can sign up with email and password instead.');

    case 'line_user_provisioning':
    case 'line_session_failed':
      return error(th
        ? 'สร้างบัญชีจาก LINE ไม่สำเร็จ กรุณาลองใหม่ หรือใช้อีเมลและรหัสผ่านแทน'
        : "Couldn't finish LINE sign-in. Please try again, or use email and password.");

    case 'link_invalid':
      return error(th
        ? 'ลิงก์นี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง'
        : 'This link has expired. Please request a new one.');

    // The callback was reached with no token and no code. Emphatically NOT an
    // expired link — saying so sent students round a loop requesting fresh
    // links that failed identically. Named separately for that reason.
    case 'no_credentials':
    case 'exchange_failed':
    case 'session_lost':
    case 'signup_failed':
      return error(th
        ? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
        : 'Sign-in failed. Please try again.');

    default:
      return error(th
        ? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
        : 'Sign-in failed. Please try again.');
  }
}

// ─── Form ─────────────────────────────────────────────────────────────────────

/** Codes lib/auth/otp.ts owns, so a redirect can carry one back to this page. */
const OTP_ERROR_CODES = new Set<string>([
  'invalid_email', 'code_invalid', 'code_expired', 'rate_limited',
  'consent_required', 'network', 'send_failed', 'verify_failed',
]);

/** Which half of the email flow is on screen. Never a separate page: navigating
 *  away and back is how a code gets lost on a bad connection. */
type Stage = 'choose' | 'code';

export default function AuthForm({ initialIab }: { initialIab: InAppBrowserInfo }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();
  const { lang }     = useLang();
  const th           = lang === 'th';

  const [stage, setStage] = useState<Stage>('choose');
  const [email, setEmail] = useState('');
  const [code,  setCode]  = useState('');

  const [sending,     setSending]     = useState(false);
  const [verifying,   setVerifying]   = useState(false);
  const [lineLoading, setLineLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message,     setMessage]     = useState<{ text: string; tone: 'error' | 'info' } | null>(null);
  const [consent,     setConsent]     = useState(false);
  const [iosHelp,     setIosHelp]     = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [hydrated,    setHydrated]    = useState(false);

  /** Seconds until "ส่งใหม่" becomes tappable again. */
  const [cooldown, setCooldown] = useState(0);
  /** When the current code was issued — lets a rejection be read as expiry. */
  const sentAtRef = useRef<number>(0);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const consentRef   = useRef<HTMLInputElement | null>(null);

  const [iab, setIab] = useState<InAppBrowserInfo>(initialIab);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.tundee.org';

  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
    ? rawNext
    : '/scholarships';

  const utmCampaign = searchParams.get('utm_campaign');

  const busy = sending || verifying || lineLoading || googleLoading;
  /** Spec: both entry points are disabled until the box is ticked. */
  const blocked = !consent;

  function fail(codeOrText: OtpErrorCode | string, raw = false) {
    setMessage({
      tone: 'error',
      text: raw ? codeOrText : otpMessage(codeOrText as OtpErrorCode, lang),
    });
  }

  // ── Carriers for the /start answers ─────────────────────────────────────────

  /** The preview payload, URL first — the only carrier that crosses browsers. */
  function guestSession(): string | null {
    const fromUrl = searchParams.get(PREVIEW_PARAM);
    if (fromUrl && decodePreviewInput(fromUrl)) return fromUrl;
    const fromCookie = readCookie(PREVIEW_COOKIE);
    return fromCookie && decodePreviewInput(fromCookie) ? fromCookie : null;
  }

  /**
   * Id of the answers parked server-side by /api/intake.
   *
   * This is the one that survives an email link opening in a different browser,
   * where neither the cookie nor `?p=` exists. URL first, then this browser's
   * own localStorage for the ordinary same-browser case.
   */
  function intakeId(): string | null {
    const fromUrl = searchParams.get(INTAKE_PARAM);
    if (isIntakeId(fromUrl)) return fromUrl;
    return readStoredIntakeId();
  }

  function recordConsent() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${CONSENT_COOKIE}=${CONSENT_VERSION}; Max-Age=${CONSENT_COOKIE_MAX_AGE}` +
      `; Path=/; SameSite=Lax${secure}`;
  }

  /** Where every redirect-based method comes back to, carrying everything. */
  function buildCallbackUrl(): string {
    const qs = new URLSearchParams({ next });
    qs.set(CONSENT_PARAM, CONSENT_VERSION);
    const preview = guestSession();
    if (preview) qs.set(PREVIEW_PARAM, preview);
    const intake = intakeId();
    if (intake) qs.set(INTAKE_PARAM, intake);
    if (utmCampaign) qs.set('utm_campaign', utmCampaign);
    return `${siteUrl}/auth/callback?${qs.toString()}`;
  }

  // ── Mount ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(next);
    });

    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(emailParam);

    // The no-JavaScript path round-trips through /api/auth/otp/send and comes
    // back here with ?stage=code. Honouring it means the shell and the hydrated
    // form show the same step for the same URL, so a student whose JavaScript
    // finally arrives mid-flow is not thrown back to the beginning.
    if (searchParams.get('stage') === 'code' && emailParam) {
      setStage('code');
      sentAtRef.current = Date.now();
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    }
    if (searchParams.get('sent') === '1') {
      setMessage({
        tone: 'info',
        text: lang === 'th' ? 'ส่งรหัสไปที่อีเมลของคุณแล้ว' : 'We have emailed you a code.',
      });
    }

    const err = searchParams.get('error');
    if (err) {
      // OTP failures carry their own Thai copy; anything else is a callback
      // code and belongs to authMessage.
      setMessage(
        OTP_ERROR_CODES.has(err)
          ? { tone: 'error', text: otpMessage(err as OtpErrorCode, lang) }
          : authMessage(err, lang),
      );
      logFunnelEvent({
        eventType: 'signup_failed',
        context: { reason: err, ...inAppContext(detectInAppBrowser()) },
      });
    }

    setHydrated(true);
    const info = detectInAppBrowser();
    setIab(info);
    logFunnelEvent({ eventType: 'signup_started', context: inAppContext(info) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Resend countdown. Cleared on unmount so a stale timer cannot fire. */
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // ── Email: send the code ────────────────────────────────────────────────────

  async function sendCode(isResend = false) {
    if (blocked) { setMessage({ tone: 'error', text: otpMessage('consent_required', lang) }); return; }

    const address = normalizeEmail(email);
    // Checked here so a typo costs nothing. A bad address that reaches Supabase
    // burns the 60-second cooldown before the student learns they mistyped.
    if (!isPlausibleEmail(address)) { fail('invalid_email'); return; }

    if (isDefinitelyOffline()) { fail('network'); return; }

    setSending(true);
    setMessage(null);
    recordConsent();

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: {
          // An account is created on first sight. Asking a 15-year-old whether
          // they already have one is asking them to remember something they
          // frequently do not, and an existing password account signs in
          // through this same call without losing its password.
          shouldCreateUser: true,
          emailRedirectTo:  buildCallbackUrl(),
        },
      });

      if (error) {
        const kind = classifyOtpError(error);
        fail(kind);
        logFunnelEvent({
          eventType: 'signup_failed',
          context: { reason: `otp_send:${kind}`, method: 'email_otp', ...inAppContext(iab) },
        });
        return;
      }

      sentAtRef.current = Date.now();
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setStage('code');
      setCode('');
      if (isResend) {
        setMessage({
          tone: 'info',
          text: th ? 'ส่งรหัสใหม่แล้ว' : 'A new code is on its way.',
        });
      }
      // Focus after paint, so the numeric keypad opens without a second tap.
      setTimeout(() => codeInputRef.current?.focus(), 60);
    } catch {
      fail('network');
      logFunnelEvent({
        eventType: 'signup_failed',
        context: { reason: 'otp_send:network', method: 'email_otp', ...inAppContext(iab) },
      });
    } finally {
      setSending(false);
    }
  }

  // ── Email: verify the code ──────────────────────────────────────────────────

  async function verifyCode(submitted?: string) {
    const token = normalizeOtpCode(submitted ?? code);
    if (token.length !== OTP_LENGTH) { fail('code_invalid'); return; }
    if (isDefinitelyOffline()) { fail('network'); return; }

    setVerifying(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: normalizeEmail(email),
        token,
        type: 'email',
      });

      if (error) {
        // Supabase returns the same string for a wrong code and an expired one,
        // so elapsed time decides which of the two the student is told — and
        // only the expiry copy names the button that fixes it.
        const kind = likelyExpired(sentAtRef.current, Date.now())
          ? 'code_expired'
          : classifyOtpError(error);
        fail(kind);
        setCode('');
        codeInputRef.current?.focus();
        logFunnelEvent({
          eventType: 'signup_failed',
          context: { reason: `otp_verify:${kind}`, method: 'email_otp', ...inAppContext(iab) },
        });
        return;
      }

      logFunnelEvent({
        eventType: 'signup_completed',
        context: { method: 'email_otp', ...inAppContext(iab) },
      });
      clearStoredIntakeId();

      // A full navigation, not router.push: the session cookies were just
      // written and the destination's server components must render with them.
      const qs = new URLSearchParams({ next });
      const intake = intakeId();
      if (intake) qs.set(INTAKE_PARAM, intake);
      const preview = guestSession();
      if (preview) qs.set(PREVIEW_PARAM, preview);
      qs.set(CONSENT_PARAM, CONSENT_VERSION);
      if (utmCampaign) qs.set('utm_campaign', utmCampaign);
      window.location.href = `/auth/callback?${qs.toString()}`;
    } catch {
      fail('network');
    } finally {
      setVerifying(false);
    }
  }

  // ── LINE ────────────────────────────────────────────────────────────────────

  function lineStartUrl(): string {
    const url = new URL('/api/auth/line/start', window.location.origin);
    url.searchParams.set('next', next);
    url.searchParams.set(CONSENT_PARAM, CONSENT_VERSION);
    const preview = guestSession();
    if (preview) url.searchParams.set(PREVIEW_PARAM, preview);
    const intake = intakeId();
    if (intake) url.searchParams.set(INTAKE_PARAM, intake);
    if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign);
    return url.toString();
  }

  /** Server-renderable equivalent, so the link has a real href before hydration. */
  const lineHref = (() => {
    const qs = new URLSearchParams({ next, [CONSENT_PARAM]: CONSENT_VERSION });
    if (utmCampaign) qs.set('utm_campaign', utmCampaign);
    const fromUrl = searchParams.get(INTAKE_PARAM);
    if (isIntakeId(fromUrl)) qs.set(INTAKE_PARAM, fromUrl);
    return `/api/auth/line/start?${qs.toString()}`;
  })();

  /**
   * Always a same-tab navigation, never window.open: popups are blocked on
   * mobile and inside every webview, and a blocked popup looks like a dead
   * button. Inside a third-party webview the flow is handed to Chrome first
   * (Android) — LINE's app-to-app login needs an App Link, which those webviews
   * block, and without it LINE falls back to its own email + password form,
   * which most Thai users cannot complete because they signed up by phone.
   */
  function signInWithLine() {
    if (blocked) { setMessage({ tone: 'error', text: otpMessage('consent_required', lang) }); return; }
    setMessage(null);
    recordConsent();

    const start = lineStartUrl();

    if (iab.lineAppToAppBlocked) {
      if (iab.platform === 'android') {
        const escape = buildEscapeUrl(start, 'android');
        if (escape) { setLineLoading(true); window.location.href = escape; return; }
      }
      // iOS cannot be escaped programmatically. Show the way out instead of
      // starting a flow that is guaranteed to dead-end.
      setIosHelp(true);
      return;
    }

    setLineLoading(true);
    window.location.href = start;
  }

  /** iOS fallback: hand them the URL so they can paste it into Safari. */
  async function copyLink() {
    const url = new URL(window.location.href);
    const preview = guestSession();
    if (preview) url.searchParams.set(PREVIEW_PARAM, preview);
    const intake = intakeId();
    if (intake) url.searchParams.set(INTAKE_PARAM, intake);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard is permission-gated in some webviews. Select-and-copy is the
      // only remaining route, so surface the URL rather than failing silently.
      setMessage({
        tone: 'info',
        text: th ? 'คัดลอกไม่ได้ กรุณากดค้างที่แถบที่อยู่เพื่อคัดลอก' : 'Copy blocked — long-press the address bar instead.',
      });
    }
  }

  // ── Google ──────────────────────────────────────────────────────────────────
  // Kept below the two methods the brief specifies, never above them, and never
  // rendered inside a webview: Google rejects those with disallowed_useragent on
  // its own domain, so the student never comes back and no error can be shown.
  async function signInWithGoogle() {
    if (blocked) { setMessage({ tone: 'error', text: otpMessage('consent_required', lang) }); return; }
    setGoogleLoading(true);
    setMessage(null);
    recordConsent();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: buildCallbackUrl() },
    });
    if (error) {
      setGoogleLoading(false);
      fail(th
        ? 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใช้ LINE หรืออีเมลแทนได้เลย'
        : 'Google sign-in failed. Try LINE or email instead.', true);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const banner = message && (
    <div
      role="alert"
      className={`mb-4 px-4 py-3 rounded-xl text-sm border ${
        message.tone === 'error'
          ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400'
          : 'bg-[#EBF2FF] dark:bg-[#0D1F35] border-[#C7DBFF] dark:border-[#1A2E4A] text-[#1B3A6B] dark:text-[#8FB4FF]'
      }`}
      style={{ ...THAI, lineHeight: 1.8 }}
    >
      {message.text}
    </div>
  );

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-6 sm:py-12">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
          <div className="h-1 bg-[#1B3A6B]" />
          <div className="px-6 sm:px-8 pt-7 pb-7">{children}</div>
        </div>
        <p className="text-center mt-4">
          <a href="/" className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={THAI}>
            ← {th ? 'กลับหน้าแรก' : 'Back to home'}
          </a>
        </p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Stage 2 — the code. Replaces the card's contents in place; navigating to a
  // separate page is how a code gets lost when the connection drops.
  // ══════════════════════════════════════════════════════════════════════════
  if (stage === 'code') {
    return shell(
      <>
        <h1 className="text-lg font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center mb-1" style={THAI}>
          {th ? 'ส่งรหัสไปที่' : 'Code sent to'}
        </h1>
        <p className="text-center text-sm font-semibold text-[#1B3A6B] dark:text-[#8FB4FF] mb-5 break-all" style={THAI}>
          {normalizeEmail(email)}
        </p>

        {banner}

        <label htmlFor="auth-code" className="sr-only">
          {th ? 'รหัส 6 หลัก' : 'Six-digit code'}
        </label>
        <input
          id="auth-code"
          ref={codeInputRef}
          value={code}
          onChange={(e) => {
            const v = normalizeOtpCode(e.target.value);
            setCode(v);
            setMessage(null);
            // Submit as soon as the sixth digit lands, including when iOS
            // autofills the whole code from the email in one go.
            if (v.length === OTP_LENGTH) void verifyCode(v);
          }}
          // inputMode brings up the numeric keypad; one-time-code is what lets
          // iOS offer the code from the email above the keyboard.
          inputMode="numeric"
          autoComplete="one-time-code"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          maxLength={OTP_LENGTH}
          placeholder="123456"
          disabled={verifying}
          // 16px minimum or iOS zooms the viewport on focus.
          style={{ ...THAI, fontSize: '28px', letterSpacing: '0.4em' }}
          className="w-full text-center border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-4 font-bold text-[#1D1D1F] dark:text-[#F5F5F7] dark:bg-[#0D1F35] placeholder-[#d0d0d5] focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 disabled:opacity-50 mb-4"
        />

        <button
          type="button"
          onClick={() => void verifyCode()}
          disabled={verifying || code.length !== OTP_LENGTH}
          className="w-full flex items-center justify-center gap-2 bg-[#1B3A6B] hover:bg-[#15305A] text-white font-bold rounded-xl min-h-[52px] transition-colors disabled:opacity-50"
          style={THAI}
        >
          {verifying && <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {th ? 'ยืนยัน' : 'Verify'}
        </button>

        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={() => { setStage('choose'); setCode(''); setMessage(null); }}
            className="text-xs text-[#1B3A6B] dark:text-[#8FB4FF] underline"
            style={THAI}
          >
            {th ? 'แก้อีเมล' : 'Change email'}
          </button>

          <button
            type="button"
            onClick={() => void sendCode(true)}
            disabled={cooldown > 0 || sending}
            className="text-xs text-[#1B3A6B] dark:text-[#8FB4FF] underline disabled:no-underline disabled:text-[#aeaeb2] dark:disabled:text-[#6e6e73]"
            style={THAI}
          >
            {cooldown > 0
              ? (th ? `ส่งใหม่ได้ในอีก ${cooldown} วินาที` : `Resend in ${cooldown}s`)
              : (th ? 'ส่งใหม่' : 'Resend')}
          </button>
        </div>

        <p className="text-center text-xs text-[#aeaeb2] dark:text-[#6e6e73] mt-5" style={{ ...THAI, lineHeight: 1.8 }}>
          {th ? 'หรือกดลิงก์ในอีเมลก็ได้' : 'Or just tap the link in the email.'}
        </p>
      </>,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Stage 1 — the choice. Order is fixed: heading, LINE, divider, email,
  // consent. Google sits below all of it, never between.
  // ══════════════════════════════════════════════════════════════════════════
  return shell(
    <>
      {/* 1 ── Heading */}
      <h1
        className="text-xl font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center mb-6 leading-snug"
        style={THAI}
      >
        {th ? 'เข้าสู่ระบบเพื่อดูทุนที่ตรงกับคุณ' : 'Sign in to see your matched scholarships'}
      </h1>

      {banner}

      {/* iOS inside a webview: LINE cannot be reached from here at all, so the
          way out is shown ABOVE the button rather than after a dead tap. */}
      {iosHelp && iab.platform !== 'android' && (
        <div className="mb-3 rounded-xl border border-[#C7DBFF] dark:border-[#1A2E4A] bg-[#EBF2FF] dark:bg-[#0D1F35] px-4 py-3">
          <p className="text-xs text-[#1B3A6B] dark:text-[#8FB4FF]" style={{ ...THAI, lineHeight: 1.8 }}>
            {th
              ? 'เพื่อใช้ LINE ให้กดจุด 3 จุดมุมขวาบน แล้วเลือก "เปิดใน Safari"'
              : 'To use LINE, tap the ••• at the top right and choose "Open in Safari".'}
          </p>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="mt-2 text-xs font-semibold text-white bg-[#1B3A6B] rounded-lg px-3 py-2"
            style={THAI}
          >
            {copied ? (th ? 'คัดลอกแล้ว ✓' : 'Copied ✓') : (th ? 'คัดลอกลิงก์' : 'Copy link')}
          </button>
          <p className="mt-2 text-xs text-[#6e6e73] dark:text-[#8e8e93]" style={{ ...THAI, lineHeight: 1.8 }}>
            {th
              ? 'หรือใช้อีเมลด้านล่างก็ได้ ใช้ได้เลยในหน้านี้ ไม่ต้องเปลี่ยนเบราว์เซอร์'
              : 'Or use email below — it works right here, no browser switch needed.'}
          </p>
        </div>
      )}

      {/* 2 ── LINE. The loudest thing on the screen, in every context. */}
      <a
        href={lineHref}
        onClick={(e) => { e.preventDefault(); signInWithLine(); }}
        aria-disabled={blocked || busy}
        className={`w-full flex items-center justify-center gap-3 rounded-xl min-h-[56px] px-4 text-base font-bold text-white transition-colors ${
          blocked || busy
            ? 'bg-[#06C755]/40 cursor-not-allowed'
            : 'bg-[#06C755] hover:bg-[#05B34C]'
        }`}
        style={THAI}
      >
        {lineLoading ? (
          <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
          </svg>
        )}
        {th ? 'เข้าสู่ระบบด้วย LINE' : 'Sign in with LINE'}
      </a>
      <p className="text-center text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-2 mb-5" style={THAI}>
        {th ? 'เร็วที่สุด ไม่ต้องจำรหัสผ่าน' : 'Fastest — no password to remember'}
      </p>

      {/* Android inside a webview: a real way out, one tap. */}
      {iab.lineAppToAppBlocked && iab.platform === 'android' && (
        <p className="text-center text-xs text-[#6e6e73] dark:text-[#8e8e93] -mt-3 mb-5" style={{ ...THAI, lineHeight: 1.8 }}>
          {th
            ? 'ปุ่ม LINE จะเปิดใน Chrome ให้อัตโนมัติ'
            : 'The LINE button will open Chrome for you.'}
        </p>
      )}

      {/* 3 ── Divider */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
        <span className="text-xs text-[#aeaeb2] dark:text-[#6e6e73] font-medium" style={THAI}>
          {th ? 'หรือ' : 'or'}
        </span>
        <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
      </div>

      {/* 4 ── Email. One field, no password. The only path that completes
              without ever leaving a webview, which is why it must never be
              behind anything that can fail. */}
      <form
        onSubmit={(e) => { e.preventDefault(); void sendCode(); }}
        noValidate={hydrated}
      >
        <label htmlFor="auth-email" className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5" style={THAI}>
          {th ? 'อีเมล' : 'Email'}
        </label>
        <input
          id="auth-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setMessage(null); }}
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          disabled={busy}
          style={{ ...THAI, fontSize: '16px' }}
          className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-3.5 text-[#1D1D1F] dark:text-[#F5F5F7] dark:bg-[#0D1F35] placeholder-[#aeaeb2] focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 transition-colors mb-3 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={blocked || busy}
          className="w-full flex items-center justify-center gap-2 bg-[#1B3A6B] hover:bg-[#15305A] text-white font-bold rounded-xl min-h-[52px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={THAI}
        >
          {sending && <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {th ? 'ส่งรหัสเข้าอีเมล' : 'Email me a code'}
        </button>
      </form>

      {/* 5 ── Consent. Gates both methods, per the brief.
              The reason this control is allowed to disable buttons — which is
              normally the wrong call, because a dead button reads as a broken
              page — is the standing hint directly beneath it. The student is
              never left guessing why nothing happened. */}
      <label className="flex items-start gap-3 mt-5 cursor-pointer select-none" style={THAI}>
        <input
          ref={consentRef}
          type="checkbox"
          name={CONSENT_PARAM}
          value={CONSENT_VERSION}
          checked={consent}
          onChange={(e) => { setConsent(e.target.checked); setMessage(null); }}
          className="mt-0.5 w-5 h-5 shrink-0 accent-[#1B3A6B] rounded"
        />
        <span className="text-xs leading-relaxed text-[#6E7A8A] dark:text-[#8e9bb0]">
          ฉันยอมรับ{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer"
             className="text-[#1B3A6B] dark:text-[#8FB4FF] underline">ข้อกำหนดการใช้งาน</a>
          {' '}และ{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer"
             className="text-[#1B3A6B] dark:text-[#8FB4FF] underline">นโยบายความเป็นส่วนตัว</a>
          {' '}และยินยอมให้ TunDee เก็บข้อมูลการศึกษาของฉันเพื่อแนะนำทุนที่ตรงกับฉัน
        </span>
      </label>

      {blocked && (
        <p className="mt-2 text-xs text-[#C2410C] dark:text-[#FDBA74] text-center" style={THAI}>
          {th ? 'กรุณายอมรับเงื่อนไขก่อน' : 'Please accept the terms first.'}
        </p>
      )}

      {/* Below everything the brief specifies, and absent inside a webview
          where Google rejects the user agent on its own domain. */}
      {!iab.googleBlocked && hydrated && (
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={blocked || busy}
          className="mt-5 w-full flex items-center justify-center gap-3 border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl min-h-[48px] px-4 text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F7F9FC] dark:hover:bg-[#2c2c2e] transition-colors disabled:opacity-50"
          style={THAI}
        >
          {googleLoading ? (
            <div className="w-5 h-5 border-2 border-[#e0e0e0] border-t-[#1B3A6B] rounded-full animate-spin" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {th ? 'เข้าสู่ระบบด้วย Google' : 'Continue with Google'}
        </button>
      )}

      <p className="text-center text-xs text-[#aeaeb2] dark:text-[#6e6e73] mt-5" style={THAI}>
        {th ? 'ฟรีตลอด ไม่มีค่าใช้จ่าย' : 'Always free.'}
      </p>
    </>,
  );
}
