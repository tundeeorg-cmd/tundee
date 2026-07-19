/**
 * Funnel event logger — writes to funnel_events (append-only; never mutate).
 *
 * Use this instead of the legacy lib/research/events.ts for all new instrumentation.
 * Events are written directly from the browser to Supabase (RLS enforces user_id
 * ownership; anonymous events are allowed with user_id = NULL).
 */

import { createClient } from '@/lib/supabase/client';
import { getSessionId } from './session';

export type FunnelEventType =
  | 'search'
  | 'view_list'
  | 'impression'
  | 'view_detail'
  | 'click_apply'
  | 'track_add'
  | 'track_remove'
  | 'status_change'
  | 'self_report_outcome';

export interface FunnelEventPayload {
  eventType: FunnelEventType;
  scholarshipId?: string | null;
  userId?: string | null;
  context?: Record<string, unknown>;
}

export interface FunnelEventRow {
  session_id: string;
  user_id: string | null;
  scholarship_id: string | null;
  event_type: FunnelEventType;
  context: Record<string, unknown>;
  occurred_at: string;
}

/** Write a single funnel event (fire-and-forget). */
export function logFunnelEvent(payload: FunnelEventPayload): void {
  void writeFunnelEvent(payload);
}

/** Write a batch of impression events efficiently (single DB round-trip). */
export function logImpressions(
  scholarships: Array<{ scholarshipId: string; rank: number }>,
  userId: string | null,
  variant: string | null,
  tab: string,
): void {
  if (!scholarships.length) return;
  void writeFunnelBatch(
    scholarships.map(({ scholarshipId, rank }) => ({
      session_id:     getSessionId(),
      user_id:        userId,
      scholarship_id: scholarshipId,
      event_type:     'impression' as FunnelEventType,
      context:        { rank, variant, tab },
      occurred_at:    new Date().toISOString(),
    })),
  );
}

async function writeFunnelEvent(payload: FunnelEventPayload): Promise<void> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from('funnel_events').insert({
      session_id:     getSessionId(),
      user_id:        payload.userId ?? null,
      scholarship_id: payload.scholarshipId ?? null,
      event_type:     payload.eventType,
      context:        payload.context ?? {},
      occurred_at:    new Date().toISOString(),
    });
    if (error) console.warn('[funnel] write error:', error.message);
  } catch (err) {
    console.warn('[funnel] unexpected error:', err);
  }
}

async function writeFunnelBatch(rows: FunnelEventRow[]): Promise<void> {
  if (!rows.length) return;
  try {
    const supabase = createClient();
    const { error } = await supabase.from('funnel_events').insert(rows);
    if (error) console.warn('[funnel] batch write error:', error.message);
  } catch (err) {
    console.warn('[funnel] batch unexpected error:', err);
  }
}
