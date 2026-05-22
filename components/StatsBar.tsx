'use client';

import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';

export default function StatsBar() {
  const { lang } = useLang();
  const s = translations.stats;

  const stats = [
    { value: s.scholarships[lang], icon: '🎓' },
    { value: s.provinces[lang], icon: '📍' },
    { value: s.free[lang], icon: '✓' },
  ];

  return (
    <div className="bg-[#F5F5F7] border-y border-[#E5E5EA]">
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-4 md:gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div
                className="text-base md:text-lg font-semibold text-[#1D1D1F]"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
