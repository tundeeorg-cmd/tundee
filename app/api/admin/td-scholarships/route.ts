/**
 * GET /api/admin/td-scholarships
 *
 * Returns ALL td_scholarships rows (including hidden ones) for the admin view.
 * Uses the service-role key to bypass RLS.
 *
 * Query params:
 *   ?displayed=true|false|all  (default: all)
 *   ?stale=true                (filter stale-only)
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Admin auth
    let session = null;
    try {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.auth.getSession();
      session = data.session;
    } catch {
      // ignore
    }
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (!session || !adminEmail || session.user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const displayedFilter = searchParams.get('displayed') ?? 'all';
    const staleOnly = searchParams.get('stale') === 'true';

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = adminClient.from('td_scholarships').select('*').order('scholarship_id');

    if (displayedFilter === 'true')  query = query.eq('is_displayed', true);
    if (displayedFilter === 'false') query = query.eq('is_displayed', false);
    if (staleOnly) query = query.eq('stale', true);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scholarships: data ?? [] });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
