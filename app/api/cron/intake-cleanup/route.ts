/**
 * GET /api/cron/intake-cleanup — delete /start answers nobody ever claimed.
 *
 * pending_intake exists to carry a visitor's answers across a browser boundary
 * during signup. Once claimed the row has done its job, and one that is never
 * claimed belongs to someone who did not sign up — so neither has any reason to
 * be kept.
 *
 * Retention is 7 days, which comfortably outlasts the signup it supports (the
 * preview cookie lives 24 hours) while keeping the table from accumulating the
 * answers of everyone who ever tried the quiz. Nothing in it identifies a
 * person — education level, province, income band, optional GPA — but data we
 * have no use for is data we should not be holding.
 *
 * Runs daily from vercel.json. Authorised with CRON_SECRET like every other
 * cron here; POST works too, for a manual sweep.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { INTAKE_TTL_DAYS } from '@/lib/intake/pendingIntake';

async function sweep(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing SUPABASE env vars' }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - INTAKE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Unclaimed only. A claimed row is a record that a specific account's answers
  // came from a specific parked intake, which is worth keeping for as long as
  // the account is being onboarded.
  const { data, error } = await db
    .from('pending_intake')
    .delete()
    .is('claimed_by', null)
    .lt('created_at', cutoff)
    .select('id');

  if (error) {
    console.error('[cron/intake-cleanup] delete failed:', error.code, error.message);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }

  const deleted = data?.length ?? 0;
  console.log(`[cron/intake-cleanup] deleted ${deleted} unclaimed intake rows older than ${cutoff}`);
  return NextResponse.json({ ok: true, deleted, cutoff });
}

export async function GET(request: NextRequest)  { return sweep(request); }
export async function POST(request: NextRequest) { return sweep(request); }
