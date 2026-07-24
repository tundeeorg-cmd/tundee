'use client';

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import Callout from './Callout';
import GuideToc from './GuideToc';
import {
  GUIDE_META,
  STEPS,
  NOTIFICATIONS,
  FAQ,
  FAQ_HEADING,
  TROUBLESHOOTING,
  TROUBLESHOOTING_HEADING,
  CLOSING_CTA,
  TOC_ENTRIES,
} from './content';

const SCROLL_OFFSET = 'scroll-mt-[76px]';

export default function GuideContent() {
  const { lang } = useLang();
  const font = lang === 'th' ? "'Sarabun', sans-serif" : 'var(--font-lato), Lato, sans-serif';

  return (
    <div lang={lang} className="bg-[#F5F7FA] dark:bg-[#07111F] min-h-screen">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 sm:py-14">

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <header className="max-w-2xl mb-8 sm:mb-12">
          <h1
            className="text-2xl sm:text-4xl font-bold text-[#0A2342] dark:text-white leading-tight mb-3"
            style={{ fontFamily: font }}
          >
            {GUIDE_META.title[lang]}
          </h1>
          <p
            className="text-base text-[#6E7A8A] dark:text-[#7A8FA8] leading-relaxed mb-4"
            style={{ fontFamily: font }}
          >
            {GUIDE_META.subtitle[lang]}
          </p>
          <div className="flex items-center gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1B3A6B] dark:text-[#4A7FD4] bg-[#EFF4FF] dark:bg-[#0D1F35] rounded-full px-3 py-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 7v5l3 3" />
              </svg>
              {GUIDE_META.readTime[lang]}
            </span>
          </div>
          <p
            className="text-[15px] text-[#3A3A3C] dark:text-[#ADADB8] leading-relaxed"
            style={{ fontFamily: font }}
          >
            {GUIDE_META.intro[lang]}
          </p>
        </header>

        {/* ── Body: TOC sidebar + content ────────────────────────────────── */}
        <div className="lg:flex lg:gap-10">
          <GuideToc entries={TOC_ENTRIES} lang={lang} />

          <main className="min-w-0 flex-1 space-y-14">

            {/* ── Numbered steps ──────────────────────────────────────────── */}
            {STEPS.map((step) => (
              <section key={step.id} id={step.id} className={SCROLL_OFFSET}>
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="shrink-0 w-8 h-8 rounded-full bg-[#1B3A6B] text-white text-sm font-bold flex items-center justify-center"
                    aria-hidden="true"
                  >
                    {step.number}
                  </span>
                  <h2
                    className="text-xl sm:text-2xl font-bold text-[#0A2342] dark:text-white leading-snug"
                    style={{ fontFamily: font }}
                  >
                    {step.heading[lang]}
                  </h2>
                </div>

                <div className="ml-11 space-y-4">
                  {step.intro && (
                    <p className="text-[15px] text-[#3A3A3C] dark:text-[#ADADB8] leading-relaxed" style={{ fontFamily: font }}>
                      {step.intro[lang]}
                    </p>
                  )}

                  {step.listType !== 'none' && step.items && (
                    step.listType === 'ordered' ? (
                      <ol className="space-y-2.5 list-decimal list-outside pl-5 marker:text-[#1B3A6B] marker:font-semibold">
                        {step.items.map((item, i) => (
                          <li key={i} className="text-[15px] text-[#1D1D1F] dark:text-[#E8EDF5] leading-relaxed pl-1" style={{ fontFamily: font }}>
                            {item[lang]}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <ul className="space-y-2.5 list-disc list-outside pl-5 marker:text-[#1B3A6B]">
                        {step.items.map((item, i) => (
                          <li key={i} className="text-[15px] text-[#1D1D1F] dark:text-[#E8EDF5] leading-relaxed pl-1" style={{ fontFamily: font }}>
                            {item[lang]}
                          </li>
                        ))}
                      </ul>
                    )
                  )}

                  {step.outro && (
                    <p className="text-[15px] text-[#3A3A3C] dark:text-[#ADADB8] leading-relaxed" style={{ fontFamily: font }}>
                      {step.outro[lang]}
                    </p>
                  )}

                  {step.callouts?.map((c, i) => (
                    <Callout key={i} variant={c.variant} text={c.text} lang={lang} />
                  ))}
                </div>
              </section>
            ))}

            {/* ── Notifications ────────────────────────────────────────────── */}
            <section id={NOTIFICATIONS.id} className={SCROLL_OFFSET}>
              <h2
                className="text-xl sm:text-2xl font-bold text-[#0A2342] dark:text-white leading-snug mb-3"
                style={{ fontFamily: font }}
              >
                {NOTIFICATIONS.heading[lang]}
              </h2>
              <p className="text-[15px] text-[#3A3A3C] dark:text-[#ADADB8] leading-relaxed" style={{ fontFamily: font }}>
                {NOTIFICATIONS.body[lang]}
              </p>
            </section>

            {/* ── FAQ ──────────────────────────────────────────────────────── */}
            <section id="faq" className={SCROLL_OFFSET}>
              <h2
                className="text-xl sm:text-2xl font-bold text-[#0A2342] dark:text-white leading-snug mb-4"
                style={{ fontFamily: font }}
              >
                {FAQ_HEADING[lang]}
              </h2>
              <div className="space-y-2">
                {FAQ.map((item, i) => (
                  <details
                    key={i}
                    className="group rounded-[12px] border border-[#E8ECF2] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] px-5 py-1 open:pb-4"
                  >
                    <summary
                      className="flex items-center justify-between gap-3 py-3.5 cursor-pointer text-sm font-semibold text-[#0A2342] dark:text-white list-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A6B] rounded-md"
                      style={{ fontFamily: font }}
                    >
                      {item.q[lang]}
                      <svg
                        className="w-4 h-4 shrink-0 text-[#8A96A8] transition-transform group-open:rotate-45"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </summary>
                    <p className="text-sm text-[#3A3A3C] dark:text-[#ADADB8] leading-relaxed" style={{ fontFamily: font }}>
                      {item.a[lang]}
                    </p>
                  </details>
                ))}
              </div>
            </section>

            {/* ── Troubleshooting ──────────────────────────────────────────── */}
            <section id="troubleshooting" className={SCROLL_OFFSET}>
              <h2
                className="text-xl sm:text-2xl font-bold text-[#0A2342] dark:text-white leading-snug mb-4"
                style={{ fontFamily: font }}
              >
                {TROUBLESHOOTING_HEADING[lang]}
              </h2>
              <div className="space-y-3">
                {TROUBLESHOOTING.map((item, i) => (
                  <div key={i} className="rounded-[12px] border border-[#E8ECF2] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] px-5 py-4">
                    <p className="text-sm font-semibold text-[#0A2342] dark:text-white mb-1" style={{ fontFamily: font }}>
                      {item.problem[lang]}
                    </p>
                    <p className="text-sm text-[#3A3A3C] dark:text-[#ADADB8] leading-relaxed" style={{ fontFamily: font }}>
                      {item.solution[lang]}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Closing CTA ──────────────────────────────────────────────── */}
            <section className="rounded-[16px] bg-[#0A2342] px-6 py-10 text-center">
              <p
                className="text-white text-lg sm:text-xl font-semibold mb-6 max-w-md mx-auto leading-relaxed"
                style={{ fontFamily: font }}
              >
                {CLOSING_CTA.text[lang]}
              </p>
              <Link
                href={CLOSING_CTA.href}
                className="inline-flex items-center gap-2 bg-white text-[#0A2342] font-bold text-sm px-7 py-3.5 rounded-full hover:bg-[#EFF4FF] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {CLOSING_CTA.button[lang]}
              </Link>
            </section>

          </main>
        </div>
      </div>
    </div>
  );
}
