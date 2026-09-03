/**
 * Grouping a student's matches by what the scholarship actually asks of them.
 *
 * The number that forced this: a ม.4–6 student matches 302 scholarships and 228
 * of them — 75% — require moving to another country. As one deadline-ordered
 * list, the 21 Thai undergraduate scholarships sat scattered among 228 foreign
 * ones with nothing on the page telling them apart.
 *
 * These are not interchangeable. The tests below are mostly about that: which
 * group a scholarship lands in, that it lands in exactly one, and that the
 * ordering the student chose survives the split.
 */

import { describe, it, expect } from 'vitest';
import { groupMatches, isAbroad, destinationCountry, thaiProvinceName } from '@/lib/recommender/matchGroups';
import type { TdScholarship } from '@/lib/tdScholarships/types';

type Row = Pick<TdScholarship, 'level' | 'region_eligibility'> & { id: string };

const row = (id: string, level: Row['level'], region: string | null): Row =>
  ({ id, level, region_eligibility: region });

/** Enough rows to clear the "too few to bother grouping" threshold. */
const padding = (n: number, level: Row['level'], region: string | null): Row[] =>
  Array.from({ length: n }, (_, i) => row(`pad-${level}-${region}-${i}`, level, region));

// ─── Where a scholarship is ──────────────────────────────────────────────────

describe('isAbroad', () => {
  it('treats a named foreign country as abroad', () => {
    for (const r of ['Australia', 'United Kingdom', 'Japan', 'Germany']) {
      expect(isAbroad({ region_eligibility: r }), r).toBe(true);
    }
  });

  it('treats Thailand as domestic in every spelling the table uses', () => {
    for (const r of ['National (Thailand)', 'Thailand', 'National', 'ทั่วประเทศไทย']) {
      expect(isAbroad({ region_eligibility: r }), r).toBe(false);
    }
  });

  it('treats Worldwide as domestic, not foreign', () => {
    // 'Worldwide' means the funder does not restrict by nationality — not that
    // the student must leave. Filing it under "study abroad" would push
    // open-to-anyone scholarships out of the groups read first.
    expect(isAbroad({ region_eligibility: 'Worldwide' })).toBe(false);
  });

  it('treats an unknown location as domestic', () => {
    // An absent value is not evidence of a plane ticket.
    expect(isAbroad({ region_eligibility: null })).toBe(false);
    expect(isAbroad({ region_eligibility: '   ' })).toBe(false);
  });

  it('treats a Thai province name as domestic, not a foreign destination', () => {
    // region_eligibility is overloaded: it holds destination countries AND Thai
    // province names AND domestic-targeting phrases. A provincial-government
    // scholarship (Khon Kaen PAO, Sisaket, Udon Thani...) named its own province
    // here and was reading as "abroad" for it — the bug report this fix answers.
    // Same 77-province list /profile/student already treats as canonical.
    for (const r of ['Khon Kaen', 'Nakhon Ratchasima', 'Sisaket', 'Udon Thani', 'Roi Et', 'Sakon Nakhon']) {
      expect(isAbroad({ region_eligibility: r }), r).toBe(false);
    }
  });

  it('treats Thai domestic-targeting phrases as domestic', () => {
    for (const r of [
      'Central (Bangkok)',
      'Home / designated province',
      'Northeast (Isan)',
      'Outside Bangkok metro; state universities only',
      'Rural / designated provinces',
      'Rural / provincial priority',
      'Southern border provinces',
      '35 provinces (children in foundation care)', // plural — a bare \bprovince\b missed this
    ]) {
      expect(isAbroad({ region_eligibility: r }), r).toBe(false);
    }
  });

  it('matches "nationwide" as a whole word, not just "national"', () => {
    // 'nationwide' does not contain the substring 'national' (no 'al' before
    // 'wide') — an earlier version of this fix used /national(wide)?/ and still
    // missed it. The shared stem has to be 'nation', not 'national'.
    for (const r of ['nationwide', 'Nationwide']) {
      expect(isAbroad({ region_eligibility: r }), r).toBe(false);
    }
  });

  it('does not let "national" match inside unrelated words like "International"', () => {
    // 'nation' is a substring of 'International' (i-n-t-e-r-NATION-al). Without
    // \b word boundaries, genuinely foreign scholarships whose name or region
    // contains "International" would misclassify as domestic.
    for (const r of ['International', 'Erasmus Mundus International Programme']) {
      expect(isAbroad({ region_eligibility: r }), r).toBe(true);
    }
  });

  it('still misclassifies a named Thai institution/campus as abroad (known limitation)', () => {
    // region_eligibility here names a specific Thai university, not a province
    // or a targeting phrase, so none of the domestic signals fire. A generic
    // "contains University" rule was rejected on purpose: it would also catch
    // genuinely foreign schools like "University of Melbourne". Left unresolved
    // pending either better region_eligibility data or a maintained Thai
    // university-name gazetteer — documented here so a future fix doesn't
    // reintroduce it silently, and so it isn't mistaken for already being fixed.
    for (const r of ['Ramkhamhaeng Univ - Faculty of Humanities only', 'Kasetsart Univ - Bangkhen campus']) {
      expect(isAbroad({ region_eligibility: r }), r).toBe(true);
    }
  });
});

