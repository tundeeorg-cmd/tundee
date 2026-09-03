/**
 * Parking the /start answers server-side, and claiming them after sign-in.
 *
 * The cookie and the `?p=` param already carry these answers within one
 * browser. This carries them BETWEEN browsers, which is the case they cannot
 * cover: a student who taps the sign-in link in their email leaves the Facebook
 * webview and arrives in Chrome with an empty cookie jar.
 *
 * The id is the only thing that has to survive the jump, and an id is short
 * enough to ride an email redirect URL and a LINE `state` without any of the
 * length or encoding fragility of the payload itself.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parsePreviewInput, type PreviewInput } from '@/lib/preview/types';

/** Query param carrying the parked-answers id across a browser boundary. */
export const INTAKE_PARAM = 'i';

/** Where the browser remembers its own id, for the same-browser case. */
export const INTAKE_STORAGE_KEY = 'tundee_intake_id';

/** Unclaimed rows are swept after this long. */
export const INTAKE_TTL_DAYS = 7;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a syntactically valid intake id. Cheap guard before any DB call. */
export function isIntakeId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Reads the id this browser parked earlier, if any. Browser-only. */
export function readStoredIntakeId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(INTAKE_STORAGE_KEY);
    return isIntakeId(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeIntakeId(id: string): void {
  if (typeof window === 'undefined' || !isIntakeId(id)) return;
  try { window.localStorage.setItem(INTAKE_STORAGE_KEY, id); } catch { /* private mode */ }
}

export function clearStoredIntakeId(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(INTAKE_STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Claims a parked row and returns the answers it held.
 *
 * Requires a service-role client: pending_intake grants anon INSERT and nothing
 * else, so reading it back is deliberately impossible from the browser.
 *
 * Never throws. A missing row, a claimed row, a malformed blob and a database
 * error all return null, because every one of them means the same thing to the
 * caller — carry on without the answers — and none of them is worth failing a
 * sign-in over. They are logged, because a claim that keeps failing is a real
 * defect and silence is how the last one survived two months.
 */
export async function claimIntake(
  serviceClient: SupabaseClient,
  intakeId: string,
  userId: string,
): Promise<PreviewInput | null> {
  if (!isIntakeId(intakeId)) return null;

  try {
    // Claim and read in one statement. `claimed_by IS NULL` makes this
    // single-use: a replayed URL updates zero rows and returns nothing, so the
    // same parked answers cannot be attached to a second account.
    const { data, error } = await serviceClient
      .from('pending_intake')
      .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
      .eq('id', intakeId)
      .is('claimed_by', null)
      .select('answers')
      .maybeSingle();

    if (error) {
      console.error('[TunDee intake] claim failed:', error.code, error.message, { intakeId, userId });
      return null;
    }
    if (!data) return null;   // already claimed, or never existed

    const parsed = parsePreviewInput(data.answers);
    if (!parsed) {
      // The row existed but its contents are not answers we can use. Loud,
      // because it means something wrote a shape the validator does not accept.
      console.error('[TunDee intake] claimed row holds unusable answers', { intakeId, userId });
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('[TunDee intake] claim threw:', err, { intakeId, userId });
    return null;
  }
}

/** Pulls an intake id out of a URL or form body. */
export function intakeIdFrom(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) if (isIntakeId(c)) return c;
  return null;
}
