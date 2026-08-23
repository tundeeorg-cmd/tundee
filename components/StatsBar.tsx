'use client';

import { useLang } from '@/lib/LanguageContext';
import type { ScholarshipStats } from '@/lib/scholarships/counts';

interface Props {
  stats: ScholarshipStats;
}

/**
 * The three-up stat band under the hero.
 *
 * Every number here is a live count over the same rows the public search page shows,
 * so a visitor can reproduce each one by counting results. No `+` suffix: the database
 * knows the exact figure, and "518+" claims something more than 518 that nothing
 * substantiates.
 *
 * The middle tile used to read "77 / จังหวัดทั่วไทย". `td_scholarships` has no province
 * column at all — eligibility is free text in `region_eligibility`, whose values are
 * mostly countries — so no province count, covered or otherwise, can be derived. It was
 * a coverage claim with nothing behind it. Distinct funders is a real count of a real
 * column and answers a similar question: how much of the field this covers.
 */
export default function StatsBar({ stats }: Props) {
  const { lang } = useLang();
  const th = lang === 'th';

  // A failed query hides the band. Showing zeros would read as "no scholarships".
  if (!stats.ok) return null;

  const tiles = [
    {
      value:   stats.scholarships.toLocaleString(th ? 'th-TH' : 'en-US'),
      thLabel: 'ทุนการศึกษา',
      enLabel: 'Scholarships',
    },
    {
      value:   stats.funders.toLocaleString(th ? 'th-TH' : 'en-US'),
      thLabel: 'ผู้ให้ทุน',
      enLabel: 'Funders',
    },
    {
      value:   th ? 'ฟรี' : 'Free',
      thLabel: 'ตลอด',
      enLabel: 'Always',
    },
  ];

  return (
    <div className="bg-white border-t border-b border-[#E8ECF2] dark:bg-[#0A1628] dark:border-[#1A2E4A]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-3 divide-x divide-[#E8ECF2] dark:divide-[#1A2E4A]">
          {tiles.map((tile, i) => (
            <div key={i} className="py-5 px-4 text-center">
              <div
                className="text-2xl font-bold text-[#1B3A6B] dark:text-[#4A7FD4] leading-none mb-1"
                style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
              >
                {tile.value}
              </div>
              <div
                className="text-[13px] text-[#6E7A8A] dark:text-[#7A8FA8] leading-tight"
                style={{ fontFamily: th ? "'Sarabun', sans-serif" : 'var(--font-lato), Lato, sans-serif' }}
              >
                {th ? tile.thLabel : tile.enLabel}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
