'use client';

import { useLang } from '@/lib/LanguageContext';

interface Props {
  scholarshipCount?: number;
}

export default function StatsBar({ scholarshipCount }: Props) {
  const { lang } = useLang();
  const th = lang === 'th';
  const count = scholarshipCount ?? 90;

  const stats = [
    { value: `${count}+`, thLabel: 'ทุนการศึกษา',    enLabel: 'Scholarships' },
    { value: '77',        thLabel: 'จังหวัดทั่วไทย', enLabel: 'Provinces' },
    { value: th ? 'ฟรี' : 'Free', thLabel: 'ตลอด',  enLabel: 'Always' },
  ];

  return (
    <div className="bg-white border-t border-b border-[#E8ECF2] dark:bg-[#0A1628] dark:border-[#1A2E4A]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-3 divide-x divide-[#E8ECF2] dark:divide-[#1A2E4A]">
          {stats.map((stat, i) => (
            <div key={i} className="py-5 px-4 text-center">
              <div
                className="text-2xl font-bold text-[#1B3A6B] dark:text-[#4A7FD4] leading-none mb-1"
                style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
              >
                {stat.value}
              </div>
              <div
                className="text-[13px] text-[#6E7A8A] dark:text-[#7A8FA8] leading-tight"
                style={{ fontFamily: th ? "'Sarabun', sans-serif" : 'var(--font-lato), Lato, sans-serif' }}
              >
                {th ? stat.thLabel : stat.enLabel}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
