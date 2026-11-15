'use client';

/**
 * What a guest sees after tapping "🔖 บันทึก": a sheet on the same page, not a
 * jump to /auth.
 *
 * The jump lost them. Half of all /auth visits from 6 to 15 Nov 2026 came from
 * this button; /auth's heading talked about matched scholarships, never about
 * the one they had just tapped, and 16 of 28 such visits ended in a tap back
 * within seconds. Here the student stays on the list, sees what saving gets them,
 * and signs in with the same LINE / email-code block as the /start results
 * (LineQuickStart: email code on this page inside Facebook / Instagram).
 *
 * The scholarship is remembered before anything else (lib/tracker/pendingSave),
 * and PendingSaveResolver saves it once a session exists, wherever sign-in lands.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import LineQuickStart from '@/components/start/LineQuickStart';
import { saveSignupHref } from '@/lib/tracker/pendingSave';

const TH = { fontFamily: 'Sarabun, sans-serif' } as const;

export const GUEST_SAVE_COPY = {
  title:   'บันทึกทุนนี้ไว้ แล้วรับแจ้งเตือนก่อนปิดรับ',
  sub:     'เข้าสู่ระบบครั้งเดียว ทุนนี้จะถูกบันทึกให้อัตโนมัติ ฟรี ไม่มีโฆษณา',
  line:    'บันทึกด้วย LINE',
  emailFallback: 'บันทึกด้วยอีเมล',
  later:   'ไว้ทีหลัง',
} as const;

export default function GuestSaveSheet({
  scholarshipId,
  scholarshipName,
  onClose,
}: {
  scholarshipId: string;
  scholarshipName?: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // The page the student is on is where they come back to, with the scholarship.
  const here = typeof window === 'undefined'
    ? '/scholarships'
    : window.location.pathname + window.location.search;
  const href = saveSignupHref(here, scholarshipId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Portalled: a card with a transform or hover effect would trap position:fixed.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-save-title"
        className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0A1628] px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[#E5E5EA] dark:bg-[#1A2E4A] sm:hidden" aria-hidden="true" />

        <h2 id="guest-save-title" className="text-lg font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center leading-snug" style={TH}>
          🔖 {GUEST_SAVE_COPY.title}
        </h2>
        {scholarshipName && (
          <p className="mt-2 text-sm text-center text-[#1B3A6B] dark:text-[#8FB4FF] line-clamp-2" style={TH}>
            {scholarshipName}
          </p>
        )}
        <p className="mt-2 mb-4 text-xs text-center text-[#6E7A8A] dark:text-[#8e9bb0]" style={TH}>
          {GUEST_SAVE_COPY.sub}
        </p>

        <LineQuickStart
          signupHref={href}
          surface="save"
          lineLabel={GUEST_SAVE_COPY.line}
          fallback={
            <a
              href={href}
              style={TH}
              className="block w-full text-center bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white py-3.5 px-6 rounded-2xl font-bold text-base transition-colors active:opacity-90"
            >
              {GUEST_SAVE_COPY.emailFallback}
            </a>
          }
        />

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-2 block w-full py-2.5 text-sm text-[#6E7A8A] dark:text-[#8e9bb0] underline-offset-2 hover:underline"
          style={TH}
        >
          {GUEST_SAVE_COPY.later}
        </button>
      </div>
    </div>,
    document.body,
  );
}
