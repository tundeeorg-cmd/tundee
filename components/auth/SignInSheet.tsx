'use client';

/**
 * Sign-in as a sheet over the current page, so asking never sends a student
 * somewhere else.
 *
 * Until 15 Nov 2026 the same /start results screen asked in two ways: the box
 * under the cards signed in on the page, while the sticky button at the bottom
 * (what a phone shows first) navigated to /auth. Guest Save did the same. Every
 * sign-in prompt on /start now opens this sheet; /auth stays for links from the
 * rest of the site and as the no-JavaScript fallback.
 *
 * The body is LineQuickStart: LINE first, and inside Facebook / Instagram the
 * email code typed on this page. Portalled to <body>: /start's wrapper and the
 * cards carry transforms that would trap position:fixed.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import LineQuickStart from '@/components/start/LineQuickStart';
import type { LoginSurface } from '@/lib/auth/inAppLogin';

const TH = { fontFamily: 'Sarabun, sans-serif' } as const;

export const SIGN_IN_SHEET_LATER = 'ไว้ทีหลัง';

export default function SignInSheet({
  title,
  detail,
  sub,
  signupHref,
  surface,
  lineLabel,
  emailLabel,
  onClose,
}: {
  title: string;
  /** A line under the title, e.g. the scholarship being saved. */
  detail?: ReactNode;
  sub: string;
  /** The /auth link: carries `next` and `from`, and is the email fallback outside in-app browsers. */
  signupHref: string;
  surface: LoginSurface;
  lineLabel?: string;
  emailLabel: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

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

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-sheet-title"
        className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0A1628] px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[#E5E5EA] dark:bg-[#1A2E4A] sm:hidden" aria-hidden="true" />

        <h2 id="sign-in-sheet-title" className="text-lg font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center leading-snug" style={TH}>
          {title}
        </h2>
        {detail && (
          <p className="mt-2 text-sm text-center text-[#1B3A6B] dark:text-[#8FB4FF] line-clamp-2" style={TH}>
            {detail}
          </p>
        )}
        <p className="mt-2 mb-4 text-xs text-center text-muted" style={TH}>
          {sub}
        </p>

        <LineQuickStart
          signupHref={signupHref}
          surface={surface}
          lineLabel={lineLabel}
          fallback={
            <a
              href={signupHref}
              style={TH}
              className="block w-full text-center bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white py-3.5 px-6 rounded-2xl font-bold text-base transition-colors active:opacity-90"
            >
              {emailLabel}
            </a>
          }
        />

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-2 block w-full py-2.5 text-sm text-muted underline-offset-2 hover:underline"
          style={TH}
        >
          {SIGN_IN_SHEET_LATER}
        </button>
      </div>
    </div>,
    document.body,
  );
}
