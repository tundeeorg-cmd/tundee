'use client';

/**
 * Sign up with LINE straight from the /start results, without the /auth page.
 *
 * /start is where most of our traffic lands — inside the Facebook and TikTok
 * webviews — and the results gate is the moment a visitor decides to sign up.
 * Before this, every path from there went through /auth: one more page load in
 * a webview, before the LINE button even appeared.
 *
 * Same rules as the LINE button on /auth, from the same shared pieces:
 *   • ConsentCheckbox — the identical PDPA wording; the button does nothing
 *     until it is ticked, and /api/auth/line/start refuses without it anyway.
 *   • lib/line/launch — the same URL (guest session, parked answers, campaign)
 *     and the same webview escape: Chrome on Android, Safari instructions on iOS.
 *
 * `signupHref` is the /auth link the page already builds; its `next` and
 * `utm_campaign` are reused so a LINE signup lands where an email signup would
 * and is credited to the same ad.
 *
 * INSIDE AN IN-APP BROWSER (Facebook, Instagram, …) the order flips: the visitor is told
 * why LINE's one tap is not available, EMAIL + a six-digit code comes first and works on
 * this very page (components/start/EmailCodeStart), and LINE sits below it — on Android as
 * a "open in Chrome" button the visitor taps themselves, on iPhone as an instruction. The
 * hand-off is never started without a tap. Elsewhere nothing changes: LINE first, and the
 * `fallback` (the plain email link the page used to render below this) after it.
 */

import { useEffect, useState, type ReactNode } from 'react';
import ConsentCheckbox from '@/components/auth/ConsentCheckbox';
import { CONSENT_COOKIE, CONSENT_COOKIE_MAX_AGE, CONSENT_VERSION } from '@/lib/consent';
import { PREVIEW_COOKIE, PREVIEW_PARAM, decodePreviewInput } from '@/lib/preview/types';
import { INTAKE_PARAM, readStoredIntakeId } from '@/lib/intake/pendingIntake';
import { detectInAppBrowser, inspectUserAgent, type InAppBrowserInfo } from '@/lib/browser/inAppBrowser';
import { logFunnelEvent } from '@/lib/research/funnel';
import { IN_APP_COPY, emailFirstLogin, inAppNotice, loginEventContext } from '@/lib/auth/inAppLogin';
import EmailCodeStart from '@/components/start/EmailCodeStart';
import { lineStartUrl, lineLaunch, iosLineHelp, androidLineHelp, followLineLaunch } from '@/lib/line/launch';
import { LINE_DATA_NOTICE } from '@/lib/line/dataNotice';

