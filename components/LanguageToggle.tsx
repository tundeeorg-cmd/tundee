'use client';

import { useLang } from '@/lib/LanguageContext';

export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  const th = lang === 'th';

  return (
    <button
      onClick={() => setLang(th ? 'en' : 'th')}
      className="text-sm font-medium text-[#4A5568] dark:text-[#8892A4] hover:text-[#0F1C33] dark:hover:text-[#EEF2FF] transition-colors duration-200"
      style={{ fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '0.02em' }}
      aria-label="Toggle language"
    >
      <span className={th ? 'text-[#0F1C33] dark:text-[#EEF2FF] font-semibold' : 'text-[#4A5568] dark:text-[#8892A4]'}>TH</span>
      <span className="mx-1 text-[#DDE4EF] dark:text-[#232B3E]">/</span>
      <span className={!th ? 'text-[#0F1C33] dark:text-[#EEF2FF] font-semibold' : 'text-[#4A5568] dark:text-[#8892A4]'}>EN</span>
    </button>
  );
}
