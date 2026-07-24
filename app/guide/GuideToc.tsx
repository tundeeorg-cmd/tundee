'use client';

import { useEffect, useRef, useState } from 'react';
import type { Bi } from './content';

interface Props {
  entries: { id: string; label: Bi }[];
  lang: 'th' | 'en';
}

export default function GuideToc({ entries, lang }: Props) {
  const [activeId, setActiveId] = useState(entries[0]?.id ?? '');
  const [mobileOpen, setMobileOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const headings = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null);

    if (headings.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (visibleEntries) => {
        const visible = visibleEntries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        // Trigger a bit below the sticky nav, and treat a section as "active"
        // once its heading has scrolled into the top third of the viewport.
        rootMargin: '-96px 0px -70% 0px',
        threshold: 0,
      }
    );

    headings.forEach((h) => observerRef.current?.observe(h));
    return () => observerRef.current?.disconnect();
  }, [entries]);

  function jumpTo(id: string) {
    setMobileOpen(false);
    // Wait for the dropdown-close reflow to settle before scrolling, otherwise
    // the collapsing accordion shifts the layout mid-scroll and the target
    // section ends up in the wrong place.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  return (
    <>
      {/* Desktop — sticky sidebar */}
      <nav
        aria-label={lang === 'th' ? 'สารบัญ' : 'Table of contents'}
        className="hidden lg:block sticky top-[76px] self-start w-56 shrink-0 max-h-[calc(100vh-96px)] overflow-y-auto pr-2"
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A96A8] dark:text-[#6E7A8A] mb-3">
          {lang === 'th' ? 'สารบัญ' : 'Contents'}
        </p>
        <ol className="space-y-1">
          {entries.map((e) => {
            const active = e.id === activeId;
            return (
              <li key={e.id}>
                <a
                  href={`#${e.id}`}
                  onClick={(ev) => { ev.preventDefault(); jumpTo(e.id); }}
                  aria-current={active ? 'true' : undefined}
                  className={`block rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A6B] ${
                    active
                      ? 'bg-[#EFF4FF] dark:bg-[#0D1F35] text-[#1B3A6B] dark:text-[#4A7FD4] font-semibold'
                      : 'text-[#6E7A8A] dark:text-[#7A8FA8] hover:text-[#0A2342] dark:hover:text-white'
                  }`}
                >
                  {e.label[lang]}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Mobile — collapsible jump-to dropdown */}
      <div className="lg:hidden mb-6">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="guide-mobile-toc"
          className="w-full flex items-center justify-between rounded-[12px] border border-[#E8ECF2] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] px-4 py-3 text-sm font-semibold text-[#0A2342] dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A6B]"
        >
          {lang === 'th' ? 'ไปยังหัวข้อ' : 'Jump to section'}
          <svg
            className={`w-4 h-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {mobileOpen && (
          <ol id="guide-mobile-toc" className="mt-2 rounded-[12px] border border-[#E8ECF2] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] divide-y divide-[#F0F2F6] dark:divide-[#1A2E4A] overflow-hidden">
            {entries.map((e) => (
              <li key={e.id}>
                <a
                  href={`#${e.id}`}
                  onClick={(ev) => { ev.preventDefault(); jumpTo(e.id); }}
                  className="block px-4 py-2.5 text-sm text-[#0A2342] dark:text-[#E8EDF5] hover:bg-[#F5F7FA] dark:hover:bg-[#0D1F35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#1B3A6B]"
                >
                  {e.label[lang]}
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