describe('thaiProvinceName', () => {
  it('names the Thai province for a domestic scholarship that named its own', () => {
    // What the card badge needs: 'Khon Kaen' -> 'ขอนแก่น', not the raw
    // English spelling shown on a Thai-language page.
    expect(thaiProvinceName({ region_eligibility: 'Khon Kaen' })).toBe('ขอนแก่น');
    expect(thaiProvinceName({ region_eligibility: 'Sisaket' })).toBe('ศรีสะเกษ');
  });

  it('returns null for a broader region, not a specific province', () => {
    for (const r of ['Northeast (Isan)', 'Central (Bangkok)', 'Worldwide', 'National (Thailand)']) {
      expect(thaiProvinceName({ region_eligibility: r }), r).toBeNull();
    }
  });

  it('returns null for anything abroad, unknown, or empty', () => {
    expect(thaiProvinceName({ region_eligibility: 'Australia' })).toBeNull();
    expect(thaiProvinceName({ region_eligibility: null })).toBeNull();
    expect(thaiProvinceName({ region_eligibility: '   ' })).toBeNull();
  });
});

describe('destinationCountry', () => {
  it('names the country for a scholarship that requires moving', () => {
    expect(destinationCountry({ region_eligibility: 'Australia' })).toBe('Australia');
  });

  it('returns nothing for anything domestic', () => {
    expect(destinationCountry({ region_eligibility: 'National (Thailand)' })).toBeNull();
    expect(destinationCountry({ region_eligibility: 'Worldwide' })).toBeNull();
    expect(destinationCountry({ region_eligibility: null })).toBeNull();
  });
});

// ─── The split ───────────────────────────────────────────────────────────────

