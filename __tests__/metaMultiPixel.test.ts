/**
 * Two Meta pixels firing together.
 *
 * fbq delivers every tracked event to all initialised pixels, so the only
 * things that can go wrong here are the id list itself: a missing pixel, a
 * duplicate that double-counts, or the wrong load decision.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMetaPixelId, getAgencyPixelId, getMetaPixelIds } from '@/lib/analytics/meta';

const PRIMARY = '28939107965678201';
const AGENCY  = '518364469095414';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID', '');
  vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '');
  vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID_AGENCY', '');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('getMetaPixelIds', () => {
  it('returns both, primary first, when both are configured', () => {
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID', PRIMARY);
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID_AGENCY', AGENCY);
    expect(getMetaPixelIds()).toEqual([PRIMARY, AGENCY]);
  });

  it('keeps working with only the primary — the agency pixel is optional', () => {
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID', PRIMARY);
    expect(getMetaPixelIds()).toEqual([PRIMARY]);
    expect(getAgencyPixelId()).toBeUndefined();
  });

  it('loads the agency pixel alone if that is all that is set', () => {
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID_AGENCY', AGENCY);
    expect(getMetaPixelIds()).toEqual([AGENCY]);
  });

  it('returns nothing when neither is set, so no pixel loads', () => {
    expect(getMetaPixelIds()).toEqual([]);
  });

  it('de-duplicates — the same id twice would double-count every event', () => {
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID', PRIMARY);
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID_AGENCY', PRIMARY);
    expect(getMetaPixelIds()).toEqual([PRIMARY]);
  });

  it('ignores blank and whitespace-only values', () => {
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID', PRIMARY);
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID_AGENCY', '   ');
    expect(getMetaPixelIds()).toEqual([PRIMARY]);
  });

  it('trims, so a stray space in the Vercel value still de-duplicates', () => {
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID', PRIMARY);
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID_AGENCY', ` ${PRIMARY} `);
    expect(getMetaPixelIds()).toEqual([PRIMARY]);
  });

  it('still honours the legacy NEXT_PUBLIC_META_PIXEL_ID as the primary', () => {
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', PRIMARY);
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID_AGENCY', AGENCY);
    expect(getMetaPixelId()).toBe(PRIMARY);
    expect(getMetaPixelIds()).toEqual([PRIMARY, AGENCY]);
  });
});
