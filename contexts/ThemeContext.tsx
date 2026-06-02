'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  isDark: boolean; // resolved actual dark/light after applying auto
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'auto',
  setTheme: () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('auto');
  const [systemDark, setSystemDark] = useState(false);

  // Read saved theme on mount
  useEffect(() => {
    const saved = (localStorage.getItem('tundee_theme') as ThemeMode) ?? 'auto';
    setThemeState(saved);
    // Listen for system preference changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Apply dark class whenever theme or systemDark changes
  useEffect(() => {
    const isDark = theme === 'dark' || (theme === 'auto' && systemDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, [theme, systemDark]);

  function setTheme(t: ThemeMode) {
    setThemeState(t);
    localStorage.setItem('tundee_theme', t);
  }

  const isDark = theme === 'dark' || (theme === 'auto' && systemDark);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
