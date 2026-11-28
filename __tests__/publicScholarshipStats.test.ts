/**
 * Homepage, Browse, Admin "Displayed" and the SQL count must use one display rule,
 * and every change to the catalogue must invalidate every cached copy of the count.
 * 2026-11-28: after the v18 import the homepage said 233 while Admin and the DB said 404.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PUBLIC_STATUSES, isPubliclyDisplayed, scholarshipCountLabel } from '@/lib/scholarships/publicRule';
import { isDisplayable, bangkokMidnight } from '@/lib/tdScholarships/displayGate';

const read = (p: string) => readFileSync(p, 'utf8');

describe('one public display rule', () => {
  it('matches the display gate for every status', () => {
    const today = bangkokMidnight(new Date('2026-11-28T00:00:00Z'));
    for (const status of ['Opening Soon', 'Open', 'Closing Soon', 'Closed', '']) {
      const gate = isDisplayable({ open_date: null, deadline_date: null, status, last_verified: null }, today);
      expect(isPubliclyDisplayed(gate.status_effective), status).toBe(gate.is_displayed);
    }
  });

  it('the SQL function filters on exactly PUBLIC_STATUSES', () => {
    const sql = read('scripts/20261128_public_scholarship_stats.sql');
    const m = sql.match(/where status_effective in \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const listed = m![1].split(',').map(s => s.trim().replace(/'/g, ''));
    expect(listed).toEqual([...PUBLIC_STATUSES]);
    expect(sql).not.toMatch(/verification_status/);
    expect(sql).not.toMatch(/security definer/i);
  });

  it('counts, Browse (server and client) and Admin use the shared rule, not verification', () => {
    expect(read('lib/scholarships/counts.ts')).toContain("db.rpc('get_public_scholarship_stats')");
    expect(read('lib/scholarships/counts.ts')).toContain(".in('status_effective', [...PUBLIC_STATUSES])");
    expect(read('lib/tdScholarships/browseList.ts')).toContain(".in('status_effective', [...PUBLIC_STATUSES])");
    expect(read('app/scholarships/ScholarshipsClient.tsx')).toContain(".in('status_effective', [...PUBLIC_STATUSES])");
    expect(read('app/admin/page.tsx')).toContain('isPubliclyDisplayed(r.status_effective)');
  });
});

describe('freshness', () => {
  it('revalidateBrowseList clears the list, the counts and every page under the layout', () => {
    const src = read('lib/tdScholarships/browseList.ts');
    expect(src).toContain('revalidateTag(BROWSE_LIST_TAG)');
    expect(src).toContain('revalidateTag(SCHOLARSHIP_STATS_TAG)');
    expect(src).toContain('revalidateTag(FEATURED_CACHE_TAG)');
    expect(src).toContain('revalidateTag(START_BROWSE_TAG)');
    expect(src).toContain("revalidatePath('/', 'layout')");
  });

  it('every cached public scholarship query is a tag revalidateBrowseList clears', () => {
    expect(read('lib/scholarships/featured.ts')).toContain('tags: [CACHE_TAG]');
    expect(read('lib/scholarships/featured.ts')).toContain('const CACHE_TAG = FEATURED_CACHE_TAG;');
    expect(read('lib/scholarships/startBrowse.ts')).toContain('tags: [START_BROWSE_TAG]');
  });

  it.each([
    'app/api/admin/td-import/route.ts',
    'app/api/cron/route.ts',
    'app/api/admin/td-scholarships/[id]/route.ts',
    'app/api/admin/td-scholarships/bulk/route.ts',
  ])('%s invalidates after writing', (p) => {
    expect(read(p)).toMatch(/revalidateBrowseList\(\)/);
  });

  it('caches for at most 30 min (data) + 30 min (page)', () => {
    expect(read('lib/scholarships/counts.ts')).toContain('const REVALIDATE_SECONDS = 30 * 60;');
    for (const p of ['app/page.tsx', 'app/about/page.tsx', 'app/scholarships/page.tsx']) {
      expect(read(p), p).toContain('export const revalidate = 1800;');
    }
  });
});

describe('count copy', () => {
  it('shows the exact live number', () => {
    expect(scholarshipCountLabel(404, 'en')).toBe('404');
    expect(scholarshipCountLabel(1404, 'en')).toBe('1,404');
  });

  it('falls back to the floor, never 0', () => {
    expect(scholarshipCountLabel(null, 'th')).toBe('กว่า 200');
    expect(scholarshipCountLabel(0, 'th')).toBe('กว่า 200');
    expect(scholarshipCountLabel(null, 'en')).toBe('200+');
  });

  it('no hardcoded count in components or translations', () => {
    for (const p of ['components/HeroSection.tsx', 'components/StatsBar.tsx', 'lib/translations.ts', 'app/about/AboutContent.tsx']) {
      expect(read(p), p).not.toMatch(/\b(233|166|404)\s*(ทุน|scholarships|ผู้ให้ทุน|funders)/);
    }
  });
});
