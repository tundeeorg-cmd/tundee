'use client';

import type { Ref } from 'react';
import { CONSENT_PARAM, CONSENT_VERSION } from '@/lib/consent';

const THAI = { fontFamily: 'Sarabun, sans-serif' } as const;

/**
 * The PDPA consent tick that every sign-in button sits behind.
 *
 * One component so the wording a student agrees to is identical wherever they
 * agree to it — /auth (app/auth/AuthForm.tsx) and the LINE button on /start
 * (components/start/LineQuickStart.tsx). /api/auth/line/start refuses to start
 * without it either way; this is the half the student sees.
 *
 * Thai only, deliberately, in both languages of the page: it is the text the
 * consent version was approved against.
 */
export default function ConsentCheckbox({
  checked,
  onChange,
  inputRef,
  className = '',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer select-none ${className}`} style={THAI}>
      <input
        ref={inputRef}
        type="checkbox"
        name={CONSENT_PARAM}
        value={CONSENT_VERSION}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-5 h-5 shrink-0 accent-[#1B3A6B] rounded"
      />
      <span className="text-xs leading-relaxed text-[#6E7A8A] dark:text-[#8e9bb0]">
        ฉันยอมรับ{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer"
           className="text-[#1B3A6B] dark:text-[#8FB4FF] underline">ข้อกำหนดการใช้งาน</a>
        {' '}และ{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer"
           className="text-[#1B3A6B] dark:text-[#8FB4FF] underline">นโยบายความเป็นส่วนตัว</a>
        {' '}และยินยอมให้ TunDee เก็บข้อมูลการศึกษาของฉันเพื่อแนะนำทุนที่ตรงกับฉัน
      </span>
    </label>
  );
}