const TH = { fontFamily: 'Sarabun, sans-serif' } as const;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function LineQuickStart({ signupHref, fallback }: { signupHref: string; fallback?: ReactNode }) {
  const [consent, setConsent] = useState(false);
  const [nudge,   setNudge]   = useState(false);
  const [iosHelp, setIosHelp] = useState<InAppBrowserInfo | null>(null);
  const [copied,  setCopied]  = useState<'yes' | 'failed' | null>(null);
  const [leaving, setLeaving] = useState(false);
  // Not in an in-app browser until the browser says so: the server cannot know.
  const [iab, setIab] = useState<InAppBrowserInfo>(() => inspectUserAgent(null));
  const emailFirst = emailFirstLogin(iab);

  useEffect(() => {
    const info = detectInAppBrowser();
    setIab(info);
    logFunnelEvent({ eventType: 'login_method_shown', context: loginEventContext(info, 'start') });
  }, []);

  const from = new URL(signupHref, typeof window === 'undefined' ? 'https://www.tundee.org' : window.location.origin).searchParams;

  function guestSession(): string | null {
    const preview = readCookie(PREVIEW_COOKIE);
    return preview && decodePreviewInput(preview) ? preview : null;
  }

  /**
   * The /auth link, carrying the /start answers in the URL — Safari has none
   * of this browser's cookies, and the answers must survive the switch.
   */
  async function copyLink() {
    const url = new URL(signupHref, window.location.origin);
    const preview = guestSession();
    if (preview) url.searchParams.set(PREVIEW_PARAM, preview);
    const intake = readStoredIntakeId();
    if (intake) url.searchParams.set(INTAKE_PARAM, intake);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  }

  function start() {
    if (!consent) { setNudge(true); return; }

    // The same cookie /auth writes, so /auth/callback sees a consented signup.
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${CONSENT_COOKIE}=${CONSENT_VERSION}; Max-Age=${CONSENT_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;

    const iab = detectInAppBrowser();
    const launch = lineLaunch(
      lineStartUrl(window.location.origin, {
        next:        from.get('next') ?? '/scholarships',
        preview:     guestSession(),
        intake:      readStoredIntakeId(),
        utmCampaign: from.get('utm_campaign'),
      }),
      iab,
    );

    // Measured so the in-app fix can be judged: every LINE tap made inside a webview, and
    // the ones that actually try the Chrome hand-off (Android only; a tap, never a load).
    if (iab.isInApp) {
      logFunnelEvent({ eventType: 'line_login_clicked_in_app', context: loginEventContext(iab, 'start') });
      if (launch.kind === 'navigate' && !/^https?:/i.test(launch.url)) {
        logFunnelEvent({ eventType: 'open_in_chrome_clicked', context: loginEventContext(iab, 'start') });
      }
    }

    if (launch.kind === 'ios_webview_help') { setIosHelp(iab); return; }
    setLeaving(true);
    followLineLaunch(launch.url, (stuck) => {
      setLeaving(false);
      if (stuck) setIosHelp(iab);
    });
  }

  const lineIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );

  const spinner = <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />;

  // Shown when the hand-off to Chrome did not happen (Android) or LINE cannot open from
  // this iPhone browser. Where the email form is already on screen, the way out says so.
  const helpBox = iosHelp && (
    <div className="mt-3 rounded-xl bg-[#EBF2FF] dark:bg-[#0D1F35] px-3 py-3 text-center">
      <p className="text-xs text-[#1B3A6B] dark:text-[#8FB4FF]" style={{ ...TH, lineHeight: 1.8 }}>
        {iosHelp.platform === 'android' ? androidLineHelp(true) : iosLineHelp(iosHelp, true)}
      </p>
      <button
        type="button"
        onClick={() => void copyLink()}
        className="mt-2 text-xs font-semibold text-white bg-[#1B3A6B] rounded-lg px-3 py-2"
        style={TH}
      >
        {copied === 'yes' ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
      </button>
      {copied === 'failed' && (
        <p className="mt-2 text-xs text-[#6e6e73] dark:text-[#8e8e93]" style={TH}>
          คัดลอกไม่ได้ กรุณากดค้างที่แถบที่อยู่เพื่อคัดลอก
        </p>
      )}
      <p className="mt-2 text-xs text-[#6e6e73] dark:text-[#8e8e93]" style={{ ...TH, lineHeight: 1.8 }}>
        {emailFirst ? 'หรือใช้อีเมลด้านบน ใช้ได้เลยในหน้านี้' : 'หรือสมัครด้วยอีเมลด้านล่าง ใช้ได้เลยในหน้านี้'}
      </p>
    </div>
  );

  const nudgeBox = nudge && (
    <p role="alert" className="mt-2 text-xs text-[#C2410C] dark:text-[#FDBA74] text-center" style={TH}>
      กรุณายอมรับเงื่อนไขก่อน
    </p>
  );

  // ── In an in-app browser: email first, on this page ────────────────────────
  if (emailFirst) {
    return (
      <div className="mb-4 rounded-2xl border border-[#E8ECF2] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] p-4">
        <p className="mb-3 text-sm text-[#1B3A6B] dark:text-[#8FB4FF] text-center" style={{ ...TH, lineHeight: 1.8 }}>
          {inAppNotice(iab)}
        </p>

        <ConsentCheckbox
          checked={consent}
          onChange={(checked) => { setConsent(checked); setNudge(false); }}
        />
        <div className="mt-4">
          <EmailCodeStart
            consent={consent}
            onNeedConsent={() => setNudge(true)}
            next={from.get('next') ?? '/scholarships'}
            utmCampaign={from.get('utm_campaign')}
            iab={iab}
          />
        </div>
        {nudgeBox}

        <div className="my-4 flex items-center gap-3" aria-hidden="true">
          <div className="flex-1 h-px bg-[#E8ECF2] dark:bg-[#1A2E4A]" />
          <span className="text-xs text-[#8A96A8]" style={TH}>หรือ</span>
          <div className="flex-1 h-px bg-[#E8ECF2] dark:bg-[#1A2E4A]" />
        </div>

        {/* Android: a button the visitor taps themselves — never started on load. */}
        {iab.platform === 'android' && (
          <button
            type="button"
            onClick={start}
            aria-disabled={!consent || leaving}
            className={`w-full flex items-center justify-center gap-3 rounded-2xl min-h-[52px] px-4 text-sm font-bold border-2 border-[#06C755] transition-colors ${
              consent && !leaving ? 'text-[#06A04A] dark:text-[#4ADE80] active:opacity-90' : 'text-[#06C755]/50 border-[#06C755]/40'
            }`}
            style={TH}
          >
            {leaving ? <span className="w-5 h-5 border-2 border-[#06C755]/40 border-t-[#06C755] rounded-full animate-spin" aria-hidden /> : lineIcon}
            {IN_APP_COPY.androidChromeButton}
          </button>
        )}

        {/* iPhone: Safari cannot be opened from a webview, so say how, rather than start a flow that dead-ends. */}
        {iab.platform === 'ios' && (
          <p className="rounded-xl bg-[#EBF2FF] dark:bg-[#0D1F35] px-3 py-3 text-xs text-center text-[#1B3A6B] dark:text-[#8FB4FF]" style={{ ...TH, lineHeight: 1.8 }}>
            {IN_APP_COPY.iosInstruction}
          </p>
        )}

        {helpBox}

        <p className="mt-3 text-center text-xs text-[#6e6e73] dark:text-[#8e8e93]" style={{ ...TH, lineHeight: 1.8 }}>
          {IN_APP_COPY.lineNote}
        </p>
        <p className="mt-3 text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8]" style={{ ...TH, lineHeight: 1.8 }}>
          {LINE_DATA_NOTICE.th}
        </p>
      </div>
    );
  }

  // ── Everywhere else (Chrome, Safari, LINE's own browser): unchanged — LINE first ──
  return (
    <>
      <div className="mb-4 rounded-2xl border border-[#E8ECF2] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] p-4">
        <ConsentCheckbox
          checked={consent}
          onChange={(checked) => { setConsent(checked); setNudge(false); }}
        />

        <button
          type="button"
          onClick={start}
          aria-disabled={!consent || leaving}
          className={`mt-4 w-full flex items-center justify-center gap-3 rounded-2xl min-h-[56px] px-4 text-base font-bold text-white transition-colors ${
            consent && !leaving ? 'bg-[#06C755] active:opacity-90' : 'bg-[#06C755]/40'
          }`}
          style={TH}
        >
          {leaving ? spinner : lineIcon}
          สมัครด้วย LINE — ดูทุนทั้งหมด
        </button>

        {nudgeBox}

        {/* iPhone, where LINE cannot open its app from this browser (Chrome and the
            other non-Safari browsers) — or Android, when the hand-off did not happen. */}
        {helpBox}

        <p className="mt-3 text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8]" style={{ ...TH, lineHeight: 1.8 }}>
          {LINE_DATA_NOTICE.th}
        </p>
      </div>
      {fallback}
    </>
  );
}
