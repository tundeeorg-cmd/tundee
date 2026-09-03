import { CONSENT_PARAM, CONSENT_VERSION } from '@/lib/consent';
import type { InAppBrowserInfo } from '@/lib/browser/inAppBrowser';
import { OTP_LENGTH } from '@/lib/auth/otp';

/**
 * Server-rendered shell for /auth — a working page, not a spinner.
 *
 * AuthForm is a client component that calls useSearchParams(), which makes Next
 * bail out of SSR for that subtree and render THIS instead. So this is the
 * markup a student on a stalled 3G connection actually gets, and on paid
 * traffic that is the difference between a signup and a blank screen.
 *
 * What works here with no JavaScript at all:
 *
 *   • LINE is a real <a href> to the authorize entry point
 *   • the email form is a real <form method="POST"> to /api/auth/otp/send,
 *     which mails a six-digit code and redirects back with ?stage=code
 *   • the code form posts to /api/auth/otp/verify, which establishes the
 *     session on its redirect response
 *
 * So the entire passwordless flow completes without a line of our JavaScript.
 * The hydrated form adds inline errors, the resend countdown, autofill of the
 * code from the email, and the Android escape to Chrome.
 *
 * Same order as AuthForm, deliberately: heading, LINE, divider, email, consent.
 * A student whose JavaScript arrives mid-page must not watch the layout
 * reshuffle under their thumb.
 */

const THAI = { fontFamily: 'Sarabun, sans-serif' } as const;

const NOT_IN_APP: InAppBrowserInfo = {
  isInApp: false, app: null, googleBlocked: false, lineAppToAppBlocked: false, platform: 'other',
};

