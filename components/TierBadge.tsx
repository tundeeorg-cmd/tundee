'use client';

import { translations } from '@/lib/translations';

type Tier = 'SAFETY' | 'TARGET' | 'REACH';

const TIER_STYLES: Record<Tier, { bg: string; text: string; dot: string }> = {
  SAFETY: { bg: '#EAFAF1', text: '#1E8449', dot: '🟢' },
  TARGET: { bg: '#FFF8E7', text: '#D35400', dot: '🟡' },
  REACH:  { bg: '#FDEDEC', text: '#C0392B', dot: '🔴' },
};

interface Props {
  tier: Tier;
  lang: string;
  size?: 'sm' | 'md';
}

export default function TierBadge({ tier, lang, size = 'sm' }: Props) {
  const style = TIER_STYLES[tier];
  const label = translations.tier[tier][lang as 'th' | 'en'];
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
