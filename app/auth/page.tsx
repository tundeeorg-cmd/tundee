'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
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
  detectInAppBrowser,
  escapeToRealBrowserUrl,
  type InAppBrowserInfo,
} from '@/lib/browser/inAppBrowser';
import { logFunnelEvent } from '@/lib/research/funnel';
import AuthShell from './AuthShell';

/** Flattened for the funnel event context — one shape, logged identically
 *  on signup_started and signup_failed so the two are directly comparable. */
/** Verified against the live project: Supabase issues 6-digit codes. */

/**
 * Resend cooldown, derived rather than guessed. The project allows 30 emails
 * per hour, i.e. 3600/30 = 120s between sends at the sustained rate. Supabase
 * separately enforces a ~60s per-address cooldown, which this clears.
 */
const RESEND_COOLDOWN_SECONDS = 120;

/**
 * Give up on any auth call after 20 seconds.
 *
 * A request that hangs forever behind a spinner is the worst outcome on a
 * congested mobile connection: the user cannot tell whether it is working, so
 * they wait, then leave. Failing in 20s with a Thai message that names the
 * cause is strictly better than an indefinite wait.
 */
const AUTH_TIMEOUT_MS = 20_000;

/** Rejects with Error('timeout') so callers can show connection-specific copy. */
function withTimeout<T>(work: PromiseLike<T>, ms: number = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(work).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** navigator.onLine is unreliable as proof of connectivity, but a definite
 *  `false` is worth trusting: it saves a 20-second wait for a certain failure. */
function isDefinitelyOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Supabase reports its own remaining cooldown in a 429 message, e.g.
 * "you can only request this after 45 seconds". Prefer that over our constant:
 * it is the truth, and ours is only a derived opening bid.
 */
function retryAfterSeconds(message: string | undefined | null): number | null {
  const m = message?.match(/after (\d+)\s*seconds?/i);
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Every network call gets one. A spinner that never resolves is the worst
 *  outcome on a congested connection — worse than a clear failure. */
const NETWORK_TIMEOUT_MS = 15_000;

const THAI = { fontFamily: 'Sarabun, sans-serif' } as const;

/** fetch with an explicit deadline, so a hung request surfaces as Thai copy. */
async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function inAppContext(info: InAppBrowserInfo) {
  return {
    in_app_browser: info.isInApp,
    in_app_name:    info.app,
    google_blocked: info.googleBlocked,
    platform:       info.platform,
  };
}

// ─── Suspense wrapper ─────────────────────────────────────────────────────────
// useSearchParams() makes Next bail out of SSR for this subtree and render the
// fallback on the server instead. That fallback used to be a spinner, so the
// served HTML contained zero inputs and zero buttons: a student on a stalled
// 3G connection watched a spinner while ~240 KB of gzipped JavaScript arrived.
//
// AuthShell is a real, server-rendered page. Without any JavaScript the LINE
// button works (a plain <a>) and the email form works (a real POST to
// /api/auth/email-link). Hydration then replaces it with the richer form.

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthShell />}>
      <AuthForm />
    </Suspense>
  );
}

// ─── Error copy ───────────────────────────────────────────────────────────────

