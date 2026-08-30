'use client';

/**
 * The hydrated /auth form.
 *
 * Two layouts, chosen by what the browser can actually do:
 *
 *   Inside a third-party webview (Facebook, Instagram, TikTok, Messenger)
 *     Email + password leads. It is the only method that completes there,
 *     because it never leaves the page. Google is not rendered at all — a
 *     button guaranteed to fail is worse than no button. LINE is kept, but
 *     tapping it escapes to Chrome first (Android) or explains how to escape
 *     (iOS), rather than walking the student into LINE's password form.
 *
 *   In a real browser, or inside LINE's own webview
 *     LINE leads and Google follows, because both are one tap. Email + password
 *     stays available underneath as the secondary option.
 *
 * Nothing here blocks anyone: every path is reachable in every context, and
 * email + password works everywhere for anyone who does not want to switch
 * browsers.
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

/**
 * Non-blocking password strength hint.
 *
 * A hint, not a rule. Character-class requirements do not survive contact with
 * a 15-year-old on a phone keyboard — they produce abandoned signups and, among
 * those who persist, passwords written on paper. Length is what actually
 * matters, so length is what we ask for and everything else is advice.
 */
function passwordHint(pw: string, lang: string): { text: string; level: 0 | 1 | 2 } | null {
  if (!pw) return null;
  const th = lang === 'th';
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return {
      level: 0,
      text: th
        ? `อีก ${MIN_PASSWORD_LENGTH - pw.length} ตัวอักษร`
        : `${MIN_PASSWORD_LENGTH - pw.length} more characters`,
    };
  }
  if (pw.length >= 12 || /[^a-zA-Z0-9]/.test(pw) || (/[a-zA-Z]/.test(pw) && /\d/.test(pw))) {
    return { level: 2, text: th ? 'รหัสผ่านดีแล้ว' : 'Strong password' };
  }
  return { level: 1, text: th ? 'ใช้ได้ ถ้ายาวกว่านี้จะดีขึ้น' : 'OK — longer is better' };
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export default function AuthForm({ initialIab }: { initialIab: InAppBrowserInfo }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();
  const { lang }     = useLang();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);

  const [submitting,    setSubmitting]    = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [lineLoading,   setLineLoading]   = useState(false);
  const [message,       setMessage]       = useState<{ text: string; tone: 'error' | 'info' } | null>(null);
  const [consent,       setConsent]       = useState(false);
  const [iosHelp,       setIosHelp]       = useState(false);

  /**
   * False until the effect below runs, i.e. false in the server-rendered HTML
   * and in any browser that never executes our JavaScript.
   *
   * This component IS server-rendered — the page is force-dynamic, so Next does
   * not bail out to the Suspense fallback — which means the markup it produces
   * is the markup a student on a stalled 3G connection actually gets. So the
   * markup has to work on its own: the form below is a real POST with real
   * field names, and only the controls that genuinely cannot work without
   * JavaScript are held back until this flips.
   */
  const [hydrated, setHydrated] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  /**
   * Seeded from the server's reading of the User-Agent, so the first painted
   * frame is already correct. The effect below re-checks on the client only as
   * a safety net for edge caches that might strip or normalise the header.
   */
  const [iab, setIab] = useState<InAppBrowserInfo>(initialIab);

  const isSignup = searchParams.get('from') === 'signup';
  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.tundee.org';

  // Post-login destination. Visitors arriving from the /start preview carry
  // `next=/scholarships?from=preview` so they land on their own matched results
  // instead of a generic list. Same-origin paths only.
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
    ? rawNext
    : '/scholarships';

  const utmCampaign = searchParams.get('utm_campaign');

  /**
   * The visitor's /start answers, preferring the URL over the cookie.
   *
   * The URL wins because it is the only carrier that survives a jump between
   * browsers. Someone who escaped the Facebook webview into Chrome arrives with
   * `?p=` and an empty cookie jar; reading the cookie first would find nothing
   * and re-ask them their grade, GPA and province.
   */
  function guestSession(): string | null {
    const fromUrl = searchParams.get(PREVIEW_PARAM);
    if (fromUrl && decodePreviewInput(fromUrl)) return fromUrl;
    const fromCookie = readCookie(PREVIEW_COOKIE);
    return fromCookie && decodePreviewInput(fromCookie) ? fromCookie : null;
  }

  const busy = submitting || googleLoading || lineLoading;

  /**
   * Controls are disabled only while a request is in flight — NOT on missing
   * consent. A dead button gives no feedback when tapped; people conclude the
   * page is broken and leave, which on paid traffic is the most expensive
   * failure mode there is. requireConsent() stops the action instead, which is
   * also stricter: `disabled` is removable from devtools, and every route
   * enforces consent server-side regardless.
   */
  const [consentAttempted, setConsentAttempted] = useState(false);
  const consentRef = useRef<HTMLInputElement | null>(null);

  function requireConsent(): boolean {
    if (consent) return true;
    setConsentAttempted(true);
    setMessage(authMessage('consent_required', lang));
    consentRef.current?.focus();
    consentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }

  /** Records consent for the redirect-based methods, which return to this browser. */
  function recordConsent() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${CONSENT_COOKIE}=${CONSENT_VERSION}; Max-Age=${CONSENT_COOKIE_MAX_AGE}` +
      `; Path=/; SameSite=Lax${secure}`;
  }

  /**
   * The OAuth return URL. Consent and the /start answers ride in the query
   * string as well as in cookies, because a webview's cookie jar is routinely
   * partitioned and because the callback has to be able to write a complete
   * profile from the URL alone.
   */
  function buildCallbackUrl(): string {
    const qs = new URLSearchParams({ next });
    qs.set(CONSENT_PARAM, CONSENT_VERSION);
    const preview = guestSession();
    if (preview) qs.set(PREVIEW_PARAM, preview);
    if (utmCampaign) qs.set('utm_campaign', utmCampaign);
    return `${siteUrl}/auth/callback?${qs.toString()}`;
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(next);
    });

    // The no-JS form path redirects back here with ?error=…&email=… Recognise
    // it, or a student whose JavaScript arrived late sees an empty form and no
    // explanation of what happened to their last attempt.
    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(emailParam);

    const err = searchParams.get('error');
    if (err) {
      setMessage(authMessage(err, lang));
      logFunnelEvent({
        eventType: 'signup_failed',
        context: { reason: err, ...inAppContext(detectInAppBrowser()) },
      });
    }

    setHydrated(true);
    // Native validation is switched off only once JavaScript is confirmed
    // present, so a no-JS submission is still stopped by `required` on the
    // consent box while a hydrated one gets requireConsent()'s Thai message
    // instead of a browser tooltip.
    if (formRef.current) formRef.current.noValidate = true;

    // Safety net only — the server already resolved this from the request UA.
    const info = detectInAppBrowser();
    setIab(info);
    logFunnelEvent({ eventType: 'signup_started', context: inAppContext(info) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Email + password ────────────────────────────────────────────────────────
  /**
   * One submit for both signing up and signing in.
   *
   * There is no mode toggle, because asking a student whether they already have
   * an account is asking them to remember something they frequently do not. The
   * route tries to create the account, falls back to signing in, and — if that
   * fails too — emails them a way back in. Every outcome ends somewhere useful.
   */
  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!requireConsent()) return;

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setMessage(authMessage('invalid_email', lang));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(authMessage('weak_password', lang));
      return;
    }
    // A definite offline reading saves a 20-second wait for a certain failure.
    if (isDefinitelyOffline()) {
      setMessage({
        tone: 'error',
        text: lang === 'th'
          ? 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาเชื่อมต่อแล้วลองใหม่'
          : 'No internet connection. Please connect and try again.',
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    recordConsent();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

    try {
      const res = await fetch('/api/auth/password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:            trimmed,
          password,
          next,
          [CONSENT_PARAM]:  CONSENT_VERSION,
          [PREVIEW_PARAM]:  guestSession() ?? '',
          utm_campaign:     utmCampaign ?? '',
        }),
        signal: controller.signal,
      });

      const body = await res.json().catch(() => null);

      if (res.ok && body?.redirect) {
        // A full navigation, not router.push: the session cookies were just set
        // on this response, and the server components on the destination have
        // to be rendered with them.
        window.location.href = body.redirect;
        return;
      }

      const code = typeof body?.error === 'string' ? body.error : 'signup_failed';
      setMessage(authMessage(code, lang));
      logFunnelEvent({
        eventType: 'signup_failed',
        context: { reason: code, method: 'password', ...inAppContext(iab) },
      });
      // The password is cleared only when it cannot possibly be right; the
      // email never is. On these connections a lost form field is a lost signup.
      if (code === 'reset_sent' || code === 'google_account' || code === 'line_account') {
        setPassword('');
      }
    } catch {
      setMessage({
        tone: 'error',
        text: lang === 'th'
          ? 'การเชื่อมต่อช้าเกินไป กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง'
          : 'The connection is too slow. Check your internet and try again.',
      });
      logFunnelEvent({
        eventType: 'signup_failed',
        context: { reason: 'timeout', method: 'password', ...inAppContext(iab) },
      });
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  async function signInWithGoogle() {
    if (!requireConsent()) return;
    setGoogleLoading(true);
    setMessage(null);
    recordConsent();
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: buildCallbackUrl() },
    });
    if (oauthErr) {
      // Only fires when the redirect fails to START; a disallowed_useragent
      // rejection happens on Google's domain, which is why the button is not
      // rendered at all inside a webview.
      logFunnelEvent({
        eventType: 'signup_failed',
        context: { reason: `google:${oauthErr.message}`, method: 'google', ...inAppContext(iab) },
      });
      setMessage({
        tone: 'error',
        text: lang === 'th'
          ? 'เข้าสู่ระบบไม่สำเร็จ ลองสมัครด้วยอีเมลและรหัสผ่านแทนได้เลย'
          : 'Sign-in failed. Try signing up with email and password instead.',
      });
      setGoogleLoading(false);
    }
  }

  // ── LINE login ───────────────────────────────────────────────────────────────
  /** The authorize entry point, carrying everything the callback will need. */
  function lineStartUrl(): string {
    const url = new URL('/api/auth/line/start', window.location.origin);
    url.searchParams.set('next', next);
    url.searchParams.set(CONSENT_PARAM, CONSENT_VERSION);
    const preview = guestSession();
    if (preview) url.searchParams.set(PREVIEW_PARAM, preview);
    if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign);
    return url.toString();
  }

  /**
   * The same URL as lineStartUrl(), but relative and buildable during a server
   * render — window is not available there, and the link has to have a real
   * href in the served HTML for the no-JavaScript case.
   */
  const lineHref = (() => {
    const qs = new URLSearchParams({ next, [CONSENT_PARAM]: CONSENT_VERSION });
    if (utmCampaign) qs.set('utm_campaign', utmCampaign);
    return `/api/auth/line/start?${qs.toString()}`;
  })();

  /**
   * Supabase has no LINE provider, so this goes through our own bridge route
   * (app/api/auth/line/*), which mints a Supabase session from a verified LINE
   * identity and hands off to the same /auth/callback as Google.
   *
   * Inside a third-party webview, starting the flow here would walk the student
   * straight into LINE's email + password form: app-to-app login needs a
   * Universal Link or App Link to fire, and those webviews block them. So the
   * button escapes to Chrome first, where the handoff genuinely works. On iOS
   * nothing can be launched programmatically, so it shows the way out instead
   * of starting a flow that is guaranteed to dead-end.
   */
  function signInWithLine() {
    if (!requireConsent()) return;
    setMessage(null);
    recordConsent();

    const start = lineStartUrl();

    if (iab.lineAppToAppBlocked) {
      if (iab.platform === 'android') {
        const escape = buildEscapeUrl(start, 'android');
        if (escape) { setLineLoading(true); window.location.href = escape; return; }
      }
      setIosHelp(true);
      return;
    }

    setLineLoading(true);
    window.location.href = start;
  }

  /** Reopen THIS page in Chrome, carrying the guest session and campaign with it. */
  function escapeToBrowser() {
    const url = buildEscapeUrl(window.location.href, 'android', {
      [PREVIEW_PARAM]: guestSession(),
      utm_campaign:    utmCampaign,
      next,
    });
    if (url) window.location.href = url;
    else setIosHelp(true);
  }

  // Layout: inside a third-party webview email leads, because it is the only
  // method that completes there. Elsewhere LINE and Google lead. The children
  // are all w-full, so flex-col lays out identically to block either way.
  const webview = iab.lineAppToAppBlocked;
  const hint = passwordHint(password, lang);

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-6 sm:py-12">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
          <div className="h-1 bg-[#1B3A6B]" />

          {/* Header. Compact inside a webview, where every pixel above the
              primary action is a pixel of scrolling on a 360×640 screen. */}
          <div className={`text-center ${webview ? 'px-6 pt-5 pb-3' : 'px-8 pt-8 pb-6'}`}>
            <a href="/">
              <div
                className={`font-bold text-[#1D1D1F] dark:text-white ${webview ? 'text-xl' : 'text-3xl mb-1'}`}
                style={THAI}
              >
                ทุนดี
              </div>
              {!webview && (
                <div
                  className="text-[10px] text-[#aeaeb2] dark:text-[#6e6e73] tracking-[3px] uppercase mb-3"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                >
                  TUNDEE.ORG
                </div>
              )}
            </a>
            <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={THAI}>
              {isSignup
                ? (lang === 'th' ? 'สร้างบัญชีฟรี เพื่อดูทุนที่ตรงกับคุณ' : 'Create a free account to see your matches')
                : (lang === 'th' ? 'ค้นหาทุนการศึกษาที่เหมาะกับคุณ' : 'Find the scholarship you deserve')}
            </p>
          </div>

          <div className={`${webview ? 'px-6 pb-6' : 'px-8 pb-8'}`}>

            {message && (
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
            )}

            {/* One form around everything, so the page works with no JavaScript.
                The email + password submit is a real POST to the same route the
                hydrated client fetches, the consent box is a real named field
                the server reads, and the LINE control is a real link. Only the
                Google button is withheld until hydration, because OAuth is
                started by a JavaScript call and a button that cannot work is
                worse than no button. */}
            <form
              ref={formRef}
              method="POST"
              action="/api/auth/password"
              onSubmit={submitPassword}
            >
              <input type="hidden" name="next" value={next} />
              {/* Read only when the browser submits natively; a hydrated submit
                  is intercepted before any of these fields are serialised. */}
              <input type="hidden" name="noscript" value="1" />
              {/* The URL param only, never the cookie: this value has to be
                  identical on the server and on the client's first render, and
                  document.cookie exists only on one of them. Nothing is lost —
                  a same-browser signup still carries its answers in the cookie,
                  which the server reads directly, and the cross-browser case is
                  exactly the one that arrives with the param. */}
              <input type="hidden" name={PREVIEW_PARAM} value={searchParams.get(PREVIEW_PARAM) ?? ''} />
              <input type="hidden" name="utm_campaign" value={utmCampaign ?? ''} />

            {/* ── PDPA consent ───────────────────────────────────────────────
                Inline here rather than as step 0 of /profile/setup: with consent
                in hand at signup time the profile can be written server-side and
                the student sent straight to their matches, instead of through a
                wizard that re-asks what /start already collected. */}
            <label className="flex items-start gap-3 mb-3 cursor-pointer select-none" style={THAI}>
              <input
                ref={consentRef}
                type="checkbox"
                name={CONSENT_PARAM}
                value={CONSENT_VERSION}
                required
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  setMessage(null);
                  if (e.target.checked) setConsentAttempted(false);
                }}
                className={`mt-0.5 w-5 h-5 shrink-0 accent-[#1B3A6B] rounded ${
                  consentAttempted && !consent
                    ? 'ring-2 ring-offset-2 ring-red-500 dark:ring-offset-[#0A1628]'
                    : ''
                }`}
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

            <div className="flex flex-col">

              {/* ── Email + password ──────────────────────────────────────────
                  order-1 inside a webview: the only method that completes there.
                  order-5 elsewhere, under the two one-tap providers. */}
              <div className={`mb-4 ${webview ? 'order-1' : 'order-5'}`}>
                {!webview && (
                  <label className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={THAI}>
                    {lang === 'th' ? 'หรือใช้อีเมลและรหัสผ่าน' : 'Or use email and password'}
                  </label>
                )}

                <label htmlFor="auth-email" className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5" style={THAI}>
                  {lang === 'th' ? 'อีเมล' : 'Email'}
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
                  // 16px minimum: anything smaller makes iOS and several Android
                  // browsers zoom the viewport on focus.
                  style={{ ...THAI, fontSize: '16px' }}
                  className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-3.5 text-[#1D1D1F] dark:text-[#F5F5F7] dark:bg-[#0D1F35] placeholder-[#aeaeb2] focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 transition-colors mb-3 disabled:opacity-50"
                />

                <label htmlFor="auth-password" className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5" style={THAI}>
                  {lang === 'th' ? 'รหัสผ่าน' : 'Password'}
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setMessage(null); }}
                    // "new-password" on a field that also signs existing users in
                    // is deliberate: it prompts the password manager to OFFER to
                    // save, which is what a first-time student needs most.
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    disabled={busy}
                    style={{ ...THAI, fontSize: '16px' }}
                    className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl pl-4 pr-16 py-3.5 text-[#1D1D1F] dark:text-[#F5F5F7] dark:bg-[#0D1F35] placeholder-[#aeaeb2] focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 transition-colors disabled:opacity-50"
                  />
                  {/* Shown, not hidden. A student typing a password they have
                      just invented on a phone keyboard needs to see it, and the
                      alternative is a typo they cannot diagnose. */}
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#1B3A6B] dark:text-[#8FB4FF] px-1 py-2"
                    style={THAI}
                  >
                    {showPw ? (lang === 'th' ? 'ซ่อน' : 'Hide') : (lang === 'th' ? 'แสดง' : 'Show')}
                  </button>
                </div>

                <p
                  className={`mt-1.5 mb-3 text-xs ${
                    hint?.level === 0 ? 'text-[#8A96A8]'
                      : hint?.level === 1 ? 'text-[#D97706]'
                      : hint?.level === 2 ? 'text-[#0F8A4C]'
                      : 'text-[#8A96A8]'
                  }`}
                  style={THAI}
                >
                  {hint
                    ? hint.text
                    : (lang === 'th'
                        ? `อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
                        : `At least ${MIN_PASSWORD_LENGTH} characters`)}
                </p>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[56px] bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white rounded-xl font-bold text-base transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  style={THAI}
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {lang === 'th' ? 'กำลังดำเนินการ...' : 'Working…'}
                    </>
                  ) : (
                    lang === 'th' ? 'สมัคร / เข้าสู่ระบบ' : 'Sign up or sign in'
                  )}
                </button>

                <p className="mt-2 text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8]" style={THAI}>
                  {lang === 'th'
                    ? 'ไม่ต้องยืนยันอีเมล เข้าใช้งานได้ทันที'
                    : 'No email to confirm — you are signed in straight away'}
                  {' · '}
                  <a href={`/auth/reset?next=${encodeURIComponent(next)}`} className="underline text-[#1B3A6B] dark:text-[#8FB4FF]">
                    {lang === 'th' ? 'ลืมรหัสผ่าน' : 'Forgot password'}
                  </a>
                </p>
              </div>

              {/* ── Escape hatch ──────────────────────────────────────────────
                  Secondary, never a blocker. Android can be handed to Chrome
                  with an intent:// URL, carrying the /start answers in the query
                  string because the two browsers do not share cookies. iOS
                  cannot be escaped programmatically, so it gets instructions
                  rather than a link that would do nothing. */}
              {webview && (
                <div className="order-2 mb-4 rounded-xl border border-[#e0e0e0] dark:border-[#3a3a3c] bg-[#F7F9FC] dark:bg-[#0D1F35] px-4 py-3">
                  {iab.platform === 'android' ? (
                    <button
                      type="button"
                      onClick={escapeToBrowser}
                      className="text-xs font-semibold text-[#1B3A6B] dark:text-[#8FB4FF] underline text-left"
                      style={{ ...THAI, lineHeight: 1.8 }}
                    >
                      เปิดในเบราว์เซอร์ เพื่อเข้าสู่ระบบด้วย LINE หรือ Google
                    </button>
                  ) : (
                    <>
                      <p className="text-xs text-[#6e6e73] dark:text-[#aeaeb2]" style={{ ...THAI, lineHeight: 1.8 }}>
                        เปิดในเบราว์เซอร์ เพื่อเข้าสู่ระบบด้วย LINE หรือ Google
                      </p>
                      <p className="mt-1 text-xs text-[#8e8e93]" style={{ ...THAI, lineHeight: 1.8 }}>
                        แตะปุ่ม ••• หรือไอคอนแชร์ แล้วเลือก &ldquo;เปิดใน Safari&rdquo;
                      </p>
                    </>
                  )}

                  {iosHelp && iab.platform !== 'android' && (
                    <p className="mt-2 text-xs text-[#6e6e73] dark:text-[#aeaeb2]" style={{ ...THAI, lineHeight: 1.8 }}>
                      {lang === 'th'
                        ? 'LINE ต้องเปิดใน Safari จึงจะเข้าสู่ระบบแบบแตะครั้งเดียวได้ หรือสมัครด้วยอีเมลด้านบนก็ได้เลย'
                        : 'LINE needs Safari for one-tap sign-in. Or just use email above.'}
                    </p>
                  )}
                </div>
              )}

              {/* ── LINE ──────────────────────────────────────────────────────
                  order-3 in a real browser: primary, largest, first. Demoted to
                  an outline button inside a webview, where it is a real option
                  but not the one that will work fastest. Never hidden: a student
                  who does know their LINE password should not be blocked. */}
              {/* A real <a>, not a button. Before hydration it is a working link
                  to the authorize entry point; after it, the click handler takes
                  over and can escape a webview to Chrome first — which a plain
                  link cannot do, and which is the difference between one-tap
                  approval and LINE's password form. */}
              <a
                href={lineHref}
                onClick={(e) => { e.preventDefault(); signInWithLine(); }}
                aria-disabled={busy}
                className={
                  webview
                    ? 'order-3 w-full flex items-center justify-center gap-3 border-2 border-[#06C755] rounded-xl min-h-[52px] px-4 text-sm font-bold text-[#06C755] mb-3'
                    : 'order-1 w-full flex items-center justify-center gap-3 bg-[#06C755] hover:bg-[#05B34C] rounded-xl min-h-[56px] px-4 text-base font-bold text-white transition-colors mb-3'
                }
                style={THAI}
              >
                {lineLoading ? (
                  <div className={`w-5 h-5 border-2 rounded-full animate-spin ${webview ? 'border-[#06C755]/30 border-t-[#06C755]' : 'border-white/40 border-t-white'}`} />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                  </svg>
                )}
                {webview
                  ? (lang === 'th' ? 'เข้าสู่ระบบด้วย LINE' : 'Sign in with LINE')
                  : isSignup
                    ? (lang === 'th' ? 'สร้างบัญชีด้วย LINE' : 'Sign up with LINE')
                    : (lang === 'th' ? 'เข้าสู่ระบบด้วย LINE' : 'Continue with LINE')}
              </a>

              {/* ── Google ────────────────────────────────────────────────────
                  NOT rendered inside an embedded webview. Google rejects those
                  with disallowed_useragent on its own domain, so the student
                  never returns and no error can be shown. A button that cannot
                  work is worse than no button. */}
              {!iab.googleBlocked && hydrated && (
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={busy}
                  className="order-2 w-full flex items-center justify-center gap-3 border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl min-h-[56px] px-4 text-base font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F7F9FC] dark:hover:bg-[#2c2c2e] transition-colors disabled:opacity-50 mb-3"
                  style={THAI}
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

              {/* Divider, rendered only in the layout that has something on both
                  sides of it. Inside a webview a "หรือ" with nothing beneath it
                  reads as a broken page rather than a choice. */}
              {!webview && hydrated && (
                <div className="order-4 flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
                  <span className="text-xs text-[#aeaeb2] dark:text-[#6e6e73] font-medium" style={THAI}>
                    {lang === 'th' ? 'หรือ' : 'or'}
                  </span>
                  <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
                </div>
              )}
            </div>
            </form>

            <p className="text-center text-xs text-[#aeaeb2] dark:text-[#6e6e73] mt-3 leading-relaxed" style={THAI}>
              {lang === 'th' ? 'ฟรีตลอด ไม่มีค่าใช้จ่าย' : 'Always free. No credit card required.'}
            </p>
          </div>
        </div>

        <p className="text-center mt-4">
          <a href="/" className="text-sm text-[#6e6e73] dark:text-[#8e8e93] hover:text-[#1D1D1F] dark:hover:text-white transition-colors" style={THAI}>
            ← {lang === 'th' ? 'กลับหน้าแรก' : 'Back to home'}
          </a>
        </p>
      </div>
    </div>
  );
}
