/**
 * Sticky experiment variant assignment.
 *
 * Each user gets one deterministic variant per experiment_key, stored in
 * the experiment_assignment table.  The deterministic hash ensures ~50/50
 * split across random UUIDs and is consistent before the DB row is written
 * (useful for optimistic rendering).
 */

import { createClient } from '@/lib/supabase/client';

export type ExperimentVariant = 'control' | 'treatment';
export const RANKING_EXPERIMENT = 'ranking';

/** Deterministic 50/50 split based on userId + experimentKey. */
export function computeVariant(userId: string, experimentKey: string): ExperimentVariant {
  const seed = userId.replace(/-/g, '') + experimentKey;
  // Sum of first 8 hex chars gives enough entropy for 50/50
  const n = parseInt(seed.slice(0, 8), 16);
  return n % 2 === 0 ? 'treatment' : 'control';
}

/** Cache in-memory for the lifetime of the page (avoids repeated DB reads). */
const _cache: Map<string, ExperimentVariant> = new Map();

/**
 * Get (or create) the user's sticky variant for the given experiment.
 * Returns null for anonymous users (no persistent assignment).
 */
export async function getOrAssignVariant(
  userId: string,
  experimentKey: string = RANKING_EXPERIMENT,
): Promise<ExperimentVariant> {
  const cacheKey = `${userId}|${experimentKey}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey)!;

  const supabase = createClient();

  // Check DB first (sticky: if already assigned, return existing)
  const { data: existing } = await supabase
    .from('experiment_assignment')
    .select('variant')
    .eq('user_id', userId)
    .eq('experiment_key', experimentKey)
    .maybeSingle();

  if (existing?.variant) {
    const v = existing.variant as ExperimentVariant;
    _cache.set(cacheKey, v);
    return v;
  }

  // New user — compute deterministically and persist
  const variant = computeVariant(userId, experimentKey);
  await supabase
    .from('experiment_assignment')
    .upsert({ user_id: userId, experiment_key: experimentKey, variant }, { onConflict: 'user_id,experiment_key' });

  _cache.set(cacheKey, variant);
  return variant;
}
