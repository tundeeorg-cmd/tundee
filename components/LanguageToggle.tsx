'use client';

import { useEffect, useState } from 'react';
import type { Language } from '@/lib/types';

interface Props {
  lang: Language;
  onChange: (lang: Language) => void;
}

export default function LanguageToggle({ lang, onChange }: Props) {
  return (
    <button
      onClick={() => onChange(lang === 'th' ? 'en' : 'th')}
      className="text-sm font-medium px-3 py-1.5 rounded-full border border-[#E5E5EA] hover:border-[#F0A500] hover:text-[#F0A500] transition-colors duration-200"
      aria-label="Toggle language"
    >
      {lang === 'th' ? 'EN' : 'ไทย'}
    </button>
  );
}

export function useLanguage(): [Language, (l: Language) => void] {
  const [lang, setLang] = useState<Language>('th');

  useEffect(() => {
    const stored = localStorage.getItem('tundee_lang') as Language | null;
    if (stored === 'th' || stored === 'en') setLang(stored);
  }, []);

  const changeLang = (l: Language) => {
    setLang(l);
    localStorage.setItem('tundee_lang', l);
  };

  return [lang, changeLang];
}
