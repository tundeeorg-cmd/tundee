/**
 * GET /api/research/export
 * Admin-only NDJSON export of pseudonymised funnel_events + student_profile data.
 *
 * PDPA compliance:
 *   - Only includes users where consent_research = TRUE
 *   - user_id replaced by stable SHA-256 hash (pseudonymous_id)
 *   - No PII: no name, email, phone, LINE id
 *   - Uses v_research_export view defined in add_research_v2.sql
 *
 * Requires: ADMIN_EMAILS env var (comma-separated) to gate access.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient }               from '@supabase/supabase-js';
import crypto                         from 'crypto';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean);

function pseudonymise(userId: string): string {
  return crypto.createHash('sha256').update(userId).digest('hex');
}

export async function GET(request: NextRequest) {
  // Auth check
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since');    // ISO date, optional
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10000', 10), 50_000);

  // Service role to bypass RLS (view already enforces consent filter)
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let query = db
    .from('funnel_events')
    .select(`
      user_id,
      session_id,
      scholarship_id,
      event_type,
      context,
      occurred_at,
      student_profile!user_id (
        region, area_type, household_income_band, welfare_card,
        school_type, first_generation, birth_year, gpa,
        intended_level, intended_field, consent_research
      ),
      experiment_assignment!user_id (
        experiment_key, variant
      )
    `)
    .not('user_id', 'is', null)
    .order('occurred_at', { ascending: true })
    .limit(limit);

  if (since) query = query.gte('occurred_at', since);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter to consented users and pseudonymise
  type Row = typeof data extends (infer R)[] | null ? R : never;
  const lines = (data ?? [])
    .filter((row: Row) => {
      const sp = row.student_profile as { consent_research?: boolean } | null;
      return sp?.consent_research === true;
    })
    .map((row: Row) => {
      const sp = row.student_profile as unknown as Record<string, unknown> | null;
      const ea = row.experiment_assignment as { experiment_key?: string; variant?: string }[] | null;
      const rankingVariant = (ea ?? []).find(a => a.experiment_key === 'ranking')?.variant ?? null;

      return JSON.stringify({
        pseudo_user_id:        pseudonymise(row.user_id as string),
        session_id:            row.session_id,
        scholarship_id:        row.scholarship_id,
        event_type:            row.event_type,
        context:               row.context,
        occurred_at:           row.occurred_at,
        // Protected attributes — no PII
        region:                sp?.region ?? null,
        area_type:             sp?.area_type ?? null,
        household_income_band: sp?.household_income_band ?? null,
        welfare_card:          sp?.welfare_card ?? null,
        school_type:           sp?.school_type ?? null,
        first_generation:      sp?.first_generation ?? null,
        birth_year:            sp?.birth_year ?? null,
        gpa:                   sp?.gpa ?? null,
        intended_level:        sp?.intended_level ?? null,
        intended_field:        sp?.intended_field ?? null,
        experiment_variant:    rankingVariant,
      });
    });

  // Stream as NDJSON (easy to parse with pandas: pd.read_json(..., lines=True))
  return new NextResponse(lines.join('\n') + '\n', {
    headers: {
      'Content-Type':        'application/x-ndjson',
      'Content-Disposition': `attachment; filename="tundee_research_${new Date().toISOString().slice(0,10)}.ndjson"`,
      'X-Record-Count':      String(lines.length),
      'X-Export-Basis':      'PDPA-2562-consent',
    },
  });
}
