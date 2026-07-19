/**
 * POST /api/apply-click — log an apply-link click (authenticated or anonymous).
 * Body: { scholarship_id: string }
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let body: { scholarship_id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { scholarship_id } = body;
  if (!scholarship_id) return NextResponse.json({ error: 'scholarship_id required' }, { status: 400 });

  const { error } = await supabase
    .from('apply_click')
    .insert({ user_id: user?.id ?? null, scholarship_id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
