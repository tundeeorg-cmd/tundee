/**
 * Scholarships that are never matched to a student, whatever their profile. Pure.
 *
 * Two sources, both read from the DATA, never from a hard-coded scholarship id:
 *
 *  1. The admin flag. `verification_status` is the admin-only data-quality field
 *     (edited inline on /admin, every edit in td_audit_log; it no longer gates
 *     visibility). A value beginning "excluded" or "ineligible" — e.g.
 *     "Excluded: tobacco-industry funding" — takes the row out of every match list
 *     while leaving it browsable. NOTE: the bulk "verify" action overwrites this
 *     field, so re-check flagged rows after a bulk verify.
 *
 *  2. Tobacco-industry funding, from the funder and the title. Accepting such money
 *     is barred for public-health reasons (WHO FCTC Art. 5.3) and promoting it to
 *     students — most of them minors — is not something a matcher may do by
 *     accident. The rule names the industry and its known vehicles (the Foundation
 *     for a Smoke-Free World, Knowledge Action Change's harm-reduction grants), so a
 *     new row from the same source is caught on import, not after a complaint.
 */

import type { TdScholarship } from '@/lib/tdScholarships/types';

export type MatchExclusion = 'admin_flag' | 'tobacco_industry';

type Row = Pick<TdScholarship, 'scholarship_name_en' | 'scholarship_name_th' | 'scholarship_name' | 'funder_en' | 'funder_th' | 'funder'>
  & { verification_status?: string | null };

const ADMIN_EXCLUDED = /^\s*(excluded|ineligible)\b/i;

/** The industry and its known vehicles: always excluded. */
const TOBACCO_INDUSTRY = [
  /smoke[\s-]?free world/i,
  /knowledge[\s-]action[\s-]change/i,
  /tobacco harm reduction/i,
  /philip morris|british american tobacco|japan tobacco|imperial (brands|tobacco)/i,
  /การยาสูบแห่งประเทศไทย|โรงงานยาสูบ|tobacco authority of thailand/i,
];

/**
 * Any other mention of tobacco or nicotine is industry-linked UNLESS the row is
 * about controlling it: tobacco-CONTROL research (ThaiHealth, ศจย.) is the opposite
 * of industry money and must stay matchable.
 */
const TOBACCO_WORD = /\btobacco\b|\bnicotine\b|\be-?cigarette|ยาสูบ|บุหรี่|นิโคติน/i;
const TOBACCO_CONTROL = /tobacco[\s-]control|smoking cessation|anti[\s-]?smoking|ควบคุม(การ)?(ยาสูบ|บริโภคยาสูบ)|เลิกบุหรี่|ไม่สูบบุหรี่|ลด(การ)?สูบบุหรี่/i;

function text(s: Row): string {
  return [s.scholarship_name_en, s.scholarship_name_th, s.scholarship_name, s.funder_en, s.funder_th, s.funder]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' • ');
}

export function matchExclusion(s: Row): MatchExclusion | null {
  if (typeof s.verification_status === 'string' && ADMIN_EXCLUDED.test(s.verification_status)) return 'admin_flag';
  const t = text(s);
  if (TOBACCO_INDUSTRY.some((re) => re.test(t))) return 'tobacco_industry';
  if (TOBACCO_WORD.test(t) && !TOBACCO_CONTROL.test(t)) return 'tobacco_industry';
  return null;
}
