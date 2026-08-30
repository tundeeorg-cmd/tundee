'use client';

/**
 * "ทำไม TunDee ถึงฟรี" — the answer to the question a Thai student actually has.
 *
 * Scam sites advertising free scholarships are common enough that "free" is itself a
 * warning sign. So this does not argue that TunDee is trustworthy; it states, flatly and
 * without adjectives, what TunDee takes and does not take. A visitor deciding whether to
 * hand over their data is answering "what do you want from me?", and the only useful
 * reply is a specific one.
 *
 * Two renderings of one list, because the doubt shows up in two places:
 *   <WhyTunDeeIsFree />     the full six points, on /about
 *   <WhyFreeCondensed />    three of them, beside the signup gate where the doubt bites
 *
 * The Thai copy is verbatim from the brief and must stay that way — it was written to be
 * read by a suspicious sixteen-year-old, not edited for tone. The English is a faithful
 * translation of the same claims, added because /about renders in both languages and a
 * half-translated trust section undermines the point of the section.
 *
 * Colour lives in className, not in the inline style. The rest of this page sets
 * `style={{ color: '#0A2342' }}` alongside `className="dark:text-[...]"`, and the inline
 * declaration wins — so those headings compute to near-black navy on the near-black navy
 * dark background and are effectively invisible. Matching the site's colour system means
 * matching the intent, not reproducing that.
 */

import { useLang } from '@/lib/LanguageContext';

interface Point {
  th: string;
  en: string;
}

/**
 * Ordered as the doubt arrives: who are you, what do you charge, who pays you, what
 * happens to my data, is this a loan, and who am I actually applying to.
 */
export const WHY_FREE_POINTS: readonly Point[] = [
  {
    th: 'TunDee เป็นโครงการที่ไม่แสวงหากำไร ไม่มีรายได้จากผู้ใช้',
    en: 'TunDee is a non-profit project. It earns no revenue from its users.',
  },
  {
    th: 'เราไม่เก็บค่าสมัคร ค่าบริการ หรือค่าดำเนินการใด ๆ ไม่ว่าขั้นตอนไหน',
    en: 'We charge no application fee, service fee, or processing fee, at any stage.',
  },
  {
    th: 'เราไม่รับโฆษณาจากผู้ให้ทุน ผลการค้นหาจึงไม่มีใครซื้อลำดับได้',
    en: 'We accept no advertising from funders, so nobody can buy a place in your results.',
  },
  {
    th: 'เราไม่ขายหรือส่งต่อข้อมูลของคุณให้บุคคลที่สาม',
    en: 'We do not sell or pass your information to third parties.',
  },
  {
    th: 'ทุนบน TunDee เป็นทุนให้เปล่า ไม่ใช่เงินกู้ ไม่ต้องใช้คืน',
    en: 'Scholarships on TunDee are grants, not loans. Nothing has to be paid back.',
  },
  {
    // Reworded from "การสมัครทำที่เว็บของผู้ให้ทุนโดยตรงเสมอ". That claimed every
    // application link leads straight to the funder, and it does not: application_url
    // is a third-party aggregator for 373 of the 491 displayed scholarships. What is
    // true — and is the part that actually answers the doubt — is that TunDee never
    // takes the application itself, so it can never take a fee for one.
    th: 'TunDee ไม่ใช่ผู้ให้ทุน เราเป็นตัวกลางรวบรวมข้อมูล และไม่รับสมัครแทนผู้ให้ทุน การสมัครทำนอก TunDee เสมอ',
    en: 'TunDee is not a funder. We collect and organise information, and never take applications on a funder’s behalf — applying always happens outside TunDee.',
  },
] as const;

/**
 * The three that answer "what do you want from me?" most directly — fees, data, and
 * whether this is debt. Chosen from the six rather than rewritten, so the gate and the
 * About page never say slightly different things.
 */
export const CONDENSED_POINTS: readonly Point[] = [
  WHY_FREE_POINTS[1],
  WHY_FREE_POINTS[3],
  WHY_FREE_POINTS[4],
] as const;

// ─── Full section, for /about ────────────────────────────────────────────────

export default function WhyTunDeeIsFree() {
  const { lang } = useLang();
  const th = lang === 'th';
  const face = th
    ? 'Sarabun, system-ui, sans-serif'
    : 'var(--font-lato), Lato, system-ui, sans-serif';

  return (
    <section className="bg-white dark:bg-[#07111F] px-6 py-16 md:py-20">
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
          {th ? 'ความโปร่งใส' : 'TRANSPARENCY'}
        </p>
        <h2
          style={{ fontSize: '2rem', fontWeight: 300, fontFamily: face }}
          className="mb-10 text-[#0A2342] dark:text-[#E8EDF5]"
        >
          {th ? 'ทำไม TunDee ถึงฟรี' : 'Why TunDee is free'}
        </h2>

        <ul className="divide-y divide-[#E8ECF2] dark:divide-[#1A2E4A]">
          {WHY_FREE_POINTS.map((point, i) => (
            <li key={i} style={{ padding: '18px 0' }} className="flex gap-4 items-start">
              {/* Decorative only: the list already conveys structure to a screen reader. */}
              <span
                aria-hidden="true"
                className="shrink-0 mt-[7px] rounded-full bg-[#DDE3EE] dark:bg-[#1A2E4A]"
                style={{ width: '5px', height: '5px' }}
              />
              <p
                style={{ fontSize: '15px', lineHeight: 1.75, fontFamily: face }}
                className="text-[#3C4A5C] dark:text-[#B6C4D6]"
              >
                {th ? point.th : point.en}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── Condensed, for beside the signup gate ───────────────────────────────────

/**
 * Deliberately quiet: this sits next to a call to action and is there to remove a reason
 * to leave, not to compete with the button for attention.
 */
export function WhyFreeCondensed({ className = '' }: { className?: string }) {
  const { lang } = useLang();
  const th = lang === 'th';
  const face = th
    ? 'Sarabun, system-ui, sans-serif'
    : 'var(--font-lato), Lato, system-ui, sans-serif';

  return (
    <div className={className}>
      <p
        className="mb-2"
        style={{
          // No text-transform here, unlike the eyebrows elsewhere on the site. Those
          // label English words; this one contains the brand, and uppercasing rendered
          // it "ทำไม TUNDEE ถึงฟรี". A trust block that cannot spell its own name is a
          // poor advertisement for the claims underneath it. The English string is
          // capitalised in the source instead, so both languages read as intended.
          fontSize: '11px',
          letterSpacing: '1.5px',
          color: '#8A96A8',
          fontFamily: 'var(--font-lato), Lato, system-ui, sans-serif',
        }}
      >
        {th ? 'ทำไม TunDee ถึงฟรี' : 'WHY TUNDEE IS FREE'}
      </p>
      <ul className="space-y-1.5">
        {CONDENSED_POINTS.map((point, i) => (
          <li key={i} className="flex gap-2.5 items-start">
            <span
              aria-hidden="true"
              className="shrink-0 mt-[7px] rounded-full bg-[#DDE3EE] dark:bg-[#1A2E4A]"
              style={{ width: '4px', height: '4px' }}
            />
            <p
              style={{ fontSize: '13px', lineHeight: 1.65, fontFamily: face }}
              className="text-[#6E7A8A] dark:text-[#7A8FA8]"
            >
              {th ? point.th : point.en}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
