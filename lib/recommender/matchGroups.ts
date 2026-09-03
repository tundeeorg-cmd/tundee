/**
 * Splitting a student's matches into groups they can act on.
 *
 * WHY THE CATALOGUE NEEDS THIS
 * ────────────────────────────
 * A ม.4–6 student currently matches 302 scholarships, and 228 of them — 75% —
 * are for studying in another country. Shown as one list ordered by deadline,
 * the 21 Thai undergraduate scholarships are scattered somewhere among 228
 * foreign ones, and the student has no way to tell which is which without
 * opening each card.
 *
 * Those are not interchangeable options. Applying to a Thai university
 * scholarship and moving to Australia are different decisions with different
 * costs, and a student who does not want to leave the country should not have
 * to read past 228 that require it.
 *
 * THE ORDER, AND WHY
 * ──────────────────
 * Location first, then level. Domestic groups come before the foreign one
 * because they are the more attainable option for most Thai students — no
 * visa, no English test, no relocation — and because there are far fewer of
 * them: 74 against 228. Ordering by size alone would bury the smaller and more
 * actionable set under the larger one.
 *
 * Within a location, undergraduate scholarships lead for a school student.
 * Nearly every Thai undergraduate scholarship recruits from ม.6, so for the
 * student a year from university they are the highest-value thing on the page —
 * which is exactly what a flat list was hiding.
 *
 * Every scholarship lands in exactly one group. Overlapping groups would show
 * the same card twice and make the counts meaningless.
 */

import type { TdScholarship } from '@/lib/tdScholarships/types';
import { normalizeGradeLevel, normalizeScholarshipLevel } from './gradeLevel';

export type MatchGroupKey =
  | 'domestic_undergraduate'
  | 'domestic_school'
  | 'domestic_other'
  | 'abroad'
  | 'graduate'
  | 'all';

export interface MatchGroup<T> {
  key: MatchGroupKey;
  /** Heading, Thai and English. */
  title: { th: string; en: string };
  /** One line saying why these are here. Empty when the heading says it all. */
  blurb: { th: string; en: string };
  items: T[];
}

/**
 * Whether a scholarship means leaving Thailand.
 *
 * `region_eligibility` is the only location signal the table carries — there is
 * no study_location column — and it holds a country name: 'Australia',
 * 'National (Thailand)', 'Worldwide', and so on.
 *
 * 'Worldwide' counts as domestic here, deliberately. It means the funder does
 * not restrict by nationality, not that the student must go abroad, and
 * treating it as foreign would push open-to-anyone scholarships out of the
 * groups a student looks at first. A missing value is treated the same way: an
 * unknown location is not evidence of a plane ticket.
 */
const THAI_REGION = /thailand|ไทย|national/i;
const WORLDWIDE = /worldwide|global|any country|ทั่วโลก/i;

export function isAbroad(s: Pick<TdScholarship, 'region_eligibility'>): boolean {
  const region = s.region_eligibility?.trim();
  if (!region) return false;
  if (THAI_REGION.test(region)) return false;
  if (WORLDWIDE.test(region)) return false;
  return true;
}

/**
 * The destination country, for the badge on a card.
 * Returns null for anything domestic, unknown, or unrestricted.
 */
export function destinationCountry(
  s: Pick<TdScholarship, 'region_eligibility'>,
): string | null {
  if (!isAbroad(s)) return null;
  return s.region_eligibility?.trim() || null;
}

/** True when this student is at school or in vocational college. */
function isSchoolStudent(gradeLevel: string | null | undefined): boolean {
  const bucket = normalizeGradeLevel(gradeLevel);
  return bucket === 'high_school' || bucket === 'vocational';
}

const TITLES: Record<Exclude<MatchGroupKey, 'all'>, MatchGroup<never>['title']> = {
  domestic_undergraduate: { th: 'ทุนเรียนต่อปริญญาตรีในไทย', en: 'Undergraduate scholarships in Thailand' },
  domestic_school:        { th: 'ทุนสำหรับนักเรียนในไทย',     en: 'Scholarships for students in Thailand' },
  domestic_other:         { th: 'ทุนอื่นในไทยที่คุณสมัครได้',   en: 'Other scholarships in Thailand' },
  abroad:                 { th: 'ทุนไปเรียนต่อต่างประเทศ',     en: 'Scholarships to study abroad' },
  graduate:               { th: 'ทุนระดับบัณฑิตศึกษา',         en: 'Graduate scholarships' },
};

