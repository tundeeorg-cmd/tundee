import { createClient } from '@/lib/supabase/client'

export type EventType =
  | 'signup'
  | 'profile_completed'
  | 'scholarship_viewed'
  | 'scholarship_saved'
  | 'scholarship_applied'
  | 'checklist_step_completed'
  | 'outcome_reported'
  | 'session_start'
  | 'matching_results_viewed'
  | 'search_performed'

interface LogEventParams {
  eventType: EventType
  scholarshipId?: string
  metadata?: Record<string, unknown>
  provinceId?: string
}

// Session ID: persists for the browser tab lifetime
let sessionId: string | null = null
function getSessionId(): string {
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
  return sessionId
}

// Fire-and-forget — never await this in UI code
// It logs in the background without blocking the user
export async function logEvent({
  eventType,
  scholarshipId,
  metadata,
  provinceId,
}: LogEventParams): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return  // only log for authenticated users

    await supabase.from('user_events').insert({
      user_id:              user.id,
      event_type:           eventType,
      scholarship_id:       scholarshipId ?? null,
      event_metadata:       metadata ?? null,
      province_id_at_event: provinceId ?? null,
      session_id:           getSessionId(),
      occurred_at:          new Date().toISOString(),
    })
  } catch (err) {
    // Never let logging errors crash the UI
    console.warn('[Research] Event log failed:', err)
  }
}

// ── Convenience wrappers ───────────────────────────────────────────────────────

export const logScholarshipViewed = (
  scholarshipId: string,
  rank?: number,
): void => {
  void logEvent({
    eventType: 'scholarship_viewed',
    scholarshipId,
    metadata: rank !== undefined ? { rank } : undefined,
  })
}

export const logScholarshipSaved = (scholarshipId: string): void => {
  void logEvent({ eventType: 'scholarship_saved', scholarshipId })
}

export const logScholarshipApplied = (
  scholarshipId: string,
  rank?: number,
): void => {
  void logEvent({
    eventType: 'scholarship_applied',
    scholarshipId,
    metadata: rank !== undefined ? { rank } : undefined,
  })
}

export const logSearchPerformed = (
  query: string,
  resultsCount: number,
): void => {
  void logEvent({
    eventType: 'search_performed',
    metadata: { query, results_count: resultsCount },
  })
}

export const logMatchingResultsViewed = (
  matchCount: number,
  topScholarshipId?: string,
): void => {
  void logEvent({
    eventType: 'matching_results_viewed',
    scholarshipId: topScholarshipId,
    metadata: { match_count: matchCount },
  })
}
