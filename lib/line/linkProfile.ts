import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Write a LINE user id onto profiles.line_user_id after a Supabase-mode LINE
 * sign-in.
 *
 * The bridge did this on every LINE login, and the reminder bot, the LINE crons
 * and the outcome survey all address students through that column. With LINE as
 * a Supabase provider the id lives on the auth identity instead, so without this
 * a new LINE student would never receive a single LINE reminder.
 *
 * Service role only — the column rejects writes from a user session (v22).
 *
 * A unique violation means another account already holds this LINE id: an
 * existing LINE student whose account did not get its `custom:line` identity
 * from scripts/20261005_v23_line_identities.sql, now signed into a second, new
 * account. Logged loudly with both ids, never fatal — the student still gets in.
 */
export async function linkLineProfile(
  admin: SupabaseClient,
  userId: string,
  lineSub: string,
): Promise<'linked' | 'held_by_other_account' | 'failed'> {
  const { error } = await admin
    .from('profiles')
    .upsert(
      { id: userId, line_user_id: lineSub, line_linked_at: new Date().toISOString() },
      { onConflict: 'id' },
    );

  if (!error) return 'linked';

  if (error.code === '23505') {
    const { data: holder } = await admin
      .from('profiles')
      .select('id')
      .eq('line_user_id', lineSub)
      .maybeSingle();
    console.error(
      '[line/linkProfile] LINE id already belongs to another account — duplicate created.',
      'Give that account its custom:line identity (v23) and merge.',
      { newUser: userId, existingUser: holder?.id ?? 'unknown' },
    );
    return 'held_by_other_account';
  }

  console.error('[line/linkProfile] profile link failed:', error.message);
  return 'failed';
}
