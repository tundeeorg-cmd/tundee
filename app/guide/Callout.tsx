import type { Bi } from './content';

interface Props {
  variant: 'tip' | 'warning' | 'privacy';
  text: Bi;
  lang: 'th' | 'en';
}

const STYLES = {
  tip: {
    wrap: 'bg-[#EFF4FF] dark:bg-[#0D1F35] border-[#2E6BE6]/30 dark:border-[#2E6BE6]/40',
    icon: 'bg-[#2E6BE6] text-white',
    label: { th: 'เคล็ดลับ', en: 'Tip' },
    glyph: '💡',
  },
  warning: {
    wrap: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700',
    icon: 'bg-amber-500 text-white',
    label: { th: 'ข้อควรระวัง', en: 'Warning' },
    glyph: '⚠️',
  },
  privacy: {
    wrap: 'bg-[#EBF2FF] dark:bg-[#0A1628] border-[#0A2342]/20 dark:border-[#1A2E4A]',
    icon: 'bg-[#0A2342] text-white',
    label: { th: 'ความเป็นส่วนตัว', en: 'Privacy' },
    glyph: '🔒',
  },
} as const;

export default function Callout({ variant, text, lang }: Props) {
  const s = STYLES[variant];
  return (
    <div className={`flex gap-3 rounded-[12px] border px-4 py-4 ${s.wrap}`}>
      <span
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm ${s.icon}`}
        aria-hidden="true"
      >
        {s.glyph}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6E7A8A] dark:text-[#7A8FA8] mb-1">
          {s.label[lang]}
        </p>
        <p
          lang={lang}
          className="text-sm leading-relaxed text-[#1D1D1F] dark:text-[#E8EDF5]"
          style={{ fontFamily: lang === 'th' ? "'Sarabun', sans-serif" : 'var(--font-lato), Lato, sans-serif' }}
        >
          {text[lang]}
        </p>
      </div>
    </div>
  );
}
