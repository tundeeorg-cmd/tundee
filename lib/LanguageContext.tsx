'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Language } from './types';

interface LanguageContextValue {
  lang: Language;
  setLang: (l: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'th',
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('th');

  useEffect(() => {
    const stored = localStorage.getItem('tundee_lang') as Language | null;
    const initial = (stored === 'th' || stored === 'en') ? stored : 'th';
    setLangState(initial);
    document.documentElement.classList.toggle('thai-mode', initial === 'th');
  }, []);

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem('tundee_lang', l);
    document.documentElement.classList.toggle('thai-mode', l === 'th');
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  return useContext(LanguageContext);
}
