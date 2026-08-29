import { CONSENT_PARAM, CONSENT_VERSION } from '@/lib/consent';
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
 *   • the whole page is readable — heading, both sign-in options, consent text
 *   • the LINE button is a real <a href>, so the PRIMARY method works outright
 *   • the email form is a real <form method="POST">, handled by
 *     /api/auth/email-link, so email sign-in also completes with no JS at all
 *
 * Once hydration finishes React swaps in AuthForm, which adds in-app-browser
 * detection, inline errors, loading states and the resend countdown. Nothing
 * here is load-bearing after that point — it only has to be correct and usable
 * before it.
 *
 * Keep this markup in visual step with AuthForm. It is duplication, accepted
 * because the alternative is a blank screen on exactly the devices this product
 * exists for.
 */

const THAI = { fontFamily: 'Sarabun, sans-serif' } as const;

export default function AuthShell({ next = '/scholarships' }: { next?: string }) {
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
          <div className="h-1 bg-[#1B3A6B]" />

          <div className="px-6 py-8">
            <h1
              className="text-center text-2xl font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-1"
              style={THAI}
            >
              เข้าสู่ระบบทุนดี
            </h1>
            <p
              className="text-center text-sm text-[#6E7A8A] dark:text-[#8e9bb0] mb-6"
              style={{ ...THAI, lineHeight: 1.8 }}
            >
              ใช้เวลาไม่ถึง 1 นาที ไม่มีค่าใช้จ่าย
            </p>

            {/* One form, one consent checkbox, two submit buttons.
                Both routes now enforce PDPA consent server-side, so this shell has to
                carry it or the no-JS path — the whole reason this component exists —
                would be turned away at both doors. A single `required` checkbox does it
                with no JavaScript: browsers refuse to submit either button until it is
                ticked, and native validation is not something we have to ship 240 KB to
                get. Two buttons rather than two forms so there is one checkbox, not two.

                The email input is deliberately NOT `required`: it would otherwise block
                the LINE button, which needs no address. An empty address is validated by
                the route, which redirects back here with the field echoed. */}
            <form method="POST" action="/api/auth/email-link">
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

              {/* LINE stays the primary method.
                  A submit button posts its own name/value, so one form can serve both
                  methods and the route dispatches on `method`. formAction would have been
                  the obvious tool and React drops it — the rendered HTML came out with no
                  formaction at all, which silently pointed this button at the email
                  route. name/value is plain HTML and survives. */}
              <button
                type="submit"
                name="method"
                value="line"
                className="flex items-center justify-center gap-3 w-full min-h-[56px] bg-[#06C755] rounded-xl text-white font-bold text-base px-4"
                style={THAI}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                </svg>
                เข้าสู่ระบบด้วย LINE
              </button>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
                <span className="text-xs text-[#8A96A8]" style={THAI}>หรือ</span>
                <div className="flex-1 h-px bg-[#e0e0e0] dark:bg-[#3a3a3c]" />
              </div>

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
                placeholder="you@example.com"
                // 16px minimum: anything smaller makes iOS and several Android
                // browsers zoom the viewport on focus.
                style={{ ...THAI, fontSize: '16px' }}
                className="w-full min-h-[56px] border-2 border-[#E8ECF2] dark:border-[#1A2E4A] rounded-xl px-4 text-[#0A2342] dark:text-[#E8EDF5] bg-white dark:bg-[#0D1F35] placeholder-[#A8B2C0] mb-4"
              />

              <button
                type="submit"
                className="w-full min-h-[56px] bg-[#1B3A6B] text-white rounded-xl font-bold text-base px-4"
                style={THAI}
              >
                ส่งลิงก์เข้าสู่ระบบ
              </button>
            </form>

            <p
              className="mt-5 text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8]"
              style={{ ...THAI, lineHeight: 1.8 }}
            >
              การเข้าสู่ระบบถือว่าคุณยอมรับ{' '}
              <a href="/terms" className="underline text-[#1B3A6B] dark:text-[#8FB4FF]">ข้อกำหนดการใช้งาน</a>
              {' '}และ{' '}
              <a href="/privacy" className="underline text-[#1B3A6B] dark:text-[#8FB4FF]">นโยบายความเป็นส่วนตัว</a>
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
