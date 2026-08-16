'use client';

/**
 * PDPA cookie-consent banner.
 *
 * Nothing analytics-related loads until the visitor accepts — GA4, the Meta
 * Pixel and the TikTok Pixel all read the same state (lib/analytics/consent.ts).
 *
 * Both choices are given equal visual weight. A "reject" that is harder to find
 * than "accept" is not meaningful consent, and this product's audience is
 * students, many of them minors.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getConsent, setConsent } from '@/lib/analytics/consent';

const th = { fontFamily: "'Sarabun', system-ui, sans-serif" } as const;

export default function CookieConsent() {
  // Undecided visitors see the banner. Rendering nothing on the first pass
  // avoids a flash before localStorage can be read.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  function choose(choice: 'accepted' | 'rejected') {
    setConsent(choice);
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="การตั้งค่าคุกกี้"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
    >
      {/* Deliberately compact: /start is a single-screen form and this sits on
          top of it. Anything taller pushed the GPA field, province picker and
          submit button off-screen on a 375×812 phone — the exact device most ad
          traffic arrives on. Buttons stay side by side at every width. */}
      <div className="mx-auto max-w-[560px] rounded-2xl border border-[#E8ECF2] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] shadow-lg px-4 py-3.5">
        <p
          className="text-[#6E7A8A] dark:text-[#8e9bb0] leading-snug mb-3"
          style={{ ...th, fontSize: '0.8rem' }}
        >
          เราใช้คุกกี้เพื่อวิเคราะห์การใช้งานและวัดผลโฆษณา ปฏิเสธได้โดยไม่กระทบการใช้งาน{' '}
          <Link
            href="/privacy"
            className="text-[#1B3A6B] dark:text-[#8FB4FF] underline hover:opacity-80 whitespace-nowrap"
          >
            อ่านนโยบาย
          </Link>
        </p>

        <div className="flex flex-row gap-2">
          <button
            type="button"
            onClick={() => choose('accepted')}
            style={th}
            className="flex-1 min-h-[44px] rounded-xl bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white font-bold text-sm transition-colors active:opacity-90"
          >
            ยอมรับ
          </button>
          <button
            type="button"
            onClick={() => choose('rejected')}
            style={th}
            className="flex-1 min-h-[44px] rounded-xl border-2 border-[#E8ECF2] dark:border-[#1A2E4A] text-[#6E7A8A] dark:text-[#8e9bb0] font-bold text-sm hover:border-[#1B3A6B] hover:text-[#1B3A6B] dark:hover:text-[#8FB4FF] transition-colors"
          >
            ปฏิเสธ
          </button>
        </div>
      </div>
    </div>
  );
}
