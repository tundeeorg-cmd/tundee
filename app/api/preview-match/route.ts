/**
 * POST /api/preview-match — public, session-free scholarship matching.
 *
 * Powers the "taste before signup" block on /start: a cold visitor gives us
 * education level + GPA + province and immediately gets real matches back.
 *
 * Deliberately anonymous:
 *   • no auth check, no user row is read or written
 *   • queries with the ANON key, so RLS still applies (no service-role escalation
 *     on a public endpoint)
 *   • the only state it creates is the short-lived, non-sensitive tundee_preview
 *     cookie that replays the visitor's answers into the signup wizard
 *
 * Ranking is the SAME lib/recommender pipeline the logged-in /scholarships page
 * runs, over the same `is_displayed = true` row set, so the preview a visitor
 * sees is a true subset of what they get after signing up.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recommend } from '@/lib/recommender/recommend';
import type { RecommenderProfile } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';
import { filterForUnknownGpa, UNKNOWN_GPA_SENTINEL } from '@/lib/recommender/unknownGpa';
import {
  parsePreviewInput,
  encodePreviewInput,
  PREVIEW_COOKIE,
  PREVIEW_COOKIE_MAX_AGE,
  PREVIEW_TOP_N,
  PREVIEW_LIMIT,
  PREVIEW_BROADENED_N,
  type PreviewInput,
  type PreviewMatchCard,
  type PreviewResponse,
} from '@/lib/preview/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same column set the logged-in /scholarships page selects, so preview scores
// and post-login scores are computed from identical inputs.
const COLUMNS = [
  'scholarship_id',
  'scholarship_name_en', 'scholarship_name_th', 'scholarship_name',
  'funder_en', 'funder_th', 'funder',
  'funder_type', 'level', 'field_of_study',
  'award_value_tier', 'award_amount_thb_numeric', 'award_type',
  'renewable', 'bond_obligation',
  'region_eligibility', 'targets_low_income', 'welfare_card_priority',
  'income_cap_thb', 'num_recipients', 'min_gpa', 'english_requirement',
  'open_date', 'date_confidence',
  'deadline_raw', 'deadline_date', 'deadline_is_rolling', 'deadline_note',
  'status', 'status_effective', 'application_url', 'application_link',
  'is_displayed', 'stale', 'source_language', 'translation_review',
].join(', ');

// ── Rate limit ────────────────────────────────────────────────────────────────
// Best-effort, per-instance sliding window. Enough to blunt casual scraping of a
// public endpoint; not a substitute for edge rate limiting if this gets abused.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  // Opportunistic cleanup so the map can't grow unbounded
  if (hits.size > 5_000) {
    hits.forEach((times: number[], key: string) => {
      if (times.every(t => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(key);
    });
  }
  return recent.length > RATE_LIMIT_MAX;
}

// ── Profile construction ──────────────────────────────────────────────────────


/**
 * Builds a recommender profile from the preview answers.
 *
 * income_bracket is now the visitor's DECLARED bracket, not a hardcoded 4.
 * The old default sat at roughly THB 15–20k/month, so a low-income rural
 * student — the population this product exists for — was matched as though
 * they were middle-income, and the awards targeted at them scored as if they
 * did not qualify.
 *
 * GPA, when not given, is passed as 4.0 so the recommender's `profile.gpa <
 * min_gpa` test never fires. Scholarships that actually carry a min_gpa are
 * then removed separately by filterForUnknownGpa() in lib/recommender/unknownGpa
 * — passing a top grade here
 * and filtering there keeps the "unknown GPA" rule in one obvious place rather
 * than pretending the visitor is a straight-A student.
 */
function buildProfile(input: PreviewInput): RecommenderProfile {
  return {
    user_id:               'anonymous-preview',
    province_id:           input.province,
    income_bracket:        input.income,
    gpa:                   input.gpa ?? UNKNOWN_GPA_SENTINEL,
    grade_level:           input.level,
    fields_of_interest:    [],
    welfare_card:          false,
    region:                null,
    area_type:             null,
    household_income_band: null,
    intended_level:        input.level,
    intended_field:        null,
  };
}

