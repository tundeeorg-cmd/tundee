import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role client, server-only. Null when the env is not configured, so
 * callers decide how to fail rather than crash at import.
 *
 * Needed for profiles.line_user_id / line_linked_at, which the database only
 * accepts from the service role (scripts/20261004_v22_protect_line_columns.sql):
 * LINE sign-in resolves accounts by that column, so a user must never be able to
 * write it with their own session.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
