'use client';

/**
 * "ทุนแต่ละทุนผ่านการตรวจสอบอย่างไร" — the process behind the data, in three steps.
 *
 * The point of this section is that a visitor can see a real human process rather than
 * being asked to trust a claim. That only works if the steps describe what actually
 * happens, so the wording is worth more scrutiny than ordinary copy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPEN QUESTION ON STEP 2 — measured 30 Aug 2026, awaiting a decision.
 *
 * Of the 491 scholarships currently displayed, verification_status is:
 *
 *     410  Auto-extracted (confirm deadline + link)   84%
 *      76  verified                                   15%
 *       3  Needs review                                1%
 *       2  In progress                                 0%
 *
 * As written, step 2 says every scholarship is checked by a person before it goes on the
 * site. That is true of 15% of them. The wording is the brief's, kept verbatim pending a
 * decision, and this comment exists so the discrepancy cannot be lost. Either the copy
 * softens to match the data ("ทุนส่วนหนึ่ง…" or a description of the auto-extraction step
 * followed by human review), or the 410 get reviewed and the claim becomes true.
 *
 * Steps 1 and 3 hold up: rows carry a source URL for the announcement they came from, and
 * the nightly cron in app/api/cron recomputes status_effective and removes closed rounds.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Thai copy is verbatim from the brief. English is a faithful translation of the same
 * claims, because /about renders in both languages.
 *
 * Colour lives in className, not in the inline style. The rest of this page sets
 * `style={{ color: '#0A2342' }}` alongside `className="dark:text-[...]"`, and the inline
 * declaration wins — so those headings compute to near-black navy on the near-black navy
 * dark background and are effectively invisible. Matching the site's colour system means
 * matching the intent, not reproducing that.
 */

import { useLang } from '@/lib/LanguageContext';

interface Step {
  num: string;
  th: string;
  en: string;
}

export const VERIFICATION_STEPS: readonly Step[] = [
  {
    num: '01',
    th: 'รวบรวมจากประกาศทางการของผู้ให้ทุนโดยตรง',
    en: 'Collected from funders’ own official announcements.',
  },
  {
    num: '02',
    // See the OPEN QUESTION above before changing or shipping this line.
    th: 'ตรวจสอบเงื่อนไขและวันปิดรับโดยคนจริงก่อนขึ้นเว็บ',
    en: 'Conditions and closing dates checked by a person before going live.',
  },
  {
    num: '03',
    th: 'ทบทวนซ้ำเป็นระยะ ทุนที่ปิดรับแล้วจะถูกนำออก',
    en: 'Reviewed again periodically. Scholarships that have closed are removed.',
  },
] as const;

export default function VerificationProcess() {
  const { lang } = useLang();
  const th = lang === 'th';
  const face = th
    ? 'Sarabun, system-ui, sans-serif'
    : 'var(--font-lato), Lato, system-ui, sans-serif';

  return (
    <section className="bg-[#F5F7FA] dark:bg-[#0A1628] px-6 py-16 md:py-20">
      <div className="max-w-[900px] mx-auto">
        <p
          className="mb-6"
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            color: '#8A96A8',
            fontFamily: 'var(--font-lato), Lato, system-ui, sans-serif',
          }}
        >
          {th ? 'การตรวจสอบ' : 'VERIFICATION'}
        </p>
        <h2
          style={{ fontSize: '2rem', fontWeight: 300, fontFamily: face }}
          className="mb-10 text-[#0A2342] dark:text-[#E8EDF5]"
        >
          {th ? 'ทุนแต่ละทุนผ่านการตรวจสอบอย่างไร' : 'How each scholarship is checked'}
        </h2>

        <ol className="divide-y divide-[#E8ECF2] dark:divide-[#1A2E4A]">
          {VERIFICATION_STEPS.map((step) => (
            <li key={step.num} className="py-6 flex gap-6 items-start">
              <span
                className="shrink-0 mt-0.5"
                style={{
                  fontSize: '11px',
                  color: '#DDE3EE',
                  fontFamily: 'var(--font-lato), Lato, system-ui, sans-serif',
                  letterSpacing: '1px',
                  minWidth: '24px',
                }}
              >
                {step.num}
              </span>
              <p
                style={{ fontSize: '15px', lineHeight: 1.75, fontFamily: face }}
                className="text-[#3C4A5C] dark:text-[#B6C4D6]"
              >
                {th ? step.th : step.en}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
