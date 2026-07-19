/**
 * GET /api/admin/td-scholarships/export
 *
 * Downloads all td_scholarships rows as a CSV in the exact 20-column
 * spreadsheet order. The exported file can be re-imported with 0 changes.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const COLUMNS = [
  'scholarship_id', 'scholarship_name', 'funder', 'funder_type', 'level',
  'field_of_study', 'award_amount_thb', 'region_eligibility', 'targets_low_income',
  'num_recipients', 'min_gpa', 'income_cap_thb', 'language', 'deadline_raw',
  'status', 'application_link', 'source', 'verification_status', 'last_verified', 'notes',
] as const;

const HEADERS = [
  'Scholarship ID', 'Scholarship Name', 'Funder', 'Funder Type', 'Level',
  'Field of Study', 'Award Amount (THB)', 'Region Eligibility', 'Targets Low-Income (Y/N)',
  'No. of Recipients', 'Min GPA', 'Income Cap (THB/yr)', 'Language', 'Deadline',
  'Status', 'Application Link', 'Source', 'Verification Status', 'Last Verified', 'Notes',
];

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'boolean' ? (v ? 'Y' : 'N') : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export async function GET(_request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new NextResponse('Server configuration error', { status: 500 });

  let email: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getSession();
    email = data.session?.user.email ?? null;
  } catch { /* ignore */ }

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!email || !adminEmail || email !== adminEmail) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: rows, error } = await db
    .from('td_scholarships')
    .select(COLUMNS.join(', '))
    .order('scholarship_id');

  if (error) return new NextResponse(error.message, { status: 500 });

  const lines: string[] = [HEADERS.join(',')];
  for (const row of rows ?? []) {
    lines.push(COLUMNS.map(col => cell((row as unknown as Record<string, unknown>)[col])).join(','));
  }

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="td_scholarships_${today}.csv"`,
    },
  });
}
