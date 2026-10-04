/**
 * POST /api/line/unlink — remove the LINE connection from the current user's profile.
 *
 * The session identifies the user; the write goes through the service role,
 * because the LINE columns reject writes from a user session (v22).
 */

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) {
    console.error('[line/unlink] SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { error } = await admin
    .from('profiles')
    .update({ line_user_id: null, line_linked_at: null })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