const BLURBS: Record<Exclude<MatchGroupKey, 'all'>, MatchGroup<never>['blurb']> = {
  domestic_undergraduate: {
    th: 'ทุนเหล่านี้เปิดรับผู้ที่กำลังเรียน ม.6 หรือกำลังจะจบ เพื่อเรียนต่อปริญญาตรีในประเทศ',
    en: 'These recruit students finishing ม.6, for a bachelor’s degree in Thailand.',
  },
  domestic_school:  { th: 'ทุนที่ให้ระหว่างเรียนมัธยมหรืออาชีวะ', en: 'Awarded while you are still at school or in vocational college.' },
  domestic_other:   { th: 'ทุนที่ไม่ได้จำกัดระดับการศึกษา',       en: 'Open to applicants at any level of study.' },
  abroad:           { th: 'ต้องเดินทางไปศึกษาที่ประเทศปลายทาง มักต้องใช้ผลสอบภาษาอังกฤษ', en: 'These require studying in another country, and usually an English test.' },
  graduate:         { th: 'สำหรับผู้ที่จบปริญญาตรีแล้ว',          en: 'For applicants who already hold a bachelor’s degree.' },
};

/**
 * Split matches into ordered, non-overlapping groups.
 *
 * `items` must already be filtered and sorted; ordering within each group is
 * preserved exactly, so whatever the caller sorted by (deadline, score) still
 * holds inside every heading.
 *
 * Returns a single 'all' group — no headings — when grouping would not help:
 * too few results to be worth splitting, or a student whose level means the
 * split carries no information.
 */
export function groupMatches<T extends Pick<TdScholarship, 'level' | 'region_eligibility'>>(
  items: T[],
  gradeLevel: string | null | undefined,
  opts: { minToGroup?: number } = {},
): Array<MatchGroup<T>> {
  const minToGroup = opts.minToGroup ?? 8;

  // Below this, headings cost more than they explain: a student with six
  // results can read all six.
  if (items.length < minToGroup) {
    return [{ key: 'all', title: { th: '', en: '' }, blurb: { th: '', en: '' }, items }];
  }

  const school = isSchoolStudent(gradeLevel);

  const buckets: Record<Exclude<MatchGroupKey, 'all'>, T[]> = {
    domestic_undergraduate: [],
    domestic_school:        [],
    domestic_other:         [],
    abroad:                 [],
    graduate:               [],
  };

  for (const s of items) {
    if (isAbroad(s)) { buckets.abroad.push(s); continue; }

    const level = normalizeScholarshipLevel(s.level);
    if (level === 'graduate')          { buckets.graduate.push(s); continue; }
    if (level === 'undergraduate')     { buckets.domestic_undergraduate.push(s); continue; }
    if (level === 'high_school' || level === 'vocational') { buckets.domestic_school.push(s); continue; }
    buckets.domestic_other.push(s);
  }

  /*
   * A heading over two cards is noise, not structure.
   *
   * Only two domestic scholarships in the whole catalogue carry level =
   * 'High school', so that group arrives with 2 items and — for a student whose
   * level we do not know — would have led the page. Anything under this
   * threshold folds into the unrestricted domestic group, where it still
   * appears and still gets read.
   *
   * Applied to the domestic groups only. `abroad` and `graduate` say something
   * a student must know before opening the card, so they keep their heading at
   * any size.
   */
  const MIN_GROUP = 3;
  for (const k of ['domestic_undergraduate', 'domestic_school'] as const) {
    if (buckets[k].length > 0 && buckets[k].length < MIN_GROUP) {
      buckets.domestic_other.push(...buckets[k]);
      buckets[k] = [];
    }
  }

  /*
   * Undergraduate leads for a school student — they are a year or two from
   * applying and these are the largest awards they can reach. For anyone else
   * the school group leads, because an undergraduate already at university is
   * not served by a "for students finishing ม.6" heading standing above
   * everything.
   */
  const order: Array<Exclude<MatchGroupKey, 'all'>> = school
    ? ['domestic_undergraduate', 'domestic_school', 'domestic_other', 'abroad', 'graduate']
    : ['domestic_school', 'domestic_undergraduate', 'domestic_other', 'abroad', 'graduate'];

  // An empty heading is worse than no heading — it reads as a section that
  // failed to load.
  return order
    .filter(k => buckets[k].length > 0)
    .map(k => ({ key: k, title: TITLES[k], blurb: BLURBS[k], items: buckets[k] }));
}
