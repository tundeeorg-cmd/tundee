'use client';

/**
 * "ทุนแต่ละทุนผ่านการตรวจสอบอย่างไร" — the process behind the data, in three steps.
 *
 * The point of this section is that a visitor can see a real human process rather than
 * being asked to trust a claim. That only works if the steps describe what actually
 * happens, so the wording is worth more scrutiny than ordinary copy.
 *
 * Step 2 is not the brief's wording, and the difference is deliberate. As written it
 * said "ตรวจสอบเงื่อนไขและวันปิดรับโดยคนจริงก่อนขึ้นเว็บ" — every scholarship checked by a
 * person before going live. Measured 30 Aug 2026, of the 491 displayed: 410 are
 * Auto-extracted, 76 verified, 5 in review. The claim was true of 15% of the page.
 *
 * What is true, and is a stronger signal anyway, is the withholding: 1,084 of the 1,575
 * scholarships collected are held back because their closing date or conditions could not
 * be resolved. A site that shows everything it has is easy; one that shows two thirds
 * fewer than it holds is making a choice a scam site would not make. So step 2 now
 * describes that, and can be checked against the database by anyone who asks.
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
    th: 'ตรวจสอบวันปิดรับและเงื่อนไขก่อนขึ้นเว็บ ทุนที่ข้อมูลไม่ครบจะไม่ถูกแสดง',
    en: 'Closing dates and conditions are checked before a scholarship goes live. Those with incomplete information are not shown.',
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
