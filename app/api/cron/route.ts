import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vercel Cron job: runs daily at 18:00 UTC (01:00 Thailand time, UTC+7).
 * Marks all scholarships with a past deadline as is_active = false.
 *
 * Secured with CRON_SECRET env variable Vercel sets the Authorization
 * header automatically when invoking the route on schedule.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  // Reject requests without the correct secret (protects against public access)
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const { data, error } = await supabase
      .from('scholarships')
      .update({ is_active: false })
      .lt('deadline_date', today)
      .eq('is_active', true)
      .select('name_th, deadline_date');

    if (error) {
      console.error('[TunDee CRON] Error hiding expired scholarships:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const count = data?.length ?? 0;
    console.log(`[TunDee CRON] Hidden ${count} expired scholarships`);

    return Response.json({
      ok: true,
      hidden: count,
      names: data?.map((s) => `${s.name_th} (${s.deadline_date})`),
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[TunDee CRON] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