export default function AuthShell({
  next = '/scholarships',
  iab = NOT_IN_APP,
  stage = 'choose',
  email = '',
}: {
  next?: string;
  iab?: InAppBrowserInfo;
  /** 'code' once /api/auth/otp/send has redirected back. */
  stage?: 'choose' | 'code';
  email?: string;
}) {
  const webview = iab.lineAppToAppBlocked;

  const hidden = (
    <>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name={CONSENT_PARAM} value={CONSENT_VERSION} />
    </>
  );

  // ── Code entry ────────────────────────────────────────────────────────────
  if (stage === 'code') {
    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-6 sm:py-12">
        <div className="w-full max-w-[420px]">
          <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
            <div className="h-1 bg-[#1B3A6B]" />
            <div className="px-6 sm:px-8 pt-7 pb-7">
              <h1 className="text-lg font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center mb-1" style={THAI}>
                ส่งรหัสไปที่
              </h1>
              <p className="text-center text-sm font-semibold text-[#1B3A6B] dark:text-[#8FB4FF] mb-5 break-all" style={THAI}>
                {email}
              </p>

              <form method="POST" action="/api/auth/otp/verify">
                {hidden}
                <input type="hidden" name="email" value={email} />
                <label htmlFor="shell-code" className="sr-only">รหัส {OTP_LENGTH} หลัก</label>
                <input
                  id="shell-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  required
                  placeholder="123456"
                  style={{ ...THAI, fontSize: '28px', letterSpacing: '0.4em' }}
                  className="w-full text-center border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-4 font-bold text-[#1D1D1F] dark:text-[#F5F5F7] dark:bg-[#0D1F35] placeholder-[#d0d0d5] mb-4"
                />
                <button
                  type="submit"
                  className="w-full min-h-[52px] bg-[#1B3A6B] text-white rounded-xl font-bold"
                  style={THAI}
                >
                  ยืนยัน
                </button>
              </form>

              <form method="POST" action="/api/auth/otp/send" className="mt-4 text-center">
                {hidden}
                <input type="hidden" name="email" value={email} />
                <button type="submit" className="text-xs text-[#1B3A6B] dark:text-[#8FB4FF] underline" style={THAI}>
                  ส่งใหม่
                </button>
              </form>

              <p className="text-center mt-3">
                <a href="/auth" className="text-xs text-[#1B3A6B] dark:text-[#8FB4FF] underline" style={THAI}>
                  แก้อีเมล
                </a>
              </p>

              <p className="text-center text-xs text-[#aeaeb2] dark:text-[#6e6e73] mt-5" style={{ ...THAI, lineHeight: 1.8 }}>
                หรือกดลิงก์ในอีเมลก็ได้
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── The choice ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-6 sm:py-12">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
          <div className="h-1 bg-[#1B3A6B]" />
          <div className="px-6 sm:px-8 pt-7 pb-7">

            {/* 1 ── Heading */}
            <h1 className="text-xl font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center mb-6 leading-snug" style={THAI}>
              เข้าสู่ระบบเพื่อดูทุนที่ตรงกับคุณ
            </h1>

            {/* 2 ── LINE. A plain link: without JavaScript there is nothing to
                    build an intent:// URL with, so a webview visitor gets the
                    ordinary authorize URL. The hydrated form adds the escape. */}
            <a
              href={`/api/auth/line/start?next=${encodeURIComponent(next)}&${CONSENT_PARAM}=${CONSENT_VERSION}`}
              className="flex items-center justify-center gap-3 w-full min-h-[56px] bg-[#06C755] rounded-xl text-white font-bold text-base px-4"
              style={THAI}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
              เข้าสู่ระบบด้วย LINE
            </a>
            <p className="text-center text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-2 mb-5" style={THAI}>
              เร็วที่สุด ไม่ต้องจำรหัสผ่าน
            </p>

            {webview && (
              <p className="text-center text-xs text-[#6e6e73] dark:text-[#8e8e93] -mt-3 mb-5" style={{ ...THAI, lineHeight: 1.8 }}>
                ถ้า LINE ไม่ขึ้น ให้ใช้อีเมลด้านล่าง ใช้ได้เลยในหน้านี้
              </p>
            )}

            {/* 3 ── Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
              <span className="text-xs text-[#aeaeb2] dark:text-[#6e6e73] font-medium" style={THAI}>หรือ</span>
              <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
            </div>

            {/* 4 + 5 ── Email and consent, in one real POST. `required` on the
                    checkbox is what enforces consent without JavaScript; the
                    route re-checks it regardless. */}
            <form method="POST" action="/api/auth/otp/send">
              <input type="hidden" name="next" value={next} />

              <label htmlFor="shell-email" className="block text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1.5" style={THAI}>
                อีเมล
              </label>
              <input
                id="shell-email"
                name="email"
                type="email"
                required
                defaultValue={email}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                style={{ ...THAI, fontSize: '16px' }}
                className="w-full border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl px-4 py-3.5 text-[#1D1D1F] dark:text-[#F5F5F7] dark:bg-[#0D1F35] placeholder-[#aeaeb2] mb-3"
              />
              <button
                type="submit"
                className="w-full min-h-[52px] bg-[#1B3A6B] text-white rounded-xl font-bold text-base px-4"
                style={THAI}
              >
                ส่งรหัสเข้าอีเมล
              </button>

              <label className="flex items-start gap-3 mt-5 cursor-pointer select-none" style={THAI}>
                <input
                  type="checkbox"
                  name={CONSENT_PARAM}
                  value={CONSENT_VERSION}
                  required
                  className="mt-0.5 w-5 h-5 shrink-0 accent-[#1B3A6B] rounded"
                />
                <span className="text-xs leading-relaxed text-[#6E7A8A] dark:text-[#8e9bb0]">
                  ฉันยอมรับ{' '}
                  <a href="/terms" className="text-[#1B3A6B] dark:text-[#8FB4FF] underline">ข้อกำหนดการใช้งาน</a>
                  {' '}และ{' '}
                  <a href="/privacy" className="text-[#1B3A6B] dark:text-[#8FB4FF] underline">นโยบายความเป็นส่วนตัว</a>
                  {' '}และยินยอมให้ TunDee เก็บข้อมูลการศึกษาของฉันเพื่อแนะนำทุนที่ตรงกับฉัน
                </span>
              </label>
            </form>

            <p className="text-center text-xs text-[#aeaeb2] dark:text-[#6e6e73] mt-5" style={THAI}>
              ฟรีตลอด ไม่มีค่าใช้จ่าย
            </p>
          </div>
        </div>

        <p className="text-center mt-4">
          <a href="/" className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={THAI}>← กลับหน้าแรก</a>
        </p>
      </div>
    </div>
  );
}
