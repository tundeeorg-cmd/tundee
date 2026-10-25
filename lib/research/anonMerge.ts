/**
 * The sign-in hook for anonymous randomization. SERVER ONLY.
 *
 * Called from /auth/callback once a session exists and the profile has been merged.
 * With ANON_RANDOMIZATION off it returns before reading anything. It NEVER throws
 * and never blocks a sign-in: a student who cannot be merged still gets in, and the
 * reason is logged under `[anon]` — the anonymous row stays unclaimed, so the next
 * sign-in tries again.
 */

import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { intakeIdFrom } from '@/lib/intake/pendingIntake';
import { anonRandomizationEnabled, isAnonId } from './anonAssignment';
import { anonIdFromRequest } from './anonRequest';
import { mergeAnonAssignment } from './anonStore';

export async function mergeAnonAfterSignIn(
  request: NextRequest,
  userId: string,
  intakeParam: string | null,
): Promise<void> {
  if (!anonRandomizationEnabled()) return;

  try {
    const admin = createAdminClient();
    if (!admin) {
      console.error('[anon] sign-in merge skipped: service role not configured');
      return;
    }

    // Same browser: the cookie. Another browser (the sign-in link opened in Chrome
    // after the quiz was answered in the Facebook webview): the id parked beside the
    // answers, found through the intake id that rides the sign-in link.
    let anonId = anonIdFromRequest(request);
    if (!anonId) {
      const intakeId = intakeIdFrom(intakeParam);
      if (intakeId) {
        const { data, error } = await admin.from('pending_intake').select('answers').eq('id', intakeId).maybeSingle();
        if (error) {
          console.error('[anon] could not read the parked intake:', error.message);
        } else {
          const parked = (data as { answers?: { anon_id?: unknown } } | null)?.answers?.anon_id;
          if (isAnonId(parked)) anonId = parked;
        }
      }
    }
    if (!anonId) return;

    await mergeAnonAssignment(admin, { anonId, userId });
  } catch (err) {
    console.error('[anon] sign-in merge threw:', (err as Error).message);
  }
}
