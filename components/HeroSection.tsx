'use client';

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';

export default function HeroSection() {
  const { lang } = useLang();
  const h = translations.hero;
  const headline = lang === 'th' ? h.headline_th : h.headline_en;
  const lines = headline.split('\n');

  return (
    <section className="section-pad bg-white">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 bg-[#FFF8E7] border border-[#F0A500]/30 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#F0A500] inline-block" />
            <span className="text-sm text-[#F0A500] font-medium">{h.eyebrow[lang]}</span>
          </div>

          {/* Headline */}
          <h1
            className="font-display mb-6"
            style={{
              fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif',
              fontSize: 'clamp(2.5rem, 6vw, 5rem)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            {lines.map((line, i) => (
              <span key={i} className="block">
                {i === 1 ? <span className="text-[#F0A500]">{line}</span> : line}
              </span>
            ))}
          </h1>

          {/* Subtext */}
          <p
            className="text-lg md:text-xl text-[#6E6E73] leading-relaxed mb-10 max-w-xl"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {lang === 'th' ? h.sub_th : h.sub_en}
          </p>

          {/* CTA */}
          <Link
            href="/scholarships"
            className="inline-flex items-center bg-[#F0A500] text-white font-semibold px-8 py-4 rounded-full hover:bg-[#D4920A] transition-colors duration-200 text-base shadow-sm"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {h.cta[lang]}
          </Link>
        </div>
      </div>
    </section>
  );
}
