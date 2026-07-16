import type { Language } from '@/lib/types';

export function t(th: string, en: string | null | undefined, lang: Language): string {
  if (lang === 'en' && en) return en;
  return th;
}

export function scholarshipName(
  s: { name_th: string; name_en?: string | null },
  lang: Language
): string {
  return lang === 'en' && s.name_en ? s.name_en : s.name_th;
}

export function funderName(
  s: { funder_name_th?: string | null; funder_name_en?: string | null },
  lang: Language
): string {
  const th = s.funder_name_th ?? '';
  return lang === 'en' && s.funder_name_en ? s.funder_name_en : th;
}

export function descriptionText(
  s: { description_th?: string | null; description_en?: string | null },
  lang: Language
): string | null {
  if (lang === 'en' && s.description_en) return s.description_en;
  return s.description_th ?? null;
}
