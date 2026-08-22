/**
 * Shared admin gate for API routes.
 *
 * Accepts either env var the codebase already uses: NEXT_PUBLIC_ADMIN_EMAIL
 * (single owner, checked by app/admin/page.tsx) or ADMIN_EMAILS (comma-
 * separated, used by the research routes).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const single = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim();
  if (single && email === single) return true;
  const list = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean);
  return list.includes(email);
}

/** Returns the signed-in admin's email, or null when the caller isn't an admin. */
export async function requireAdmin(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email ?? null;
    return isAdminEmail(email) ? email : null;
  } catch {
    return null;
  }
}
