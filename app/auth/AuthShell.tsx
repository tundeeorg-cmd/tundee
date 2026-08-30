import { CONSENT_PARAM, CONSENT_VERSION } from '@/lib/consent';
import type { InAppBrowserInfo } from '@/lib/browser/inAppBrowser';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';

/**
 * Server-rendered shell for /auth.
 *
 * This is the Suspense fallback, and it is deliberately a working page rather
 * than a spinner.
 *
 * AuthForm is a client component that calls useSearchParams(), which makes Next
 * bail out of SSR for that subtree and render THIS instead. Previously that
 * meant a spinner: the served HTML contained zero inputs and zero buttons, so a
 * student on a stalled 3G connection watched a spinner while ~240 KB of gzipped
 * JavaScript downloaded, with no way to know whether anything was happening.
 *
 * What survives without JavaScript:
 *
 *   • the whole page is readable — heading, sign-in options, consent text
 *   • the email + password form is a real <form method="POST"> handled by
 *     /api/auth/password, so it creates an account and signs the student in
 *     with no JavaScript at all, and no email round trip either
 *   • the LINE button is a real <a href> to the authorize entry point
 *
 * It receives the same in-app-browser reading the hydrated form does, resolved
 * server-side from the request User-Agent — so even the no-JS page puts email
 * first inside a webview and hides the Google button that cannot work there.
 *
 * Once hydration finishes React swaps in AuthForm, which adds inline errors,
 * loading states, the password strength hint and the browser escape hatch.
 * Nothing here is load-bearing after that point — it only has to be correct and
 * usable before it.
 */

const THAI = { fontFamily: 'Sarabun, sans-serif' } as const;

const NOT_IN_APP: InAppBrowserInfo = {
  isInApp: false, app: null, googleBlocked: false, lineAppToAppBlocked: false, platform: 'other',
};