/** A usable https link, or null. Guards against the importer's CHECK_WEBSITE sentinel. */
function normaliseApplyUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value || value === 'CHECK_WEBSITE') return null;
  return /^https?:\/\//i.test(value) ? value : null;
}

function toCard(item: {
  scholarship: TdScholarship;
  fairness_score: number;
  explanation: string;
  reasons: string[];
}): PreviewMatchCard {
  const s = item.scholarship;
  return {
    scholarship_id:      s.scholarship_id,
    name:                s.scholarship_name_th || s.scholarship_name_en || s.scholarship_name || '',
    funder:              s.funder_th || s.funder_en || s.funder || '',
    award_tier:          s.award_value_tier,
    award_amount:        s.award_amount_thb_numeric != null ? String(s.award_amount_thb_numeric) : null,
    deadline_date:       s.deadline_date,
    deadline_is_rolling: Boolean(s.deadline_is_rolling),
    status:              s.status_effective || s.status,
    // Both columns are already in the select list; only one is usually populated.
    // 'CHECK_WEBSITE' is a sentinel the legacy importer wrote, not a URL.
    apply_url:           normaliseApplyUrl(s.application_url) ?? normaliseApplyUrl(s.application_link),
    explanation:         item.explanation,
    reasons:             item.reasons.slice(0, 3),
    score:               Math.round(item.fairness_score * 1000) / 1000,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const input = parsePreviewInput(body);
  if (!input) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('[preview-match] Supabase env vars missing');
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  const db = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db
    .from('td_scholarships')
    .select(COLUMNS)
    .eq('is_displayed', true);

  if (error) {
    console.error('[preview-match] scholarship query failed:', error.message);
    return NextResponse.json({ error: 'query_failed' }, { status: 503 });
  }

  // Drop GPA-gated awards when the visitor did not give a GPA, so every count
  // and card below is something we can actually stand behind.
  const scholarships = filterForUnknownGpa(
    (data ?? []) as unknown as TdScholarship[],
    input.gpa,
  );
  const profile = buildProfile(input);

  // Fairness re-ranking off for anonymous visitors — they have no experiment
  // assignment, and the preview must not silently enrol them in the study.
  let result = recommend(scholarships, profile, {
    fairness_mode: 'off',
    variant:       'anonymous',
    limit:         PREVIEW_LIMIT,
  });

  // Empty state: never a dead end. Relax the GPA rule only (the one input most
  // likely to be a near miss) and show a handful of broader options instead.
  let broadened = false;
  if (result.items.length === 0) {
    broadened = true;
    result = recommend(
      scholarships,
      { ...profile, gpa: 4.0 },
      { fairness_mode: 'off', variant: 'anonymous', limit: PREVIEW_BROADENED_N },
    );
  }

  const cards = result.items.map(toCard);
  const preview = cards.slice(0, PREVIEW_TOP_N);

  // Count from the eligible set, not the returned page — `items` is capped at
  // PREVIEW_LIMIT, so using its length would understate the real total in the
  // headline and in the "และอีก N ทุน" gate copy.
  const total = Math.max(result.candidate_count, cards.length);

  const payload: PreviewResponse = {
    preview,
    lockedCount: Math.max(0, total - preview.length),
    total,
    broadened,
  };

  const response = NextResponse.json(payload);

  // Readable by the client on purpose: /profile/setup is a client component and
  // prefills itself from this cookie after login. Contains only the three
  // answers the visitor just typed — no identifiers, no session material.
  response.cookies.set(PREVIEW_COOKIE, encodePreviewInput(input), {
    httpOnly: false,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   PREVIEW_COOKIE_MAX_AGE,
  });

  return response;
}
