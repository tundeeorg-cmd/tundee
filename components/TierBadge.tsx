'use client';

import { translations } from '@/lib/translations';

type Tier = 'SAFETY' | 'TARGET' | 'REACH';

const TIER_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  SAFETY: { bg: '#EAFAF1', text: '#1E8449', dot: '🟢' },
  TARGET: { bg: '#FFF8E7', text: '#D35400', dot: '🟡' },
  REACH:  { bg: '#FDEDEC', text: '#C0392B', dot: '🔴' },
};

interface Props {
  tier: string;   // string (not strict Tier) so unknown values don't crash
  lang: string;
  size?: 'sm' | 'md';
}

export default function TierBadge({ tier, lang, size = 'sm' }: Props) {
  // Normalise to uppercase so 'safety' / 'Safety' / 'SAFETY' all work
  const key = tier.toUpperCase() as Tier;
  const style = TIER_STYLES[key];

  // Unknown tier value — render nothing rather than crash
  if (!style) return null;

  const tierTranslations = translations.tier as Record<string, { th: string; en: string }>;
  const label = tierTranslations[key]?.[lang as 'th' | 'en'] ?? key;

  const px = size === 'md' ? '10px' : '8px';
  const py = size === 'md' ? '4px' : '2px';
  const fontSize = size === 'md' ? '12px' : '11px';

  return (
    <span
      style={{
        background: style.bg,
        color: style.text,
        padding: `${py} ${px}`,
        borderRadius: '20px',
        fontSize,
        fontWeight: 600,
        lineHeight: 1.3,
        whiteSpace: 'nowrap' as const,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
      }}
    >
      <span style={{ fontSize: size === 'md' ? '11px' : '10px' }}>{style.dot}</span>
      {label}
    </span>
  );
}
