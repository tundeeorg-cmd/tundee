/**
 * Email one-time codes: the domain rules, and the Thai the student reads.
 *
 * WHY A CODE AND NOT A LINK
 * ─────────────────────────
 * The magic link was removed on 30 Aug 2026 because the email round trip turned
 * 79 Lead events into 10 accounts. That diagnosis was right, and this is not a
 * reversal of it: the thing that failed was leaving the page. Nearly all of our
 * traffic arrives inside the Facebook in-app browser, and a link opens in a
 * DIFFERENT browser with a different cookie jar — so the student lands signed
 * out, with their /start answers gone.
 *
 * A six-digit code does not leave the page. It is typed into the same webview
 * that requested it, so the session is established exactly where the student
 * already is. That is the whole reason this exists, and it is why the code is
 * the primary path and the link in the same email is only a fallback.
 *
 * The link still works for anyone who prefers it — lib/intake carries the
 * /start answers across the browser boundary so that path no longer loses them.
 */

/** How long "ส่งใหม่" stays disabled. Matches Supabase's own send interval. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Supabase issues six digits for email OTP. */
export const OTP_LENGTH = 6;

/**
 * Deliberately permissive: `something@something.something`, trimmed.
 *
 * Client-side validation here exists to catch a typo before it costs a round
 * trip and a 60-second cooldown, not to adjudicate RFC 5322. A stricter pattern
 * rejects real addresses, and rejecting a real student's real email is a far
 * worse error than accepting one that bounces.
 */
export function isPlausibleEmail(raw: string): boolean {
  const v = raw.trim();
  if (v.length < 6 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(v);
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Keeps only digits, capped at OTP_LENGTH — so a pasted "123 456" still works. */
export function normalizeOtpCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export type OtpErrorCode =
  | 'invalid_email'
  | 'code_invalid'
  | 'code_expired'
  | 'rate_limited'
  | 'consent_required'
  | 'network'
  | 'send_failed'
  | 'verify_failed';

interface Copy { th: string; en: string }

const MESSAGES: Record<OtpErrorCode, Copy> = {
  invalid_email: {
    th: 'กรุณากรอกอีเมลให้ถูกต้อง',
    en: 'Please enter a valid email address.',
  },
  code_invalid: {
    th: 'รหัสไม่ถูกต้อง ลองใหม่อีกครั้ง',
    en: 'That code is not correct. Please try again.',
  },
  code_expired: {
    th: 'รหัสหมดอายุแล้ว กด "ส่งใหม่" เพื่อขอรหัสใหม่',
    en: 'That code has expired. Tap "Resend" to get a new one.',
  },
  rate_limited: {
    th: 'ขอรหัสถี่เกินไป รอสักครู่แล้วลองใหม่',
    en: 'Too many requests. Please wait a moment and try again.',
  },
  consent_required: {
    th: 'กรุณายอมรับเงื่อนไขก่อน',
    en: 'Please accept the terms first.',
  },
  network: {
    th: 'การเชื่อมต่อมีปัญหา กรุณาตรวจสอบสัญญาณแล้วลองใหม่',
    en: 'Connection problem. Check your signal and try again.',
  },
  send_failed: {
    th: 'ส่งรหัสไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    en: 'Could not send the code. Please try again.',
  },
  verify_failed: {
    th: 'ยืนยันไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    en: 'Could not verify. Please try again.',
  },
};

export function otpMessage(code: OtpErrorCode, lang: string): string {
  return MESSAGES[code][lang === 'th' ? 'th' : 'en'];
}

/**
 * Classifies a Supabase auth error into one of our codes.
 *
 * Supabase does not expose a stable machine-readable reason for most of these,
 * so this reads `status` first and falls back to substring matching on the
 * message. The raw message is NEVER surfaced — it is English, it names our
 * provider, and on the expiry case it says "Token has expired or is invalid",
 * which tells a student nothing about the one action that fixes it.
 */
export function classifyOtpError(err: { message?: string; status?: number } | null): OtpErrorCode {
  if (!err) return 'verify_failed';
  if (err.status === 429) return 'rate_limited';

  const m = (err.message ?? '').toLowerCase();

  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) {
    return 'rate_limited';
  }
  // Supabase reports expiry and a wrong code with the same string, so the two
  // cannot be told apart from the message alone. The caller distinguishes them
  // by elapsed time; this is the fallback when it cannot.
  if (m.includes('expired')) return 'code_expired';
  if (m.includes('invalid') || m.includes('incorrect') || m.includes('not found')) {
    return 'code_invalid';
  }
  if (m.includes('email') && m.includes('valid')) return 'invalid_email';
  if (m.includes('fetch') || m.includes('network')) return 'network';

  return 'verify_failed';
}

/**
 * Supabase email OTP codes last one hour.
 *
 * Used to tell "wrong code" apart from "expired code" when the message cannot:
 * past this point a rejection is far more likely to be expiry, and the copy for
 * expiry is the useful one because it names the button that fixes it.
 */
export const OTP_VALID_SECONDS = 60 * 60;

export function likelyExpired(sentAtMs: number, nowMs: number): boolean {
  return nowMs - sentAtMs > OTP_VALID_SECONDS * 1000;
}
