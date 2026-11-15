'use client';

/**
 * What a guest sees after tapping "🔖 บันทึก": a sign-in sheet on the same page,
 * not a jump to /auth.
 *
 * The jump lost them. Half of all /auth visits from 6 to 15 Nov 2026 came from
 * this button; /auth's heading talked about matched scholarships, never about
 * the one they had just tapped, and 16 of 28 such visits ended in a tap back
 * within seconds.
 *
 * The scholarship is remembered before anything else (lib/tracker/pendingSave),
 * and PendingSaveResolver saves it once a session exists, wherever sign-in lands.
 */

import SignInSheet from '@/components/auth/SignInSheet';
import { saveSignupHref } from '@/lib/tracker/pendingSave';

export const GUEST_SAVE_COPY = {
  title:   '🔖 บันทึกทุนนี้ไว้ แล้วรับแจ้งเตือนก่อนปิดรับ',
  sub:     'เข้าสู่ระบบครั้งเดียว ทุนนี้จะถูกบันทึกให้อัตโนมัติ ฟรี ไม่มีโฆษณา',
  line:    'บันทึกด้วย LINE',
  emailFallback: 'บันทึกด้วยอีเมล',
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
  // The page the student is on is where they come back to, with the scholarship.
  const here = typeof window === 'undefined'
    ? '/scholarships'
    : window.location.pathname + window.location.search;

  return (
    <SignInSheet
      title={GUEST_SAVE_COPY.title}
      detail={scholarshipName}
      sub={GUEST_SAVE_COPY.sub}
      signupHref={saveSignupHref(here, scholarshipId)}
      surface="save"
      lineLabel={GUEST_SAVE_COPY.line}
      emailLabel={GUEST_SAVE_COPY.emailFallback}
      onClose={onClose}
    />
  );
}
