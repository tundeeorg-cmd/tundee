'use client';

/**
 * Email + six-digit code, on the /start results gate itself.
 *
 * Inside the Facebook / Instagram in-app browser LINE's one-tap login cannot fire
 * (lib/auth/inAppLogin), and the email path used to cost a page load: "sign up with
 * email" on /start was a link to /auth. This keeps the student on the page that holds
 * their answers. The code is typed into the same webview that asked for it, so nothing
 * leaves the browser and the /start answers are still there when the session lands.
 *
 * Same rules as /auth's email form (app/auth/AuthForm.tsx), from the same pieces:
 *   • lib/auth/otp — address check, code normalising, the 60 s resend gap, expiry guess
 *   • signInWithOtp({ shouldCreateUser: true }) then verifyOtp({ type: 'email' })
 *   • the same /auth/callback hand-off, carrying next, the parked-answers id (`i`), the
 *     guest session (`p`), consent and the campaign, so what happens after sign-in —
 *     attaching answers, consent, randomization — is exactly what /auth does. Nothing
 *     here touches randomization, consent logic or ANON_RANDOMIZATION.
 *
 * The consent tick belongs to the parent (one box for the whole gate); this component
 * does nothing until it is ticked and asks the parent to show its reminder otherwise.
 * No funnel event carries the email address or the code.
 */

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CONSENT_COOKIE, CONSENT_COOKIE_MAX_AGE, CONSENT_PARAM, CONSENT_VERSION } from '@/lib/consent';
import { PREVIEW_COOKIE, PREVIEW_PARAM, decodePreviewInput } from '@/lib/preview/types';
import { INTAKE_PARAM, clearStoredIntakeId, readStoredIntakeId } from '@/lib/intake/pendingIntake';
import type { InAppBrowserInfo } from '@/lib/browser/inAppBrowser';
import { logFunnelEvent } from '@/lib/research/funnel';
import { IN_APP_COPY, loginEventContext } from '@/lib/auth/inAppLogin';
import {
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  classifyOtpError,
  isPlausibleEmail,
  likelyExpired,
  normalizeEmail,
  normalizeOtpCode,
  otpMessage,
} from '@/lib/auth/otp';

