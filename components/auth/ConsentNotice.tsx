import { CONSENT_PARAM, CONSENT_VERSION } from '@/lib/consent';

const THAI = { fontFamily: 'Sarabun, sans-serif' } as const;

/**
 * The consent line under the sign-in buttons. Continuing IS the agreement.
 *
 * This replaced a tick box (ConsentCheckbox) that every sign-in button sat
 * behind. On phones the box ended up below the fold, so a parent tapped the
 * green LINE button, got "กรุณายอมรับเงื่อนไขก่อน", and could not see what
 * they were being asked to tick. The wording is the same, data clause included,
 * so CONSENT_VERSION still names exactly what was agreed to; only the act
 * changed, from ticking to continuing.
 *
 * Every sign-in path still sends CONSENT_VERSION — the page sets the consent
 * cookie on each tap, the LINE link and callback URLs carry `consent=`, and the
 * no-JavaScript form posts it as a hidden field (`withField`) — and the servers
 * still refuse a sign-in without it (/api/auth/line/start, /api/auth/otp/send).
 *
 * Thai only, deliberately, in both languages of the page: it is the text the
 * consent version was approved against.
 */
export default function ConsentNotice({
  className = '',
  withField = false,
}: {
  className?: string;
  /** Inside a no-JavaScript <form>: also post the consent version. */
  withField?: boolean;
}) {
  return (
    <p className={`text-center text-xs leading-relaxed text-[#6E7A8A] dark:text-[#8e9bb0] ${className}`} style={THAI}>
      {withField && <input type="hidden" name={CONSENT_PARAM} value={CONSENT_VERSION} />}
      เมื่อดำเนินการต่อ ถือว่าคุณยอมรับ{' '}
      <a href="/terms" target="_blank" rel="noopener noreferrer"
         className="text-[#1B3A6B] dark:text-[#8FB4FF] underline">ข้อกำหนดการใช้งาน</a>
      {' '}และ{' '}
      <a href="/privacy" target="_blank" rel="noopener noreferrer"
         className="text-[#1B3A6B] dark:text-[#8FB4FF] underline">นโยบายความเป็นส่วนตัว</a>
      {' '}และยินยอมให้ TunDee เก็บข้อมูลการศึกษาของคุณเพื่อแนะนำทุนที่ตรงกับคุณ
    </p>
  );
}
