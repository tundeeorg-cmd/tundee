/**
 * GET /api/admin/recruitment — progress toward the pre-registered sample.
 *
 * Implements §2C of the build brief and §8 of research/PREREGISTRATION.md.
 *
 * ─── THIS ROUTE MUST NEVER RETURN OUTCOME DATA ──────────────────────────────
 *
 * No apply rates, no conversion by arm, no award counts — enrollment counts
 * only. Seeing outcomes split by arm mid-study creates the temptation to stop
 * early or adjust when the split looks favourable, and that inflates the false
 * positive rate. The pre-registration commits to no interim outcome analysis
 * before the stopping point (§8); this endpoint is where that commitment is
 * either kept or quietly broken.
 *
 * The protection is structural rather than a promise: every figure below comes
 * from public.v_recruitment_progress, a view that has no outcome column to
 * select. Adding one would take a migration, not a careless edit here.
 *
 * If you are about to add a field to this route, the question is not "is this
 * useful?" — it is "does this let anyone infer an effect before the stopping
 * date?" If yes, it belongs in the post-stopping analysis, not the dashboard.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin/auth';
import {
  TARGET_PER_ARM,
  type RecruitmentCell,
  type RecruitmentProgress,
} from '@/lib/research/recruitmentTarget';

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await db
    .from('v_recruitment_progress')
    .select('region_group, income_bracket, ranking_variant, recruitment_source, is_target_population, enrolled');

  if (error) {
    // A missing view means the migrations have not been applied yet — say so
    // rather than rendering an empty dashboard that looks like zero recruitment.
    console.error('[admin/recruitment]', error.code, error.message);
    return NextResponse.json(
      { error: 'recruitment_view_unavailable', detail: error.message },
      { status: 503 },
    );
  }

  const cells = (data ?? []) as RecruitmentCell[];

  let baseline = 0;
  let fairness = 0;
  let totalRandomized = 0;
  const byRecruitmentSource: Record<string, number> = {};

  for (const c of cells) {
    totalRandomized += c.enrolled;

    const source = c.recruitment_source ?? 'unknown';
    byRecruitmentSource[source] = (byRecruitmentSource[source] ?? 0) + c.enrolled;

    if (!c.is_target_population) continue;
    if (c.ranking_variant === 'baseline') baseline += c.enrolled;
    if (c.ranking_variant === 'fairness_adjusted') fairness += c.enrolled;
  }

  // Progress is governed by the SMALLER arm: the study is powered on having
  // 294 in each, so being ahead in one arm does not buy anything.
  const percentComplete = Math.round(
    (Math.min(baseline, fairness) / TARGET_PER_ARM) * 100,
  );

  const payload: RecruitmentProgress = {
    targetPopulation: {
      baseline,
      fairness_adjusted: fairness,
      targetPerArm: TARGET_PER_ARM,
      percentComplete,
    },
    cells,
    byRecruitmentSource,
    totalRandomized,
  };

  return NextResponse.json(payload);
}