const TH = { fontFamily: 'Sarabun, sans-serif' } as const;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function EmailCodeStart({
  consent,
  onNeedConsent,
  next,
  utmCampaign,
  iab,
}: {
  consent: boolean;
  /** Called when a tap happens before the consent box is ticked. */
  onNeedConsent: () => void;
  next: string;
  utmCampaign: string | null;
  iab: InAppBrowserInfo;
}) {
  const supabase = createClient();
  const [stage, setStage]       = useState<'email' | 'code'>('email');
  const [email, setEmail]       = useState('');
  const [code, setCode]         = useState('');
  const [sending, setSending]   = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const sentAtRef  = useRef(0);
  const codeRef    = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function guestSession(): string | null {
    const preview = readCookie(PREVIEW_COOKIE);
    return preview && decodePreviewInput(preview) ? preview : null;
  }

  function recordConsent() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${CONSENT_COOKIE}=${CONSENT_VERSION}; Max-Age=${CONSENT_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  }

  /** What /auth/callback is given, for both the email link and the typed code. */
  function callbackParams(): URLSearchParams {
    const qs = new URLSearchParams({ next });
    qs.set(CONSENT_PARAM, CONSENT_VERSION);
    const preview = guestSession();
    if (preview) qs.set(PREVIEW_PARAM, preview);
    const intake = readStoredIntakeId();
    if (intake) qs.set(INTAKE_PARAM, intake);
    if (utmCampaign) qs.set('utm_campaign', utmCampaign);
    return qs;
  }

  async function sendCode(isResend = false) {
    if (!consent) { onNeedConsent(); return; }
    const address = normalizeEmail(email);
    if (!isPlausibleEmail(address)) { setError(otpMessage('invalid_email', 'th')); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setError(otpMessage('network', 'th')); return; }

    setSending(true);
    setError(null);
    recordConsent();
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const { error: err } = await supabase.auth.signInWithOtp({
        email: address,
        options: {
          shouldCreateUser: true,
          emailRedirectTo:  `${siteUrl}/auth/callback?${callbackParams().toString()}`,
        },
      });
      if (err) {
        const kind = classifyOtpError(err);
        setError(otpMessage(kind, 'th'));
        logFunnelEvent({ eventType: 'otp_failed', context: loginEventContext(iab, 'start', { step: 'send', reason: kind }) });
        return;
      }
      sentAtRef.current = Date.now();
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setStage('code');
      setCode('');
      logFunnelEvent({ eventType: 'otp_sent', context: loginEventContext(iab, 'start', { resend: isResend }) });
      setTimeout(() => codeRef.current?.focus(), 60);
    } catch {
      setError(otpMessage('network', 'th'));
      logFunnelEvent({ eventType: 'otp_failed', context: loginEventContext(iab, 'start', { step: 'send', reason: 'network' }) });
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(submitted?: string) {
    const token = normalizeOtpCode(submitted ?? code);
    if (token.length !== OTP_LENGTH) { setError(IN_APP_COPY.wrongCode); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setError(otpMessage('network', 'th')); return; }

    setVerifying(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: normalizeEmail(email),
        token,
        type: 'email',
      });
      if (err) {
        // Supabase gives one error for a wrong and an expired code; the brief's copy
        // covers both, and the reason below keeps them apart for the funnel.
        const reason = likelyExpired(sentAtRef.current, Date.now()) ? 'code_expired' : classifyOtpError(err);
        setError(IN_APP_COPY.wrongCode);
        setCode('');
        codeRef.current?.focus();
        logFunnelEvent({ eventType: 'otp_failed', context: loginEventContext(iab, 'start', { step: 'verify', reason }) });
        return;
      }
      logFunnelEvent({ eventType: 'otp_verified', context: loginEventContext(iab, 'start') });
      logFunnelEvent({ eventType: 'signup_completed', context: { method: 'email_otp', ...loginEventContext(iab, 'start') } });
      clearStoredIntakeId();
      // A full navigation: the session cookies were just written and the destination's
      // server components must render with them (same as /auth).
      window.location.href = `/auth/callback?${callbackParams().toString()}`;
    } catch {
      setError(otpMessage('network', 'th'));
    } finally {
      setVerifying(false);
    }
  }

  if (stage === 'code') {
    return (
      <div>
        <p className="text-sm text-[#1B3A6B] dark:text-[#8FB4FF] text-center break-words" style={{ ...TH, lineHeight: 1.8 }}>
          {IN_APP_COPY.codeSent(normalizeEmail(email))}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-center text-red-600 dark:text-red-400" style={{ ...TH, lineHeight: 1.8 }}>
            {error}
          </p>
        )}

        <label htmlFor="start-code" className="sr-only">รหัส 6 หลัก</label>
        <input
          id="start-code"
          ref={codeRef}
          value={code}
          onChange={(e) => {
            const v = normalizeOtpCode(e.target.value);
            setCode(v);
            setError(null);
            // Submit on the sixth digit, which is also when iOS fills the whole code in.
            if (v.length === OTP_LENGTH) void verifyCode(v);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          placeholder="123456"
          disabled={verifying}
          // 16px minimum or iOS zooms the viewport on focus.
          style={{ ...TH, fontSize: '28px', letterSpacing: '0.4em' }}
          className="mt-3 w-full text-center border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-4 font-bold text-[#1D1D1F] dark:text-[#F5F5F7] dark:bg-[#0D1F35] placeholder-[#d0d0d5] focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 disabled:opacity-50"
        />

        <button
          type="button"
          onClick={() => void verifyCode()}
          disabled={verifying || code.length !== OTP_LENGTH}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-[#1B3A6B] hover:bg-[#15305A] text-white font-bold rounded-2xl min-h-[52px] transition-colors disabled:opacity-50"
          style={TH}
        >
          {verifying && <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />}
          ยืนยัน
        </button>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setStage('email'); setCode(''); setError(null); }}
            className="text-xs text-[#1B3A6B] dark:text-[#8FB4FF] underline"
            style={TH}
          >
            แก้อีเมล
          </button>
          <button
            type="button"
            onClick={() => void sendCode(true)}
            disabled={cooldown > 0 || sending}
            className="text-xs text-[#1B3A6B] dark:text-[#8FB4FF] underline disabled:no-underline disabled:text-[#aeaeb2] dark:disabled:text-[#6e6e73]"
            style={TH}
          >
            {cooldown > 0 ? IN_APP_COPY.resendWait(cooldown) : IN_APP_COPY.resend}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }} noValidate>
      {error && (
        <p role="alert" className="mb-3 text-sm text-center text-red-600 dark:text-red-400" style={{ ...TH, lineHeight: 1.8 }}>
          {error}
        </p>
      )}
      <label htmlFor="start-email" className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5" style={TH}>
        อีเมล
      </label>
      <input
        id="start-email"
        name="email"
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setError(null); }}
        placeholder="you@example.com"
        autoComplete="email"
        inputMode="email"
        disabled={sending}
        // 16px minimum or iOS zooms the viewport on focus.
        style={{ ...TH, fontSize: '16px' }}
        className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-3.5 text-[#1D1D1F] dark:text-[#F5F5F7] dark:bg-[#0D1F35] placeholder-[#aeaeb2] focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 transition-colors mb-3 disabled:opacity-50"
      />
      <button
        type="submit"
        aria-disabled={!consent || sending}
        className={`w-full flex items-center justify-center gap-2 text-white font-bold rounded-2xl min-h-[56px] px-4 transition-colors ${
          consent && !sending ? 'bg-[#1B3A6B] hover:bg-[#15305A]' : 'bg-[#1B3A6B]/40'
        }`}
        style={TH}
      >
        {sending && <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />}
        {IN_APP_COPY.emailButton}
      </button>
    </form>
  );
}
