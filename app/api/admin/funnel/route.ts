/**
 * GET /api/admin/funnel — acquisition funnel totals for the last 7 and 30 days.
 *
 * Admin only (NEXT_PUBLIC_ADMIN_EMAIL), checked here on the server as well as in
 * the page. Counts distinct browser sessions per step through
 * public.funnel_step_counts (scripts/20261029_v27_funnel_steps.sql).
 *
 * TOTALS ONLY. No ranking_variant, no ab_arm, no split of any kind by arm — see
 * lib/admin/funnel.ts for why that is a rule and not a choice.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildFunnel, FUNNEL_WINDOWS_DAYS, type StepCount } from '@/lib/admin/funnel';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!adminEmail || user.email !== adminEmail) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) {
    console.error('[admin/funnel] service role not configured');
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  const windows: Record<string, ReturnType<typeof buildFunnel>> = {};
  for (const days of FUNNEL_WINDOWS_DAYS) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await admin.rpc('funnel_step_counts', { p_since: since });
    if (error) {
      console.error('[admin/funnel] funnel_step_counts failed:', error.code, error.message);
      // The function is created by migration v27; say so instead of a bare 500.
      const missing = error.code === 'PGRST202' || error.code === '42883';
      return NextResponse.json(
        { error: missing ? 'migration_missing' : 'query_failed',
          hint: missing ? 'Run scripts/20261029_v27_funnel_steps.sql in the Supabase SQL editor.' : undefined },
        { status: missing ? 503 : 500 },
      );
    }
    windows[`d${days}`] = buildFunnel((data ?? []) as StepCount[]);
  }

  return NextResponse.json({ generated_at: new Date().toISOString(), windows });
}
