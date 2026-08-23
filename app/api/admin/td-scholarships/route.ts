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

    // PostgREST caps an unbounded select at `max-rows` (1000 on Supabase). This route
    // promises ALL rows and the admin dashboard counts the array it gets back, so the
    // cap was being reported as the total: "1000 Total / 316 Displayed / 684 Hidden"
    // was the displayed/hidden split of the first 1000 rows by scholarship_id, not of
    // the table. Page explicitly until a short page comes back.
    const PAGE_SIZE = 1000;
    const rows: unknown[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      let query = adminClient
        .from('td_scholarships')
        .select('*')
        .order('scholarship_id')
        .range(from, from + PAGE_SIZE - 1);

      if (displayedFilter === 'true')  query = query.eq('is_displayed', true);
      if (displayedFilter === 'false') query = query.eq('is_displayed', false);
      if (staleOnly) query = query.eq('stale', true);

      const { data: page, error } = await query;

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      rows.push(...(page ?? []));
      if (!page || page.length < PAGE_SIZE) break;
    }

    const data = rows;

    return NextResponse.json({ scholarships: data ?? [] });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
