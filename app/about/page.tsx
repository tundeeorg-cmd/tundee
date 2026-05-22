'use client';

import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';

const FOUNDER_INITIAL = 'J';
const FOUNDER_COLOR = '#F0A500';

export default function AboutPage() {
  const { lang } = useLang();
  const a = translations.about;

  return (
    <div className="bg-white min-h-screen">
      {/* Header */}
      <div className="bg-[#F5F5F7] border-b border-[#E5E5EA]">
        <div className="max-w-[1200px] mx-auto px-6 py-16">
          <h1
            className="text-3xl md:text-5xl text-[#1D1D1F] mb-4"
            style={{
              fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif',
              fontWeight: 300,
            }}
          >
            {a.title[lang]}
          </h1>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-16 space-y-20">
        {/* Mission */}
        <section className="max-w-2xl">
          <h2 className="text-xs font-semibold text-[#F0A500] uppercase tracking-widest mb-4">
            {a.mission_label[lang]}
          </h2>
          <p
            className="text-xl md:text-2xl text-[#1D1D1F] leading-relaxed"
            style={{
              fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif',
              fontWeight: 300,
            }}
          >
            {a.mission[lang]}
          </p>
        </section>

        {/* Problem / Solution */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest mb-4">
                {a.problem_label[lang]}
              </h2>
              <p
                className="text-base text-[#1D1D1F] leading-relaxed"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {a.problem[lang]}
              </p>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest mb-4">
                {a.solution_label[lang]}
              </h2>
              <p
                className="text-base text-[#1D1D1F] leading-relaxed"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {a.solution[lang]}
              </p>
            </div>
          </div>
        </section>

        {/* Stats banner */}
        <section className="bg-[#FFF8E7] border border-[#F0A500]/20 rounded-[12px] p-8 md:p-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { value: '3,000+', label: a.stats_scholarships[lang] },
              { value: '77', label: a.stats_provinces[lang] },
              { value: '฿0', label: a.stats_cost[lang] },
            ].map((stat, i) => (
              <div key={i}>
                <div
                  className="text-4xl font-semibold text-[#F0A500] mb-2"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {stat.value}
                </div>
                <div className="text-sm text-[#6E6E73]">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Team — founder only */}
        <section>
          <h2 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest mb-8">
            {a.team_label[lang]}
          </h2>
          <div className="max-w-sm mx-auto">
            <div className="bg-white border border-[#E5E5EA] rounded-[12px] p-8 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-shadow flex flex-col items-center text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-semibold mb-4"
                style={{ background: FOUNDER_COLOR }}
              >
                {FOUNDER_INITIAL}
              </div>
              <p
                className="text-sm font-medium text-[#6E6E73]"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {a.founder_title[lang]}
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#F5F5F7] rounded-[12px] p-8 md:p-12 text-center">
          <h2
            className="text-xl md:text-2xl text-[#1D1D1F] mb-4"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif', fontWeight: 300 }}
          >
            {a.cta_heading[lang]}
          </h2>
          <a
            href="/scholarships"
            className="inline-flex items-center bg-[#F0A500] text-white font-semibold px-8 py-4 rounded-full hover:bg-[#D4920A] transition-colors duration-200 text-sm"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {a.cta_button[lang]}
          </a>
        </section>
      </div>
    </div>
  );
}
