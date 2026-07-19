/**
 * EventRepository — insert-only data access for the `event` table.
 *
 * Append-only contract is enforced at three layers:
 *   1. This class: exposes only insert(). No update(), delete(), or
 *      findForUpdate() method exists, making misuse impossible via TypeScript.
 *   2. Supabase RLS: no UPDATE or DELETE policy is defined on `event`, so
 *      authenticated callers cannot mutate rows even with a direct client.
 *   3. PostgreSQL trigger: trg_event_append_only raises EXCEPTION on any
 *      UPDATE or DELETE, catching bypasses (e.g. service-role direct SQL).
 *
 * To correct a previously logged outcome, INSERT a new row with
 * event_type = 'outcome_verified' — never mutate the original row.
 *
 * Usage (fire-and-forget):
 *   eventRepository.insert({ event_type: 'impression', ... })
 *
 * Usage (awaited for test assertions):
 *   const result = await eventRepository.insert({ ... })
 */

import { createClient } from '@/lib/supabase/client';
import type { EventInsert, EventRow } from './tableTypes';
import { getSessionId } from './session';

export interface InsertResult {
  data: EventRow | null;
  error: string | null;
}

export class EventRepository {
  private readonly tableName = 'event';

  /**
   * Insert one event row. Returns { data, error }.
   * Never throws — caller decides whether to surface errors.
   */
  async insert(event: EventInsert): Promise<InsertResult> {
    try {
      const supabase = createClient();
      const row = {
        ...event,
        session_id:   event.session_id   ?? getSessionId(),
        context:      event.context      ?? {},
      };

      const { data, error } = await supabase
        .from(this.tableName)
        .insert(row)
        .select()
        .single();

      if (error) return { data: null, error: error.message };
      return { data: data as EventRow, error: null };
    } catch (err) {
      return { data: null, error: String(err) };
    }
  }

  /**
   * Insert multiple event rows in one DB round-trip (e.g. impression batches).
   * Returns count of successfully inserted rows.
   */
  async insertBatch(events: EventInsert[]): Promise<{ count: number; error: string | null }> {
    if (!events.length) return { count: 0, error: null };
    try {
      const supabase = createClient();
      const sessionId = getSessionId();
      const rows = events.map(e => ({
        ...e,
        session_id: e.session_id ?? sessionId,
        context:    e.context    ?? {},
      }));

      const { error, count } = await supabase
        .from(this.tableName)
        .insert(rows)
        .select();

      if (error) return { count: 0, error: error.message };
      return { count: count ?? rows.length, error: null };
    } catch (err) {
      return { count: 0, error: String(err) };
    }
  }

  // ── NO update(), delete(), upsert(), or findForUpdate() ──────────────────
  // Append-only means there is intentionally no mutation API.
  // TypeScript enforces this statically: if you try to call eventRepository.update(...)
  // the compiler will error at the call site, not at runtime.
}

/** Singleton for client-side fire-and-forget usage. */
export const eventRepository = new EventRepository();

/** Convenience: log a single event and discard errors (same pattern as logFunnelEvent). */
export function logEvent(event: EventInsert): void {
  void eventRepository.insert(event);
}
