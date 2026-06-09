import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, { ok: boolean; detail: string }> = {};

  const supabase = await createServerSupabaseClient();

  // Check 0: Database connection (total count)
  try {
    const { count, error } = await supabase
      .from('scholarships')
      .select('*', { count: 'exact', head: true });
    if (error) results.db = { ok: false, detail: error.message };
    else results.db = { ok: true, detail: `Connected ${count} scholarships` };
  } catch (e: unknown) {
    results.db = { ok: false, detail: e instanceof Error ? e.message : 'DB error' };
  }

  // Check 1: Scholarships loading (first active record)
  try {
    const { data, error } = await supabase
      .from('scholarships')
      .select('id, name_th')
      .eq('is_active', true)
      .limit(1);
    if (error) results.scholarships = { ok: false, detail: error.message };
    else if (!data || data.length === 0)
      results.scholarships = { ok: false, detail: 'No active scholarships check RLS or is_active flag' };
    else results.scholarships = { ok: true, detail: `Loading OK first: ${data[0].name_th}` };
  } catch (e: unknown) {
    results.scholarships = { ok: false, detail: e instanceof Error ? e.message : 'Query error' };
  }

  // Check 2: Auth system (verify Supabase auth is reachable)
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error && error.message !== 'invalid claim: missing sub claim') {
      // "missing sub claim" just means no logged-in user that's fine
      results.auth = { ok: false, detail: error.message };
    } else {
      results.auth = {
        ok: true,
        detail: data?.user?.email
          ? `Logged in as ${data.user.email}`
          : 'Auth system reachable (not logged in)',
      };
    }
  } catch (e: unknown) {
    results.auth = { ok: false, detail: e instanceof Error ? e.message : 'Auth error' };
  }

  return NextResponse.json(results);
}
