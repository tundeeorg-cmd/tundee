'use client';

import { useLang } from '@/lib/LanguageContext';

export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  const th = lang === 'th';

  return (
    <button
      onClick={() => setLang(th ? 'en' : 'th')}
      className="text-sm font-medium text-[#8A96A8] dark:text-[#7A8FA8] hover:text-[#0A2342] dark:hover:text-white transition-colors duration-200"
      style={{ fontFamily: 'var(--font-lato), Lato, sans-serif', letterSpacing: '0.02em' }}
      aria-label="Toggle language"
    >
      <span className={th ? 'text-[#0A2342] dark:text-white font-semibold' : 'text-[#8A96A8] dark:text-[#7A8FA8]'}>TH</span>
      <span className="mx-1 text-[#DDE3EE] dark:text-[#1A2E4A]">/</span>
      <span className={!th ? 'text-[#0A2342] dark:text-white font-semibold' : 'text-[#8A96A8] dark:text-[#7A8FA8]'}>EN</span>
    </button>
  );
}
