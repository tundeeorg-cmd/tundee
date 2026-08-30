'use client';

/**
 * When we last checked a scholarship, and where it came from.
 *
 * The two facts a suspicious student needs before spending effort: is this current, and
 * can I see it somewhere other than here. Both come from columns that are already
 * populated for every displayed scholarship — nothing here is estimated or filled in.
 *
 * The link's wording is decided per row by lib/scholarships/sourceLink, because we can
 * only prove the funder's own announcement for the 43 of 491 scholarships whose URL is on
 * a registry-controlled Thai institutional domain. The rest get a label that claims
 * nothing beyond what it is. See that module for why a blocklist would be the wrong shape.
 *
 * Missing data renders as nothing. Never a placeholder, never today's date: the whole
 * value of a "last checked" line is that it cannot be produced without a real check.
 */

import { formatVerifiedDate } from '@/lib/formatDate';
import { resolveSourceLink } from '@/lib/scholarships/sourceLink';

interface Props {
  lastVerified?: string | null;
  sourceUrl?: string | null;
  applicationUrl?: string | null;
  applicationLink?: string | null;
  /** Shown only in the full variant — the card already prints the funder above. */
  funder?: string | null;
  lang: 'th' | 'en';
  /**
   * 'card' drops the funder name from the link text. Names here run to forty characters
   * ("สถาบันเทคโนโลยีนานาชาติสิรินธร มหาวิทยาลัยธรรมศาสตร์"), which would wrap the label to
   * three lines in a grid tile — and the card prints the funder directly under the title
   * anyway, so nothing is lost by leaving it out of the link.
   */
  variant?: 'card' | 'full';
  className?: string;
}

export default function VerificationMeta({
  lastVerified,
  sourceUrl,
  applicationUrl,
  applicationLink,
  funder,
  lang,
  variant = 'card',
  className = '',
}: Props) {
  const th = lang === 'th';
  const checked = formatVerifiedDate(lastVerified, lang);
  const link = resolveSourceLink({
    source_url: sourceUrl,
    application_url: applicationUrl,
    application_link: applicationLink,
  });

  // Nothing verified and nowhere to point: render nothing rather than an empty row.
  if (!checked && !link) return null;

  const linkText = (() => {
    if (!link) return null;
    if (link.kind === 'official') {
      const name = variant === 'full' ? (funder ?? '').trim() : '';
      if (th) return name ? `ดูประกาศต้นทางจาก ${name}` : 'ดูประกาศต้นทาง';
      return name ? `View the original announcement from ${name}` : 'View the original announcement';
    }
    // Everything else. Says where we found it, which is all we can stand behind.
    return th ? 'ดูแหล่งที่มาของข้อมูล' : 'View the source of this listing';
  })();

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {checked && (
        <span className="text-[11px] text-[#8A96A8] dark:text-[#6B7C93]">
          {th ? `ตรวจสอบล่าสุด ${checked}` : `Last checked ${checked}`}
        </span>
      )}
      {link && linkText && (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-[#1B3A6B] dark:text-[#4A7FD4] hover:underline"
        >
          {linkText}
          <span aria-hidden="true">→</span>
        </a>
      )}
    </div>
  );
}
