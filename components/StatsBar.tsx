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
    { value: `${count}+`, th_label: 'ทุนการศึกษา', en_label: 'Scholarships' },
    { value: '77',        th_label: 'จังหวัด',      en_label: 'Provinces' },
    { value: th ? 'ฟรี' : 'Free', th_label: 'ตลอด', en_label: 'Always' },
  ];

  return (
    <div className="bg-white dark:bg-[#161B27] border-y border-[#DDE4EF] dark:border-[#232B3E]">
      <div className="max-w-[1200px] mx-auto px-6 py-6">
        <div className="grid grid-cols-3 divide-x divide-[#DDE4EF] dark:divide-[#232B3E]">
          {stats.map((stat, i) => (
            <div key={i} className="text-center px-4">
              <div
                className="text-[2.5rem] font-light text-[#2E6BE6] leading-none mb-1"
                style={{ fontFamily: 'var(--font-display, Cormorant Garamond, Georgia, serif)' }}
              >
                {stat.value}
              </div>
              <div
                className="text-[0.7rem] font-semibold text-[#4A5568] dark:text-[#8892A4] uppercase tracking-[2px]"
                style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
              >
                {th ? stat.th_label : stat.en_label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
