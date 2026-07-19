/**
 * POST /api/self-report
 * User self-reports a scholarship outcome (applied / awarded / rejected).
 * Writes a self_report_outcome event to funnel_events AND updates tracked_scholarship.status.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const VALID_OUTCOMES = ['applied', 'awarded', 'rejected'] as const;
type Outcome = (typeof VALID_OUTCOMES)[number];

const OUTCOME_TO_STATUS: Record<Outcome, string> = {
  applied:  'applied',
  awarded:  'awarded',
  rejected: 'rejected',
};

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { scholarship_id, outcome, outcome_date, session_id, notes } = body as {
    scholarship_id: string;
    outcome: string;
    outcome_date?: string;
    session_id?: string;
    notes?: string;
  };

  if (!scholarship_id) return NextResponse.json({ error: 'scholarship_id required' }, { status: 422 });
  if (!VALID_OUTCOMES.includes(outcome as Outcome)) {
    return NextResponse.json({ error: `outcome must be one of: ${VALID_OUTCOMES.join(', ')}` }, { status: 422 });
  }

  // 1. Write self_report_outcome event to funnel_events
  const { error: eventErr } = await supabase.from('funnel_events').insert({
    user_id:        user.id,
    session_id:     session_id ?? 'server',
    scholarship_id,
    event_type:     'self_report_outcome',
    context: {
      outcome,
      outcome_date:    outcome_date ?? null,
      notes:           notes ?? null,
      provenance:      'self_report',
    },
    occurred_at: new Date().toISOString(),
  });

  if (eventErr) {
    console.error('[self-report] event write error:', eventErr);
    return NextResponse.json({ error: eventErr.message }, { status: 500 });
  }

  // 2. Update tracked_scholarship.status (if the user has this scholarship tracked)
  await supabase
    .from('tracked_scholarship')
    .update({
      status:     OUTCOME_TO_STATUS[outcome as Outcome],
      notes:      notes ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('scholarship_id', scholarship_id);

  return NextResponse.json({ ok: true });
}