describe('groupMatches', () => {
  it('puts every scholarship in exactly one group', () => {
    const items = [
      ...padding(5, 'Undergraduate', 'National (Thailand)'),
      ...padding(5, 'High school', 'National (Thailand)'),
      ...padding(5, 'Undergraduate', 'Australia'),
      ...padding(5, null, 'Worldwide'),
    ];
    const groups = groupMatches(items, 'M4-M6');
    const seen = groups.flatMap(g => g.items.map(i => i.id));
    // Duplicated cards would also make every count on the page a lie.
    expect(seen.length).toBe(items.length);
    expect(new Set(seen).size).toBe(items.length);
  });

  it('leads a ปวช./ปวส. student with domestic undergraduate scholarships', () => {
    // Nearly every Thai undergraduate scholarship recruits from ปวส., so these
    // are the highest-value thing on the page for that student, unconditionally
    // — there is no year granularity for vocational to gate it on.
    const items = [
      ...padding(4, 'Undergraduate', 'National (Thailand)'),
      ...padding(4, 'High school', 'National (Thailand)'),
      ...padding(4, 'Undergraduate', 'Australia'),
    ];
    expect(groupMatches(items, 'vocational')[0].key).toBe('domestic_undergraduate');
  });

  it('leads a ม.6 student with domestic undergraduate scholarships', () => {
    // The one year these scholarships actually recruit from.
    const items = [
      ...padding(4, 'Undergraduate', 'National (Thailand)'),
      ...padding(4, 'High school', 'National (Thailand)'),
      ...padding(4, 'Undergraduate', 'Australia'),
    ];
    expect(groupMatches(items, 'M4-M6', { gradeYear: 6 })[0].key).toBe('domestic_undergraduate');
  });

  /*
   * This used to assert 'domestic_undergraduate' leads for ANY ม.4–6 student,
   * with no year distinction available. Once grade_year existed, leading with
   * "ทุนเรียนต่อปริญญาตรี" for a ม.4 student implies a deadline they cannot act
   * on for two more years. The ม.ปลาย group leads instead; the undergraduate
   * one still appears, tagged as something to prepare for — see the
   * "tags the undergraduate group" test below.
   */
  it('leads a ม.4/ม.5 student — or an unanswered year — with the ม.ปลาย group instead', () => {
    const items = [
      ...padding(4, 'Undergraduate', 'National (Thailand)'),
      ...padding(4, 'High school', 'National (Thailand)'),
      ...padding(4, 'Undergraduate', 'Australia'),
    ];
    expect(groupMatches(items, 'M4-M6', { gradeYear: 4 })[0].key).toBe('domestic_school');
    expect(groupMatches(items, 'M4-M6', { gradeYear: 5 })[0].key).toBe('domestic_school');
    expect(groupMatches(items, 'M4-M6')[0].key).toBe('domestic_school'); // year not asked
  });

  it('tags the undergraduate group as "prepare ahead" for ม.4/ม.5, not for ม.6', () => {
    const items = [
      ...padding(4, 'Undergraduate', 'National (Thailand)'),
      ...padding(4, 'High school', 'National (Thailand)'),
      ...padding(4, 'Undergraduate', 'Australia'),
    ];
    const find = (r: ReturnType<typeof groupMatches>) => r.find(g => g.key === 'domestic_undergraduate');

    expect(find(groupMatches(items, 'M4-M6', { gradeYear: 4 }))?.note?.th).toContain('ม.6');
    expect(find(groupMatches(items, 'M4-M6', { gradeYear: 5 }))?.note?.th).toContain('ม.6');
    // ม.6 can act now — no "come back later" tag on their own deadline.
    expect(find(groupMatches(items, 'M4-M6', { gradeYear: 6 }))?.note).toBeUndefined();
    // ปวช./ปวส. is not the ม.4–6 case this tag exists for.
    expect(find(groupMatches(items, 'vocational'))?.note).toBeUndefined();
  });

  it('puts domestic groups above the foreign one even when far smaller', () => {
    // 21 Thai against 228 foreign in production. Ordering by size would bury
    // the more attainable set under the one that needs a visa.
    const items = [
      ...padding(3, 'Undergraduate', 'National (Thailand)'),
      ...padding(60, 'Undergraduate', 'Australia'),
    ];
    const keys = groupMatches(items, 'M4-M6').map(g => g.key);
    expect(keys.indexOf('domestic_undergraduate')).toBeLessThan(keys.indexOf('abroad'));
  });

  it('does not lead with an undergraduate heading for a graduate student', () => {
    const items = [
      ...padding(4, 'High school', 'National (Thailand)'),
      ...padding(4, 'Undergraduate', 'National (Thailand)'),
    ];
    expect(groupMatches(items, 'graduate')[0].key).not.toBe('domestic_undergraduate');
  });

  it('preserves the order the caller sorted into, inside every group', () => {
    // The sort control still means something after the split.
    const items = [
      row('a', 'Undergraduate', 'National (Thailand)'),
      row('b', 'Undergraduate', 'National (Thailand)'),
      row('c', 'Undergraduate', 'National (Thailand)'),
      ...padding(6, 'Undergraduate', 'Australia'),
    ];
    const g = groupMatches(items, 'M4-M6').find(x => x.key === 'domestic_undergraduate');
    expect(g?.items.map(i => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('never returns an empty heading', () => {
    // A heading with nothing under it reads as a section that failed to load.
    const items = padding(10, 'Undergraduate', 'Australia');
    const groups = groupMatches(items, 'M4-M6');
    expect(groups.every(g => g.items.length > 0)).toBe(true);
    expect(groups.map(g => g.key)).toEqual(['abroad']);
  });

  it('folds a group too small to deserve a heading', () => {
    // Only two domestic 'High school' scholarships exist in the whole
    // catalogue; a heading over two cards is noise. They still appear.
    const items = [
      ...padding(2, 'High school', 'National (Thailand)'),
      ...padding(8, null, 'National (Thailand)'),
    ];
    const groups = groupMatches(items, 'M4-M6');
    expect(groups.some(g => g.key === 'domestic_school')).toBe(false);
    expect(groups.flatMap(g => g.items).length).toBe(10);
  });

  it('does not group at all when there is little to group', () => {
    // A student with six results can read all six.
    const items = padding(6, 'Undergraduate', 'Australia');
    const groups = groupMatches(items, 'M4-M6');
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('all');
    expect(groups[0].title.th).toBe('');
  });

  it('still groups a student whose level is unknown', () => {
    // The 16 profiles with a NULL grade_level are real students, and the
    // domestic/abroad split is the part that does not depend on knowing it.
    const items = [
      ...padding(5, 'Undergraduate', 'National (Thailand)'),
      ...padding(5, 'Undergraduate', 'Australia'),
    ];
    const keys = groupMatches(items, null).map(g => g.key);
    expect(keys).toContain('abroad');
    expect(keys).toContain('domestic_undergraduate');
  });

  it('gives every group a heading and a reason in both languages', () => {
    const items = [
      ...padding(5, 'Undergraduate', 'National (Thailand)'),
      ...padding(5, 'Undergraduate', 'Australia'),
    ];
    for (const g of groupMatches(items, 'M4-M6')) {
      for (const lang of ['th', 'en'] as const) {
        expect(g.title[lang], `${g.key}.title.${lang}`).toBeTruthy();
        expect(g.blurb[lang], `${g.key}.blurb.${lang}`).toBeTruthy();
      }
    }
  });
});
