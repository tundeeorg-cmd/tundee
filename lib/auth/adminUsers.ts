/**
 * Service-role lookups against Supabase Auth.
 *
 * supabase-js has no admin.getUserByEmail, so finding an account by address
 * means paging listUsers. Two routes need it — the LINE bridge, to reuse an
 * account when LINE grants us a real address, and the password route, to tell a
 * Google user why their password is being rejected — and a second copy of the
 * pagination is a second place to get the exhaustion bound wrong.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { LINE_PROVIDER } from '@/lib/line/authMode';

/** Enough for ~4,000 accounts. Logged, not silently truncated, when exceeded. */
const MAX_PAGES = 20;
const PER_PAGE = 200;

/** The account with this address, or null. Case-insensitive, as email is. */
export async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error('[auth/adminUsers] listUsers failed:', error.message);
      return null;
    }
    const hit = data.users.find(u => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < PER_PAGE) return null;
  }

  // Not "no such user" — "we stopped looking". Saying so is the difference
  // between a diagnosable bug and a user who is silently told to sign up again.
  console.warn(`[auth/adminUsers] exhausted ${MAX_PAGES} pages without a match`);
  return null;
}

/** Which provider owns this account, for copy that names the right button. */
export function providerOf(user: User): 'google' | 'line' | 'password' {
  if (user.app_metadata?.provider === 'google') return 'google';
  // Supabase-mode LINE accounts carry it in app_metadata, which only the server
  // can write; bridge-era accounts (and v23-migrated ones) in user_metadata.
  if (user.app_metadata?.provider === LINE_PROVIDER) return 'line';
  if ((user.app_metadata?.providers as string[] | undefined)?.includes(LINE_PROVIDER)) return 'line';
  if (user.user_metadata?.provider === 'line') return 'line';
  return 'password';
}
