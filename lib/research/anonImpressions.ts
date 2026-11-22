/**
 * What a randomized anonymous visitor was SHOWN (scripts/20261122_v38_2). SERVER ONLY.
 *
 * One row per card served by /api/preview-match, written on the server at the moment
 * of serving — never reported by the page, so it cannot be skipped or invented. The
 * rank is the card's 1-indexed position in the arm-ranked list (offset + index + 1),
 * so "load 10 more" continues the same numbering.
 *
 * Read back by /api/apply-click to put the rank of the clicked card on the outcome row
 * (PREREG §6.2 #4: mean served rank of clicked scholarships).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServedImpression } from './outcomeBinding';
import { anonLogTag } from './anonAssignment';
import { isMissingTable } from './anonStore';

export interface AnonImpressionRow {
  anon_id: string;
  scholarship_id: string;
  rank: number;
  fairness_mode: 'on' | 'off';
  variant: string;
  broadened: boolean;
  surface: string;
  served_at: string;
}

export function buildAnonImpressionRows(input: {
  anonId: string;
  scholarshipIds: string[];
  offset: number;
  fairnessMode: 'on' | 'off';
  variant: string;
  broadened: boolean;
  servedAt: Date;
  surface?: string;
}): AnonImpressionRow[] {
  const at = input.servedAt.toISOString();
  return input.scholarshipIds.map((scholarship_id, i) => ({
    anon_id:        input.anonId,
    scholarship_id,
    rank:           input.offset + i + 1,
    fairness_mode:  input.fairnessMode,
    variant:        input.variant,
    broadened:      input.broadened,
    surface:        input.surface ?? 'start_preview',
    served_at:      at,
  }));
}

/**
 * Writes the impressions. Never throws and never blocks the visitor's results: a
 * failure costs the rank of a later click, not the click, and is logged.
 */
export async function recordAnonImpressions(
  admin: SupabaseClient,
  rows: AnonImpressionRow[],
): Promise<{ written: number; error: string | null }> {
  if (rows.length === 0) return { written: 0, error: null };
  try {
    const { error } = await admin.from('anon_impressions').insert(rows);
    if (error) {
      const why = isMissingTable(error) ? 'table missing — run scripts/20261122_v38_2' : error.message;
      console.error('[anon] impressions NOT recorded', { anon: anonLogTag(rows[0].anon_id), n: rows.length, why });
      return { written: 0, error: why };
    }
    return { written: rows.length, error: null };
  } catch (err) {
    console.error('[anon] impressions threw:', (err as Error).message);
    return { written: 0, error: (err as Error).message };
  }
}

/**
 * The latest card of this scholarship served to this anonymous participant at or
 * before the click, in the shape bindOutcome reads. Null when there is none (or the
 * lookup failed — logged; the click is still bound, without a rank).
 */
export async function latestAnonImpression(
  admin: SupabaseClient,
  anonId: string,
  scholarshipId: string,
  clickedAt: Date,
): Promise<ServedImpression | null> {
  const { data, error } = await admin
    .from('anon_impressions')
    .select('served_at, rank, fairness_mode')
    .eq('anon_id', anonId)
    .eq('scholarship_id', scholarshipId)
    .lte('served_at', clickedAt.toISOString())
    .order('served_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[apply-click] anonymous impression lookup failed — rank not recorded:', error.message);
    return null;
  }
  const row = data as { served_at: string; rank: number; fairness_mode: string } | null;
  if (!row) return null;
  // 'matches': the /start results are the personalized, arm-ranked list.
  return { occurred_at: row.served_at, context: { rank: row.rank, tab: 'matches', fairness_mode: row.fairness_mode } };
}
