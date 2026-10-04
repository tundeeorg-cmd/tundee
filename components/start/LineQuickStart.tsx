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
 */

import { useState } from 'react';
import ConsentCheckbox from '@/components/auth/ConsentCheckbox';
import { CONSENT_COOKIE, CONSENT_COOKIE_MAX_AGE, CONSENT_VERSION } from '@/lib/consent';
import { PREVIEW_COOKIE, decodePreviewInput } from '@/lib/preview/types';
import { readStoredIntakeId } from '@/lib/intake/pendingIntake';
import { detectInAppBrowser } from '@/lib/browser/inAppBrowser';
import { lineStartUrl, lineLaunch } from '@/lib/line/launch';
import { LINE_DATA_NOTICE } from '@/lib/line/dataNotice';

const TH = { fontFamily: 'Sarabun, sans-serif' } as const;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function LineQuickStart({ signupHref }: { signupHref: string }) {
  const [consent, setConsent] = useState(false);
  const [nudge,   setNudge]   = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const [leaving, setLeaving] = useState(false);

  function start() {
    if (!consent) { setNudge(true); return; }

    // The same cookie /auth writes, so /auth/callback sees a consented signup.
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${CONSENT_COOKIE}=${CONSENT_VERSION}; Max-Age=${CONSENT_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;

    const from = new URL(signupHref, window.location.origin).searchParams;
    const preview = readCookie(PREVIEW_COOKIE);
    const launch = lineLaunch(
      lineStartUrl(window.location.origin, {
        next:        from.get('next') ?? '/scholarships',
        preview:     preview && decodePreviewInput(preview) ? preview : null,
        intake:      readStoredIntakeId(),
        utmCampaign: from.get('utm_campaign'),
      }),
      detectInAppBrowser(),
    );

    if (launch.kind === 'ios_webview_help') { setIosHelp(true); return; }
    setLeaving(true);
    window.location.href = launch.url;
  }

  return (
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
        {leaving ? (
          <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
          </svg>
        )}
        สมัครด้วย LINE — ดูทุนทั้งหมด
      </button>

      {nudge && (
        <p role="alert" className="mt-2 text-xs text-[#C2410C] dark:text-[#FDBA74] text-center" style={TH}>
          กรุณายอมรับเงื่อนไขก่อน
        </p>
      )}

      {iosHelp && (
        <p className="mt-3 text-xs text-[#1B3A6B] dark:text-[#8FB4FF] text-center" style={{ ...TH, lineHeight: 1.8 }}>
          เพื่อใช้ LINE ให้กดจุด 3 จุดมุมขวาบน แล้วเลือก &quot;เปิดใน Safari&quot; หรือกดปุ่มด้านล่างเพื่อสมัครด้วยอีเมล ใช้ได้เลยในหน้านี้
        </p>
      )}

      <p className="mt-3 text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8]" style={{ ...TH, lineHeight: 1.8 }}>
        {LINE_DATA_NOTICE.th}
      </p>
    </div>
  );
}