export default function AuthShell({
  next = '/scholarships',
  iab = NOT_IN_APP,
}: {
  next?: string;
  iab?: InAppBrowserInfo;
}) {
  const webview = iab.lineAppToAppBlocked;

  const emailBlock = (
    <>
      <label
        htmlFor="auth-email"
        className="block text-sm font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-2"
        style={THAI}
      >
        อีเมล
      </label>
      <input
        id="auth-email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder="you@example.com"
        // 16px minimum: anything smaller makes iOS and several Android
        // browsers zoom the viewport on focus.
        style={{ ...THAI, fontSize: '16px' }}
        className="w-full min-h-[52px] border-2 border-[#E8ECF2] dark:border-[#1A2E4A] rounded-xl px-4 text-[#0A2342] dark:text-[#E8EDF5] bg-white dark:bg-[#0D1F35] placeholder-[#A8B2C0] mb-3"
      />

      <label
        htmlFor="auth-password"
        className="block text-sm font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-2"
        style={THAI}
      >
        รหัสผ่าน
      </label>
      <input
        id="auth-password"
        type="password"
        name="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        style={{ ...THAI, fontSize: '16px' }}
        className="w-full min-h-[52px] border-2 border-[#E8ECF2] dark:border-[#1A2E4A] rounded-xl px-4 text-[#0A2342] dark:text-[#E8EDF5] bg-white dark:bg-[#0D1F35] placeholder-[#A8B2C0]"
      />
      <p className="mt-1.5 mb-3 text-xs text-[#8A96A8]" style={THAI}>
        อย่างน้อย {MIN_PASSWORD_LENGTH} ตัวอักษร ไม่ต้องยืนยันอีเมล เข้าใช้งานได้ทันที
      </p>

      <button
        type="submit"
        className="w-full min-h-[56px] bg-[#1B3A6B] text-white rounded-xl font-bold text-base px-4"
        style={THAI}
      >
        สมัคร / เข้าสู่ระบบ
      </button>
    </>
  );

  // A plain link, because without JavaScript there is nothing to escape a
  // webview with — an intent:// URL needs a click handler to build it, and the
  // /start answers it would have to carry live in a cookie this markup cannot
  // read. The hydrated form adds the real escape hatch.
  const lineBlock = (
    <a
      href={`/api/auth/line/start?next=${encodeURIComponent(next)}&${CONSENT_PARAM}=${CONSENT_VERSION}`}
      className={
        webview
          ? 'flex items-center justify-center gap-3 w-full min-h-[52px] border-2 border-[#06C755] rounded-xl text-[#06C755] font-bold text-sm px-4'
          : 'flex items-center justify-center gap-3 w-full min-h-[56px] bg-[#06C755] rounded-xl text-white font-bold text-base px-4'
      }
      style={THAI}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
      </svg>
      เข้าสู่ระบบด้วย LINE
    </a>
  );

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-6 sm:py-12">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
          <div className="h-1 bg-[#1B3A6B]" />

          <div className={webview ? 'px-6 py-5' : 'px-6 py-8'}>
            <h1
              className="text-center text-2xl font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-1"
              style={THAI}
            >
              เข้าสู่ระบบทุนดี
            </h1>
            <p
              className="text-center text-sm text-[#6E7A8A] dark:text-[#8e9bb0] mb-5"
              style={{ ...THAI, lineHeight: 1.8 }}
            >
              ใช้เวลาไม่ถึง 1 นาที ไม่มีค่าใช้จ่าย
            </p>

            {/* One consent checkbox for the whole page. Both routes enforce PDPA
                consent server-side, so this shell has to carry it or the no-JS
                path — the whole reason this component exists — would be turned
                away at both doors. A single `required` checkbox does it with no
                JavaScript: the browser refuses to submit until it is ticked. */}
            <form method="POST" action="/api/auth/password">
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="noscript" value="1" />

              <label className="flex items-start gap-3 mb-5 cursor-pointer select-none" style={THAI}>
                <input
                  type="checkbox"
                  name={CONSENT_PARAM}
                  value={CONSENT_VERSION}
                  required
                  className="mt-0.5 w-5 h-5 shrink-0 accent-[#1B3A6B] rounded"
                />
                <span className="text-sm leading-relaxed text-[#6E7A8A] dark:text-[#8e9bb0]">
                  ฉันยอมรับ{' '}
                  <a href="/terms" className="text-[#1B3A6B] dark:text-[#8FB4FF] underline">ข้อกำหนดการใช้งาน</a>
                  {' '}และ{' '}
                  <a href="/privacy" className="text-[#1B3A6B] dark:text-[#8FB4FF] underline">นโยบายความเป็นส่วนตัว</a>
                  {' '}และยินยอมให้ TunDee เก็บข้อมูลการศึกษาของฉันเพื่อแนะนำทุนที่ตรงกับฉัน
                </span>
              </label>

              {/* Inside a webview email leads: it is the only method that
                  completes there, and it is the only one this markup can
                  complete without JavaScript in any case. */}
              {webview ? emailBlock : (
                <>
                  {lineBlock}
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
                    <span className="text-xs text-[#8A96A8]" style={THAI}>หรือ</span>
                    <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
                  </div>
                  {emailBlock}
                </>
              )}
            </form>

            {/* Outside the form, because a nested <a> submit would be ambiguous
                and because the LINE link carries its own consent param. */}
            {webview && (
              <div className="mt-4">
                <p className="text-xs text-[#6e6e73] dark:text-[#aeaeb2] mb-2" style={{ ...THAI, lineHeight: 1.8 }}>
                  เปิดในเบราว์เซอร์ เพื่อเข้าสู่ระบบด้วย LINE หรือ Google
                </p>
                {lineBlock}
              </div>
            )}

            <p
              className="mt-5 text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8]"
              style={{ ...THAI, lineHeight: 1.8 }}
            >
              <a href="/auth/reset" className="underline text-[#1B3A6B] dark:text-[#8FB4FF]">ลืมรหัสผ่าน</a>
            </p>
          </div>
        </div>

        <p className="text-center mt-4">
          <a href="/" className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={THAI}>
            ← กลับหน้าแรก
          </a>
        </p>
      </div>
    </div>
  );
}