/** Maps an `?error=` code from a callback route to student-facing copy. */
function authErrorMessage(code: string, lang: string): string {
  const th = lang === 'th';
  switch (code) {
        case 'consent_required':
      return lang === 'th'
        ? 'กรุณายอมรับข้อกำหนดก่อนเข้าสู่ระบบ'
        : 'Please accept the terms before continuing.';
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
    // The link reached us but Supabase rejected the token. It reports expiry
    // and reuse identically, so this covers both without asserting which.
    case 'link_invalid':
      return th
        ? 'ลิงก์นี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง'
        : 'This link has expired. Please request a new one.';

    // The callback was reached with nothing usable — no token_hash, no code.
    // Emphatically NOT an expired link, and saying so sent users round a loop
    // requesting fresh links that failed identically.
    case 'invalid_email':
      return th
        ? 'กรุณากรอกอีเมลให้ถูกต้อง'
        : 'Please enter a valid email address.';

    case 'rate_limited':
      return th
        ? 'ขอลิงก์บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'
        : 'Too many requests. Please wait a moment and try again.';

    case 'send_failed':
      return th
        ? 'ส่งลิงก์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
        : 'Could not send. Please try again.';

    case 'no_credentials':
    case 'exchange_failed':
    case 'session_lost':
      return th
        ? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
        : 'Sign-in failed. Please try again.';

    default:
      return th
        ? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
        : 'Sign-in failed. Please try again.';
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

  // Embedded-webview state. Starts as "normal browser" so server and first
  // client render agree; the effect below corrects it. Erring toward showing
  // Google for one frame is better than hiding it from users who can use it.
  const [iab, setIab] = useState<InAppBrowserInfo>({
    isInApp: false, app: null, googleBlocked: false, platform: 'other',
  });

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

    // utm_campaign rides the callback URL for the same reason consent and the
    // preview answers do: an email magic link is routinely opened in a
    // DIFFERENT browser, where sessionStorage and cookies are both gone. It was
    // only ever stashed in sessionStorage, so every magic-link signup lost its
    // campaign and fell back to 'organic'.
    //
    // That mattered more than it looks: email is the one signup path that
    // reliably completes inside the Facebook in-app browser, so the loss was
    // concentrated in exactly the paid traffic recruitment_source is meant to
    // measure (PREREG §5.4).
    const utmCampaign = searchParams.get('utm_campaign');
    if (utmCampaign) qs.set('utm_campaign', utmCampaign);

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
  /**
   * Disabled only while a request is in flight — NOT on missing consent.
   *
   * Consent used to disable all four sign-in controls, so a visitor arriving from the
   * /start gate met two greyed-out buttons and a warning before doing anything wrong.
   * A dead button gives no feedback when tapped; people conclude the page is broken and
   * leave, which on paid traffic is the most expensive failure mode there is.
   *
   * The buttons are live now and `requireConsent()` below stops the action instead. That
   * is also stricter than what it replaces: consent was enforced by nothing but a
   * `disabled` attribute, which any devtools user could remove.
   */
  const blocked = busy;

  /** Set once a visitor tries to continue without ticking, so the hint is a response
   *  to something they did rather than a scold shown pre-emptively. */
  const [consentAttempted, setConsentAttempted] = useState(false);
  const consentRef = useRef<HTMLInputElement | null>(null);

  /**
   * The consent gate. Every sign-in path calls this first and bails if it returns false.
   * PDPA, and the callback writes consent_version + consent_at onto the profile.
   */
  function requireConsent(): boolean {
    if (consent) return true;
    setConsentAttempted(true);
    setError(lang === 'th'
      ? 'กรุณายอมรับข้อกำหนดก่อนเข้าสู่ระบบ'
      : 'Please accept the terms before continuing.');
    consentRef.current?.focus();
    consentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }

  useEffect(() => {
    // Already logged in → redirect
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(next);
    });

    // The no-JS form path (AuthShell -> /api/auth/email-link) redirects back
    // here with ?sent=1&email=... Recognise it, or a user whose JavaScript
    // arrives late sees an empty login form and assumes nothing was sent.
    const sentParam = searchParams.get('sent');
    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(emailParam);
    if (sentParam === '1') setSent(true);

    // Handle error params from callback
    const err = searchParams.get('error');
    if (err) {
      setError(authErrorMessage(err, lang));
      logFunnelEvent({
        eventType: 'signup_failed',
        context: { reason: err, ...inAppContext(detectInAppBrowser()) },
      });
    }

    // Detect the embedded webview and record it once per view. This is what
    // turns "we think OAuth is the problem" into a number: signup_started and
    // signup_failed both carry the in-app-browser flag, so the hypothesis can
    // be confirmed or killed from data rather than argued about.
    const info = detectInAppBrowser();
    setIab(info);
    logFunnelEvent({ eventType: 'signup_started', context: inAppContext(info) });
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
    if (!requireConsent()) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError(lang === 'th' ? 'กรุณากรอกอีเมลให้ถูกต้อง' : 'Please enter a valid email address.');
      return;
    }
    // A definite offline reading saves a 20-second wait for a certain failure.
    if (isDefinitelyOffline()) {
      setError(lang === 'th'
        ? 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาเชื่อมต่อแล้วลองใหม่'
        : 'No internet connection. Please connect and try again.');
      return;
    }

    setLoading(true);
    setError('');
    recordConsent();

    const callbackUrl = buildCallbackUrl();

    // Try our own Thai email first. It falls back to Supabase's built-in send
    // on ANY failure — missing keys, generateLink error, Resend outage — so a
    // problem there costs a user the Thai copy, never the ability to sign in.
    let otpError: { message: string } | null = null;
    let usedFallback = false;

    try {
      const controller = new AbortController();
      const abort = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
      const res = await fetch('/api/auth/email-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        // Consent travels in the body as well as in the cookie recordConsent() just
        // wrote. The cookie is the weaker carrier of the two here: this request is
        // made from inside the Facebook and TikTok webviews, where storage is
        // routinely partitioned or dropped, and the server refuses without it. The
        // value is honest — requireConsent() gated entry to this function, so the box
        // is ticked.
        body:    JSON.stringify({
          email: trimmed, redirectTo: callbackUrl, lang, [CONSENT_PARAM]: CONSENT_VERSION,
        }),
        signal:  controller.signal,
      });
      clearTimeout(abort);
      const body = await res.json().catch(() => ({ fallback: true }));

      // A consent refusal is final. It shares the 400 shape with invalid_email rather
      // than the fallback path, precisely so it cannot be retried around.
      if (res.status === 400 && body?.error === 'consent_required') {
        setLoading(false);
        // If the box is unticked, requireConsent() says so and focuses it.
        if (!requireConsent()) return;
        // Otherwise the box IS ticked and the server still refused, which means the
        // consent never arrived — a dropped cookie, and now a dropped body field too.
        // Before this branch existed the function simply returned: the student tapped
        // the button, nothing happened, and no message explained why. A dead control
        // on the one signup path that works inside a webview.
        setError(lang === 'th'
          ? 'ยืนยันการยอมรับไม่สำเร็จ กรุณาลองอีกครั้ง หรือเปิดหน้านี้ในเบราว์เซอร์'
          : 'We could not confirm your consent. Please try again, or open this page in your browser.');
        return;
      }

      if (res.status === 400 && body?.error === 'invalid_email') {
        setLoading(false);
        setError(lang === 'th' ? 'กรุณากรอกอีเมลให้ถูกต้อง' : 'Please enter a valid email address.');
        return;
      }
      usedFallback = body?.fallback !== false;
    } catch {
      // Includes the abort. Falling through to Supabase's own mailer is the
      // right move either way — it is a different host, so a stall on ours
      // does not imply a stall on theirs.
      usedFallback = true;
    }

    let timedOut = false;
    if (usedFallback) {
      try {
        const { error } = await withTimeout(supabase.auth.signInWithOtp({
          email: trimmed,
          options: {
            emailRedirectTo: callbackUrl,
            shouldCreateUser: true,
          },
        }));
        otpError = error;
      } catch {
        timedOut = true;
      }
    }

    setLoading(false);

    if (timedOut) {
      // The email is still in the field — never cleared on error. On these
      // connections a lost form field is a lost signup.
      setError(lang === 'th'
        ? 'การเชื่อมต่อช้าเกินไป กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง'
        : 'The connection is too slow. Check your internet and try again.');
      logFunnelEvent({
        eventType: 'signup_failed',
        context: { reason: 'timeout', method: 'email', ...inAppContext(iab) },
      });
      return;
    }

    if (otpError) {
      console.error('[TunDee] signInWithOtp:', otpError.message);
      logFunnelEvent({
        eventType: 'signup_failed',
        context: { reason: `otp:${otpError.message}`, method: 'email', ...inAppContext(iab) },
      });
      // A 429 is a cooldown, not a failure the user caused. Show the wait and
      // start the countdown from Supabase's own number rather than ours.
      const retry = retryAfterSeconds(otpError.message);
      if (retry !== null) {
        setCooldown(retry);
        setSent(true);
        setError(lang === 'th'
          ? 'ขอลิงก์บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'
          : 'Too many requests. Please wait a moment and try again.');
        return;
      }
      setError(lang === 'th'
        ? 'ส่งลิงก์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
        : 'Could not send. Please try again.');
      return;
    }
    setSent(true);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  // ── Resend ───────────────────────────────────────────────────────────────────
  async function resend() {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setError('');

    try {
      const { error: resendError } = await withTimeout(supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: buildCallbackUrl(), shouldCreateUser: true },
      }));

      if (resendError) {
        console.error('[TunDee] resend:', resendError.status, resendError.message);
        // Supabase puts the real remaining seconds in the message. Showing that
        // number beats inventing one, and keeps the countdown honest if the
        // project's rate limit changes later.
        if (resendError.status === 429) {
          setCooldown(retryAfterSeconds(resendError.message) ?? RESEND_COOLDOWN_SECONDS);
          setError('ขอลิงก์บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
        } else {
          setError('ส่งลิงก์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        }
        setLoading(false);
        return;
      }

      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError(
        !navigator.onLine
          ? 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาเชื่อมต่อแล้วลองใหม่'
          : 'การเชื่อมต่อช้าเกินไป กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง',
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  async function signInWithGoogle() {
    if (!requireConsent()) return;
    setGoogleLoading(true);
    setError('');
    recordConsent();
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: buildCallbackUrl() },
    });
    if (oauthErr) {
      // Was setError(oauthErr.message) — a raw English Supabase string shown to
      // Thai students. Note this only fires when the redirect fails to START;
      // a disallowed_useragent rejection happens on Google's domain, which is
      // why the button is hidden entirely inside a webview.
      logFunnelEvent({
        eventType: 'signup_failed',
        context: { reason: `google:${oauthErr.message}`, method: 'google', ...inAppContext(iab) },
      });
      setError(lang === 'th'
        ? 'เข้าสู่ระบบไม่สำเร็จ ลองสมัครด้วยอีเมลแทนได้เลย'
        : 'Sign-in failed. Try signing up with email instead.');
      setGoogleLoading(false);
    }
  }

  // ── LINE login ───────────────────────────────────────────────────────────────
  // Supabase has no LINE provider, so this goes through our own bridge route
  // (app/api/auth/line/*), which mints a Supabase session from a verified LINE
  // identity and then hands off to the same /auth/callback as every other method.
  function signInWithLine() {
    if (!requireConsent()) return;
    setLineLoading(true);
    setError('');
    recordConsent();
    // Consent in the query string as well as the cookie, for the same reason as the
    // magic link above: LINE is the primary method for webview traffic, and
    // /api/auth/line/start refuses without consent. Google already carries it —
    // buildCallbackUrl() puts it in the OAuth redirect — so this closes the last path
    // that depended on the cookie alone.
    const lineStart = new URL('/api/auth/line/start', window.location.origin);
    lineStart.searchParams.set('next', next);
    lineStart.searchParams.set(CONSENT_PARAM, CONSENT_VERSION);
    window.location.href = lineStart.toString();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUCCESS STATE email sent
  // ════════════════════════════════════════════════════════════════════════════

  // ── Code entry ──────────────────────────────────────────────────────────────
  // Replaces the old "check your email" screen. A link forces the user out of
  // this browser and into Gmail's WebView, and that switch is what broke
  // sign-in: PKCE's code_verifier lives in the browser that asked for the link.
  // A code typed into the tab they are already on has no switch to break.
  // ── "check your email" ──────────────────────────────────────────────────────
  // A link, not a code. Asking a student to transcribe six digits from a mail
  // app back into a browser tab is a step where people stop; the link removes
  // it. The link is safe to open in ANY browser because /auth/callback verifies
  // a token_hash server-side and needs nothing from the device that asked.
  if (sent) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
            <div className="h-1 bg-[#1B3A6B]" />
            <div className="px-6 py-8">
              <h1
                className="text-center text-xl font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-3"
                style={{ ...THAI, lineHeight: 1.8 }}
              >
                เราส่งลิงก์ไปที่อีเมลของคุณแล้ว
              </h1>

              <p
                className="text-center text-base text-[#3C4A5A] dark:text-[#aeaeb2] mb-6"
                style={{ ...THAI, lineHeight: 1.9 }}
              >
                เปิดอีเมล {email} แล้วกดลิงก์เพื่อเข้าสู่ระบบ
              </p>

              {error && (
                <p
                  className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-sm text-red-600 dark:text-red-400"
                  style={{ ...THAI, lineHeight: 1.8 }}
                  role="alert"
                >
                  {error}
                </p>
              )}

              {/* 48px minimum height on every control: Android accessibility
                  guidance, and these are thumbs on a phone in a classroom. */}
              <button
                type="button"
                onClick={resend}
                disabled={cooldown > 0 || loading}
                className="w-full min-h-[56px] rounded-xl border-2 border-[#1B3A6B] text-[#1B3A6B] dark:text-[#8FB4FF] dark:border-[#8FB4FF] font-bold text-base disabled:opacity-50"
                style={THAI}
              >
                {loading
                  ? 'กำลังส่ง...'
                  : cooldown > 0
                    ? `ส่งลิงก์อีกครั้ง (${cooldown})`
                    : 'ส่งลิงก์อีกครั้ง'}
              </button>

              <button
                type="button"
                onClick={() => { setSent(false); setError(''); }}
                className="w-full min-h-[48px] mt-2 text-base text-[#6E7A8A] dark:text-[#8e9bb0]"
                style={THAI}
              >
                ใช้อีเมลอื่น
              </button>

              <p
                className="mt-4 text-center text-sm text-[#6E7A8A] dark:text-[#8e9bb0]"
                style={{ ...THAI, lineHeight: 1.8 }}
              >
                ไม่พบอีเมล? กรุณาตรวจสอบในโฟลเดอร์จดหมายขยะ (Spam)
              </p>
            </div>
          </div>
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
                ref={consentRef}
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  setError('');
                  if (e.target.checked) setConsentAttempted(false);
                }}
                className={`mt-0.5 w-5 h-5 shrink-0 accent-[#1B3A6B] rounded ${
                  consentAttempted && !consent
                    ? 'ring-2 ring-offset-2 ring-red-500 dark:ring-offset-[#0A1628]'
                    : ''
                }`}
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
            {/* Shown only after a blocked attempt. It used to render whenever the box
                was unticked — i.e. immediately on arrival — so the first thing a visitor
                from an ad read was an instruction they had not yet had a chance to
                disobey, above two buttons that looked broken. */}
            {consentAttempted && !consent && (
              <p
                className="mb-4 text-xs font-semibold text-red-600 dark:text-red-400"
                style={{ fontFamily: 'Sarabun, sans-serif' }}
              >
                {lang === 'th'
                  ? 'กรุณายอมรับข้อกำหนดก่อนเข้าสู่ระบบ'
                  : 'Please accept the terms before continuing.'}
              </p>
            )}

            {/* Auth methods. flex-col so the order can change: inside an
                embedded webview email leads, because it is the only method
                that reliably completes there. Children are all w-full, so
                flex-col lays out identically to block otherwise. */}
            <div className="flex flex-col">

            {/* Google OAuth — NOT rendered inside an embedded webview.
                Google rejects those with disallowed_useragent on its own
                domain, so the user never returns and no error can be shown.
                A button that cannot work is worse than no button. */}
            {!iab.googleBlocked && (
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={blocked}
              className="w-full flex items-center justify-center gap-3 border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl py-4 px-4 text-base font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F7F9FC] dark:hover:bg-[#2c2c2e] transition-colors disabled:opacity-50 mb-3 order-4"
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
            )}

            {/* LINE login. Kept in an embedded webview: LINE Login is ordinary
                web OAuth on line.me and is not subject to Google's policy. */}
            <button
              type="button"
              onClick={signInWithLine}
              disabled={blocked}
              className={`w-full flex items-center justify-center gap-3 bg-[#06C755] hover:bg-[#05B34C] rounded-xl py-4 px-4 text-base font-semibold text-white transition-colors disabled:opacity-50 mb-4 order-1`}
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

            {/* Divider — order-3, so it separates the two reliable methods above from
                Google below, and rendered ONLY when Google is. Inside an embedded
                webview Google is hidden, and a "หรือ" with nothing beneath it reads as a
                broken page rather than a choice. */}
            {!iab.googleBlocked && (
              <div className="flex items-center gap-3 mb-4 order-3">
                <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
                <span className="text-xs text-[#aeaeb2] dark:text-[#6e6e73] font-medium">
                  {lang === 'th' ? 'หรือ' : 'or'}
                </span>
                <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
              </div>
            )}

            {/* Magic link — order-2, immediately under LINE.
                It used to sit below a "หรือ" divider, which framed it as the fallback.
                It is not: email is the only method that completes reliably inside the
                Facebook and TikTok webviews this traffic arrives in, where Google is
                hidden outright. Same visual weight as LINE, no separator above it. */}
            <form onSubmit={sendMagicLink} noValidate className="order-2 mb-4">
              <label className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5">
                {lang === 'th' ? 'หรือใช้อีเมล' : 'Or use your email'}
              </label>
              <p
                className="text-xs text-[#8A96A8] dark:text-[#7A8FA8] mb-2.5"
                style={{ fontFamily: 'Sarabun, sans-serif' }}
              >
                {lang === 'th'
                  ? 'ไม่ต้องตั้งรหัสผ่าน เราส่งลิงก์เข้าสู่ระบบให้ทางอีเมล'
                  : 'No password — we email you a sign-in link'}
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                // Still no autoFocus, even though email is now promoted: stealing focus
                // pops the phone keyboard over the LINE button directly above it, which
                // costs the one-tap path more than it gains this one.
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
                ) : (
                  lang === 'th' ? 'ส่งลิงก์เข้าสู่ระบบ' : 'Send sign-in link'
                )}
              </button>
            </form>

            {/* Escape hatch, shown only where Google is unreachable. Android
                can be handed to Chrome with an intent:// URL. iOS cannot —
                Safari is not launchable from inside a webview — so it gets
                instructions instead of a link that would do nothing. */}
            {iab.googleBlocked && (
              <div className="order-5 mt-4 rounded-xl border border-[#e0e0e0] dark:border-[#3a3a3c] bg-[#F7F9FC] dark:bg-[#0D1F35] px-4 py-3">
                <p
                  className="text-xs text-[#6e6e73] dark:text-[#aeaeb2] leading-relaxed"
                  style={{ fontFamily: 'Sarabun, sans-serif' }}
                >
                  {lang === 'th'
                    ? 'เปิดในเบราว์เซอร์เพื่อเข้าสู่ระบบด้วย Google'
                    : 'Open in your browser to sign in with Google'}
                </p>

                {iab.platform === 'android' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const url = escapeToRealBrowserUrl(window.location.href, 'android');
                      if (url) window.location.href = url;
                    }}
                    className="mt-2 text-xs font-semibold text-[#1B3A6B] dark:text-[#8FB4FF] underline"
                    style={{ fontFamily: 'Sarabun, sans-serif' }}
                  >
                    {lang === 'th' ? 'เปิดใน Chrome' : 'Open in Chrome'}
                  </button>
                ) : (
                  <p
                    className="mt-1 text-xs text-[#8e8e93]"
                    style={{ fontFamily: 'Sarabun, sans-serif' }}
                  >
                    {lang === 'th'
                      ? 'แตะปุ่ม ••• มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์"'
                      : 'Tap ••• at the top right, then choose "Open in browser".'}
                  </p>
                )}

                <p
                  className="mt-2 text-xs text-[#6e6e73] dark:text-[#aeaeb2]"
                  style={{ fontFamily: 'Sarabun, sans-serif' }}
                >
                  {lang === 'th'
                    ? 'หรือสมัครด้วยอีเมล ใช้เวลา 30 วินาที'
                    : 'Or sign up with email — takes 30 seconds'}
                </p>
              </div>
            )}

            </div>

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
