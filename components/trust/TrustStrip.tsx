'use client';

import { scholarshipCountLabel } from '@/lib/scholarships/publicRule';

/**
 * The scale of the catalogue, stated in one line, at the two moments doubt shows up:
 * before answering the questions and before handing over an email.
 *
 * Every segment is a number read from the database at request time, or a claim that can
 * be checked against it. The scholarship count falls back to the floor ("กว่า 200
 * ทุน") when unavailable; the funder segment is dropped, which is why the line is
 * assembled from a filtered array instead of a template string.
 *
 * Two segments from the brief are deliberately absent:
 *
 *   "ครบ 77 จังหวัด" — the catalogue does not support it. region_eligibility happens to
 *   hold exactly 77 distinct values, which is almost certainly where the number came
 *   from, but they are countries and study destinations: Australia 114, National
 *   (Thailand) 84, United Kingdom 58. Named Thai provinces come to six.
 *
 *   "ตรวจสอบโดยคนจริง" — 76 of the 491 displayed scholarships are human-verified. The
 *   same claim was removed from /about for the same reason; reinstating it here would put
 *   the site back to contradicting itself two pages apart. "ตรวจสอบโดยทีมงาน" is the
 *   wording that replaced it there, and it is used here so the two agree.
 */

interface Props {
  scholarships: number | null;
  funders: number | null;
  lang: 'th' | 'en';
  className?: string;
}

export default function TrustStrip({ scholarships, funders, lang, className = '' }: Props) {
  const th = lang === 'th';
  const n = (v: number) => v.toLocaleString(th ? 'th-TH' : 'en-US');

  const segments = [
    // Never dropped: falls back to the floor ("กว่า 200 ทุน") when the count is unavailable.
    th ? `${scholarshipCountLabel(scholarships, 'th')} ทุน` : `${scholarshipCountLabel(scholarships, 'en')} scholarships`,
    funders !== null ? (th ? `${n(funders)} ผู้ให้ทุน` : `${n(funders)} funders`) : null,
    th ? 'ฟรีตลอด' : 'Always free',
    th ? 'ตรวจสอบโดยทีมงาน' : 'Checked by our team',
  ].filter(Boolean) as string[];

  return (
    <p
      className={`text-[11px] leading-relaxed text-muted ${className}`}
      style={{ fontFamily: th ? 'Sarabun, system-ui, sans-serif' : undefined }}
    >
      {segments.join(' · ')}
    </p>
  );
}
