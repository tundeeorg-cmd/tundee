/**
 * Which Meta datasets the Conversions API mirrors each conversion to.
 *
 * A dataset needs BOTH halves to be reachable: the pixel id (public, also used
 * by the browser pixel) and its own CAPI access token (secret, server-only).
 * A token belongs to exactly one dataset — the agency's token cannot post to
 * our pixel and vice versa — so they are paired here rather than pooled.
 *
 * Each destination is independently optional. Configure neither and CAPI stays
 * dormant; configure one and only that dataset gets server events; configure
 * both and each receives its own copy of every conversion.
 *
 * Extracted from the route so the pairing rules are unit-testable without
 * standing up a request or holding a real token.
 */

export interface CapiDestination {
  /** Label for logs. Never contains the token. */
  name: 'primary' | 'agency';
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/**
 * Read the configured destinations from the environment.
 *
 * A pixel id with no token (or a token with no pixel id) is skipped rather
 * than guessed at: pairing a token with the wrong dataset makes Meta reject
 * every event, and silently borrowing the other dataset's token would send
 * our conversions to the agency's pixel.
 */
export function capiDestinations(env: NodeJS.ProcessEnv = process.env): CapiDestination[] {
  const candidates: Array<Omit<CapiDestination, 'pixelId' | 'accessToken'> & {
    pixelId?: string;
    accessToken?: string;
  }> = [
    {
      name:          'primary',
      pixelId:       clean(env.NEXT_PUBLIC_FB_PIXEL_ID) || clean(env.NEXT_PUBLIC_META_PIXEL_ID),
      accessToken:   clean(env.META_CAPI_ACCESS_TOKEN),
      testEventCode: clean(env.META_TEST_EVENT_CODE),
    },
    {
      name:          'agency',
      pixelId:       clean(env.NEXT_PUBLIC_FB_PIXEL_ID_AGENCY),
      accessToken:   clean(env.META_CAPI_ACCESS_TOKEN_AGENCY),
      // Falls back to the shared code so QA can put both datasets in Test
      // Events with one variable; set the agency one only if they differ.
      testEventCode: clean(env.META_TEST_EVENT_CODE_AGENCY) || clean(env.META_TEST_EVENT_CODE),
    },
  ];

  const complete = candidates.filter(
    (c): c is CapiDestination => Boolean(c.pixelId && c.accessToken),
  );

  // Same pixel configured twice would post the conversion to one dataset
  // twice. Meta de-duplicates on event_id, but only the first arrival is
  // guaranteed to pair with the browser event — so drop the repeat outright.
  const seen = new Set<string>();
  return complete.filter(d => {
    if (seen.has(d.pixelId)) return false;
    seen.add(d.pixelId);
    return true;
  });
}
