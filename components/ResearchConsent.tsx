'use client';

/**
 * Research participation consent (PREREG §12.4).
 *
 * SEPARATE from the terms of service. Declining costs the student nothing: the
 * product behaves identically and they are excluded from research datasets
 * only. That is what makes this consent rather than a toll gate.
 *
 * Deliberate design choices, all of them ethics requirements rather than taste:
 *   • Neither option is pre-selected. A pre-ticked box is not consent.
 *   • Agree and decline carry equal visual weight — no dark pattern steering.
 *   • Plain Thai at secondary-school reading level, because participants
 *     include minors. No legal register.
 *   • Under-18 students are asked for guardian acknowledgement, surfaced only
 *     when the server says it is required.
 */

import { useState } from 'react';

type Decision = 'agree' | 'decline';

const COPY = {
  heading: {
    th: 'ช่วยงานวิจัยเรื่องความเป็นธรรมทางการศึกษา',
    en: 'Help with research on educational fairness',
  },
  body: {
    th: 'เราเก็บข้อมูลการใช้งานแบบไม่ระบุตัวตน เพื่อศึกษาว่านักเรียนต่างจังหวัดเข้าถึงทุนได้ยากกว่าจริงหรือไม่ ข้อมูลของคุณจะไม่ถูกเปิดเผยเป็นรายบุคคล',
    en: 'We collect anonymized usage data to study whether students outside Bangkok have less access to scholarships. Your individual data is never published.',
  },
  optional: {
    th: 'ไม่ยินยอมก็ใช้งานได้ทุกฟีเจอร์ตามปกติ',
    en: 'You can decline and still use every feature normally.',
  },
  agree:   { th: 'ยินยอมเข้าร่วม', en: 'I agree to participate' },
  decline: { th: 'ไม่เข้าร่วม',     en: "Don't participate" },
  guardian: {
    th: 'ฉันอายุต่ำกว่า 18 ปี และผู้ปกครองรับทราบแล้ว',
    en: 'I am under 18 and my guardian knows about this.',
  },
  saved:   { th: 'บันทึกแล้ว ขอบคุณ', en: 'Saved — thank you.' },
  failed:  { th: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง', en: 'Could not save. Please try again.' },
} as const;

export default function ResearchConsent({
  lang,
  method = 'signup_inline',
  onDecided,
}: {
  lang: string;
  method?: 'signup_inline' | 'profile_settings' | 'line_optin';
  onDecided?: (consented: boolean) => void;
}) {
  const th = lang === 'th';
  const font = th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';

  const [decision, setDecision]       = useState<Decision | null>(null);
  const [needGuardian, setNeedGuardian] = useState(false);
  const [guardianOk, setGuardianOk]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [failed, setFailed]           = useState(false);

  async function submit(next: Decision) {
    setSaving(true);
    setFailed(false);

    try {
      const res = await fetch('/api/profile/student', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent_research: next === 'agree',
          guardian_consent: guardianOk,
          consent_method:   method,
        }),
      });

      if (res.status === 422) {
        // The server gates this, not the client: a minor cannot turn research
        // consent on without guardian acknowledgement.
        setNeedGuardian(true);
        setSaving(false);
        return;
      }
      if (!res.ok) {
        setFailed(true);
        setSaving(false);
        return;
      }

      setDecision(next);
      onDecided?.(next === 'agree');
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (decision) {
    return (
      <div className="rounded-xl border border-[#e0e0e0] dark:border-[#3a3a3c] bg-[#F7F9FC] dark:bg-[#0A1628] px-4 py-3">
        <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={{ fontFamily: font }}>
          {th ? COPY.saved.th : COPY.saved.en}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#0A1628] px-4 py-4">
      <h2
        className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2"
        style={{ fontFamily: font }}
      >
        {th ? COPY.heading.th : COPY.heading.en}
      </h2>

      <p
        className="text-sm leading-relaxed text-[#6e6e73] dark:text-[#aeaeb2] mb-2"
        style={{ fontFamily: font }}
      >
        {th ? COPY.body.th : COPY.body.en}
      </p>

      <p
        className="text-xs text-[#8e8e93] mb-4"
        style={{ fontFamily: font }}
      >
        {th ? COPY.optional.th : COPY.optional.en}
      </p>

      {needGuardian && (
        <label
          className="flex items-start gap-2.5 mb-4 cursor-pointer"
          style={{ fontFamily: font }}
        >
          <input
            type="checkbox"
            checked={guardianOk}
            onChange={(e) => setGuardianOk(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#1B3A6B]"
          />
          <span className="text-xs text-[#1D1D1F] dark:text-[#F5F5F7]">
            {th ? COPY.guardian.th : COPY.guardian.en}
          </span>
        </label>
      )}

      {failed && (
        <p className="text-xs text-[#C0392B] mb-3" style={{ fontFamily: font }}>
          {th ? COPY.failed.th : COPY.failed.en}
        </p>
      )}

      {/* Equal weight, deliberately: steering the student toward "agree" with
          visual hierarchy would undermine the consent it is collecting. */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={saving || (needGuardian && !guardianOk)}
          onClick={() => submit('agree')}
          className="w-full py-3 rounded-xl border-2 border-[#1B3A6B] text-[#1B3A6B] dark:text-[#8FB4FF] dark:border-[#8FB4FF] font-semibold text-sm transition-colors hover:bg-[#EBF2FF] dark:hover:bg-[#162552] disabled:opacity-50"
          style={{ fontFamily: font }}
        >
          {th ? COPY.agree.th : COPY.agree.en}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => submit('decline')}
          className="w-full py-3 rounded-xl border-2 border-[#e0e0e0] dark:border-[#3a3a3c] text-[#6e6e73] dark:text-[#aeaeb2] font-semibold text-sm transition-colors hover:bg-[#F7F9FC] dark:hover:bg-[#2c2c2e] disabled:opacity-50"
          style={{ fontFamily: font }}
        >
          {th ? COPY.decline.th : COPY.decline.en}
        </button>
      </div>
    </div>
  );
}
