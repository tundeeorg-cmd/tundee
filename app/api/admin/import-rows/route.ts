/**
 * POST /api/admin/import-rows
 *
 * Accepts pre-parsed, pre-validated scholarship rows from the client-side
 * import engine and writes them to Supabase using the service role key
 * (bypasses RLS). Admin auth is verified server-side before any write.
 *
 * Body: { rows: Array<{ rowNum, existingId, payload }> }
 * Response: { inserted, updated, errors: string[] }
 */

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

interface IncomingRow {
  rowNum: number;
  existingId: string | null;
  payload: Record<string, unknown>;
}

function formatSupabaseError(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  const e = err as Record<string, unknown>;
  return (
    (e.message as string) ||
    (e.details as string) ||
    (e.hint as string) ||
    (e.error as string) ||
    JSON.stringify(err)
  );
}

export async function POST(request: NextRequest) {
  try {
    // ── Check env vars first — throws if missing, causing opaque 500 ───────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('[import-rows] Missing env vars — hasUrl:', !!supabaseUrl, 'hasServiceKey:', !!serviceKey);
      return NextResponse.json({
        inserted: 0, updated: 0,
        errors: ['Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set. Add it to Vercel → Settings → Environment Variables, then redeploy.'],
      }, { status: 500 });
    }

    // ── Auth: verify admin session ────────────────────────────────────────
    let session = null;
    try {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.auth.getSession();
      session = data.session;
    } catch (authErr) {
      console.error('[import-rows] Auth check failed:', authErr);
    }

    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (!session || !adminEmail || session.user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Parse body ────────────────────────────────────────────────────────
    let body: { rows: IncomingRow[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { rows } = body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ inserted: 0, updated: 0, errors: [] });
    }

    // ── Service-role client (bypasses RLS) ────────────────────────────────
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const results = { inserted: 0, updated: 0, errors: [] as string[] };

    for (const row of rows) {
      const { rowNum, existingId, payload } = row;
      const label = `Row ${rowNum} (${payload.name_th ?? ''})`;

      if (existingId) {
        const { error } = await adminClient
          .from('scholarships')
          .update(payload)
          .eq('id', existingId);
        if (error) {
          console.error('[import-rows] Update failed:', label, error);
          results.errors.push(`${label}: ${formatSupabaseError(error)}`);
        } else {
          results.updated++;
        }
      } else {
        const { error } = await adminClient
          .from('scholarships')
          .insert(payload);
        if (error) {
          console.error('[import-rows] Insert failed:', label, error);
          results.errors.push(`${label}: ${formatSupabaseError(error)}`);
        } else {
          results.inserted++;
        }
      }
    }

    console.log('[import-rows] Done — inserted:', results.inserted, 'updated:', results.updated, 'errors:', results.errors.length);
    return NextResponse.json(results);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[import-rows] Unhandled error:', err);
    return NextResponse.json({
      inserted: 0, updated: 0,
      errors: [`Server error: ${msg}`],
    }, { status: 500 });
  }
}
