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
  // ── Auth: verify admin session ──────────────────────────────────────────
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!session || !adminEmail || session.user.email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────
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

  // ── Service-role client (bypasses RLS) ──────────────────────────────────
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

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
        results.errors.push(`${label}: ${formatSupabaseError(error)}`);
      } else {
        results.updated++;
      }
    } else {
      const { error } = await adminClient
        .from('scholarships')
        .insert(payload);
      if (error) {
        results.errors.push(`${label}: ${formatSupabaseError(error)}`);
      } else {
        results.inserted++;
      }
    }
  }

  return NextResponse.json(results);
}
