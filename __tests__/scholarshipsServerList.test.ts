/**
 * /scholarships renders its list on the server (cached), so the first paint has
 * cards. Measured before the change on production: HTML in 0.14 s with only
 * skeletons, 268 KB of gzipped JS in front of a 0.3–0.9 s query.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TD_BROWSE_COLUMNS, BROWSE_FETCH_TIMEOUT_MS } from '@/lib/tdScholarships/browseList';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const PAGE = read('app/scholarships/page.tsx');
const CLIENT = read('app/scholarships/ScholarshipsClient.tsx');
const LIB = read('lib/tdScholarships/browseList.ts');

describe('the column list did not change when it moved', () => {
  it('is exactly the list the page fetched before (matchFixtures proves this set)', () => {
    expect([...TD_BROWSE_COLUMNS]).toEqual([
      'scholarship_id',
      'scholarship_name_en', 'scholarship_name_th', 'scholarship_name',
      'funder_en', 'funder_th', 'funder',
      'funder_type', 'level', 'field_of_study',
      'award_value_tier',
      'renewable', 'bond_obligation',
      'region_eligibility', 'targets_low_income', 'welfare_card_priority',
      'income_cap_thb', 'num_recipients', 'min_gpa',
      'deadline_raw', 'deadline_date', 'deadline_is_rolling',
      'status', 'status_effective', 'application_url', 'application_link',
      'source_url', 'last_verified',
      'is_displayed',
    ]);
  });

  it('server and browser fallback use the same list, filter and order', () => {
    for (const src of [LIB, CLIENT]) {
      expect(src).toContain(".select(TD_BROWSE_COLUMNS.join(', '))");
      expect(src).toContain(".eq('is_displayed', true)");
      expect(src).toContain(".order('scholarship_name_en')");
    }
  });
});

describe('the server page', () => {
  it('is a server component that passes the list in, cached for an hour', () => {
    expect(PAGE).not.toContain("'use client'");
    expect(PAGE).toContain('export const revalidate = 3600;');
    expect(PAGE).toContain('<ScholarshipsClient initialScholarships={scholarships} />');
    expect(LIB).toContain('unstable_cache(fetchBrowseList');
  });

  it('never reads cookies or the session, so it stays cacheable and never waits on auth', () => {
    for (const src of [PAGE, LIB]) {
      expect(src).not.toMatch(/cookies\(|headers\(|getSession|createServerSupabaseClient/);
    }
  });

  it('does not cache a failed fetch as an empty list', () => {
    expect(LIB).toContain('if (error) throw new Error');
  });
});

describe('the browser half', () => {
  it('imports the column list without server code (keeps next/cache out of the bundle)', () => {
    expect(CLIENT).toContain("from '@/lib/tdScholarships/browseColumns'");
    expect(CLIENT).not.toContain("from '@/lib/tdScholarships/browseList'");
    expect(read('lib/tdScholarships/browseColumns.ts')).not.toMatch(/^import /m);
  });

  it('starts with the server list and fetches only if it is empty', () => {
    expect(CLIENT).toContain('useState<TdScholarship[]>(initialScholarships)');
    expect(CLIENT).toContain('useState(initialScholarships.length === 0)');
    expect(CLIENT).toContain('if (initialScholarships.length === 0) void loadScholarships();');
    expect(existsSync(join(ROOT, 'app/scholarships/ScholarshipsClient.tsx'))).toBe(true);
  });

  it('cannot show an endless skeleton: a timeout, then an error with a retry', () => {
    expect(BROWSE_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(8_000);
    expect(CLIENT).toContain('.abortSignal(timeout.signal)');
    expect(CLIENT).toContain(') : tdLoadError ? (');
    expect(CLIENT).toContain('onClick={() => void loadScholarships()}');
  });
});

describe('the cache is refreshed when the data changes', () => {
  for (const f of [
    'app/api/cron/route.ts',
    'app/api/admin/td-scholarships/[id]/route.ts',
    'app/api/admin/td-scholarships/bulk/route.ts',
    'app/api/admin/td-import/route.ts',
  ]) {
    it(f, () => expect(read(f)).toContain('revalidateBrowseList()'));
  }
});
