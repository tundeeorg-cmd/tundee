'use client';

import { useLang } from '@/lib/LanguageContext';

export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
      className="text-sm font-medium px-3 py-1.5 rounded-full border border-[#E5E5EA] hover:border-[#F0A500] hover:text-[#F0A500] transition-colors duration-200"
      aria-label="Toggle language"
    >
      {lang === 'th' ? 'EN' : 'ไทย'}
    </button>
  );
}
