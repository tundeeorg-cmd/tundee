/**
 * Which Meta datasets CAPI mirrors conversions to.
 *
 * The failure modes here are quiet and expensive: a token paired with the
 * wrong pixel makes Meta reject every event, and a dataset silently dropped
 * means an agency optimising a campaign on numbers that are too low.
 */

import { describe, it, expect } from 'vitest';
import { capiDestinations } from '@/lib/analytics/capiDestinations';

const PRIMARY = '28939107965678201';
const AGENCY  = '518364469095414';
const TOK_P   = 'primary-token';
const TOK_A   = 'agency-token';

const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;

describe('capiDestinations', () => {
  it('returns both datasets, each with its OWN token', () => {
    const d = capiDestinations(env({
      NEXT_PUBLIC_FB_PIXEL_ID: PRIMARY,        META_CAPI_ACCESS_TOKEN: TOK_P,
      NEXT_PUBLIC_FB_PIXEL_ID_AGENCY: AGENCY,  META_CAPI_ACCESS_TOKEN_AGENCY: TOK_A,
    }));
    expect(d.map(x => [x.name, x.pixelId, x.accessToken])).toEqual([
      ['primary', PRIMARY, TOK_P],
      ['agency',  AGENCY,  TOK_A],
    ]);
  });

  it('is dormant when nothing is configured', () => {
    expect(capiDestinations(env({}))).toEqual([]);
  });

  it('sends to the primary alone when the agency token is missing', () => {
    const d = capiDestinations(env({
      NEXT_PUBLIC_FB_PIXEL_ID: PRIMARY, META_CAPI_ACCESS_TOKEN: TOK_P,
      NEXT_PUBLIC_FB_PIXEL_ID_AGENCY: AGENCY,   // browser pixel on, CAPI off
    }));
    expect(d.map(x => x.name)).toEqual(['primary']);
  });

  it('sends to the agency alone if that is the only complete pair', () => {
    const d = capiDestinations(env({
      NEXT_PUBLIC_FB_PIXEL_ID: PRIMARY,        // no primary token
      NEXT_PUBLIC_FB_PIXEL_ID_AGENCY: AGENCY, META_CAPI_ACCESS_TOKEN_AGENCY: TOK_A,
    }));
    expect(d.map(x => x.name)).toEqual(['agency']);
  });

  it('never borrows the other dataset’s token to fill a gap', () => {
    // A token alone, with no pixel id of its own, must not attach to the
    // primary pixel — that would post our conversions using the agency token.
    const d = capiDestinations(env({
      NEXT_PUBLIC_FB_PIXEL_ID: PRIMARY,
      META_CAPI_ACCESS_TOKEN_AGENCY: TOK_A,
    }));
    expect(d).toEqual([]);
  });

  it('drops a repeated pixel id so one dataset is not posted to twice', () => {
    const d = capiDestinations(env({
      NEXT_PUBLIC_FB_PIXEL_ID: PRIMARY,        META_CAPI_ACCESS_TOKEN: TOK_P,
      NEXT_PUBLIC_FB_PIXEL_ID_AGENCY: PRIMARY, META_CAPI_ACCESS_TOKEN_AGENCY: TOK_A,
    }));
    expect(d.map(x => x.pixelId)).toEqual([PRIMARY]);
    expect(d[0].accessToken).toBe(TOK_P);   // primary wins
  });

  it('treats blank and whitespace-only env values as unset', () => {
    expect(capiDestinations(env({
      NEXT_PUBLIC_FB_PIXEL_ID: PRIMARY, META_CAPI_ACCESS_TOKEN: '   ',
    }))).toEqual([]);
  });

  it('trims stray whitespace around a pasted token', () => {
    const d = capiDestinations(env({
      NEXT_PUBLIC_FB_PIXEL_ID: ` ${PRIMARY} `, META_CAPI_ACCESS_TOKEN: ` ${TOK_P}\n`,
    }));
    expect(d[0].pixelId).toBe(PRIMARY);
    expect(d[0].accessToken).toBe(TOK_P);
  });

  it('honours the legacy NEXT_PUBLIC_META_PIXEL_ID for the primary', () => {
    const d = capiDestinations(env({
      NEXT_PUBLIC_META_PIXEL_ID: PRIMARY, META_CAPI_ACCESS_TOKEN: TOK_P,
    }));
    expect(d.map(x => x.pixelId)).toEqual([PRIMARY]);
  });

  describe('test event codes', () => {
    it('shares one code across both datasets by default', () => {
      const d = capiDestinations(env({
        NEXT_PUBLIC_FB_PIXEL_ID: PRIMARY,        META_CAPI_ACCESS_TOKEN: TOK_P,
        NEXT_PUBLIC_FB_PIXEL_ID_AGENCY: AGENCY,  META_CAPI_ACCESS_TOKEN_AGENCY: TOK_A,
        META_TEST_EVENT_CODE: 'TEST123',
      }));
      expect(d.map(x => x.testEventCode)).toEqual(['TEST123', 'TEST123']);
    });

    it('lets the agency override with its own code', () => {
      const d = capiDestinations(env({
        NEXT_PUBLIC_FB_PIXEL_ID: PRIMARY,        META_CAPI_ACCESS_TOKEN: TOK_P,
        NEXT_PUBLIC_FB_PIXEL_ID_AGENCY: AGENCY,  META_CAPI_ACCESS_TOKEN_AGENCY: TOK_A,
        META_TEST_EVENT_CODE: 'TEST123',
        META_TEST_EVENT_CODE_AGENCY: 'TESTAGENCY',
      }));
      expect(d.map(x => x.testEventCode)).toEqual(['TEST123', 'TESTAGENCY']);
    });

    it('omits the code entirely in production', () => {
      const d = capiDestinations(env({
        NEXT_PUBLIC_FB_PIXEL_ID: PRIMARY, META_CAPI_ACCESS_TOKEN: TOK_P,
      }));
      expect(d[0].testEventCode).toBeUndefined();
    });
  });
});
