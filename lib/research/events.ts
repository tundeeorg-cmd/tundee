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
  /** Stamp A/B arm so every event is labelled for treatment-effect analysis */
  abArm?: string | null
  /** Stamp income bracket (1-7) so events can be grouped without joining profiles */
  incomeBracket?: number | null
}

// ── Module-level user context ─────────────────────────────────────────────────
// Set once when the user's profile loads (see setUserResearchContext).
// This lets all fire-and-forget event calls carry ab_arm and income_bracket
// without needing to re-fetch the profile on every event.
let _abArm: string | null = null
let _incomeBracket: number | null = null

/** Call this once when the profile loads (e.g. in the scholarships page). */
export function setUserResearchContext(abArm: string | null, incomeBracket: number | null): void {
  _abArm = abArm
  _incomeBracket = incomeBracket
}

// Session ID: persists for the browser tab lifetime
let sessionId: string | null = null
function getSessionId(): string {
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
  return sessionId
}

// ── GA4 helper ────────────────────────────────────────────────────────────────
// First-party Supabase DB is the data of record for research.
// GA events are a secondary signal for product analytics only.
function gtagEvent(eventName: string, params: Record<string, unknown>): void {
  try {
    if (typeof window !== 'undefined' && typeof (window as unknown as Record<string, unknown>).gtag === 'function') {
      ;(window as unknown as Record<string, (cmd: string, name: string, params: Record<string, unknown>) => void>)
        .gtag('event', eventName, params)
    }
  } catch { /* never block on GA */ }
}

// Fire-and-forget — never await this in UI code
// It logs in the background without blocking the user
export async function logEvent({
  eventType,
  scholarshipId,
  metadata,
  abArm,
  incomeBracket,
}: LogEventParams): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return  // only log for authenticated users

    // Use passed values, fall back to module-level context
    const arm    = abArm      !== undefined ? abArm      : _abArm
    const income = incomeBracket !== undefined ? incomeBracket : _incomeBracket

    const { error } = await supabase.from('user_events').insert({
      user_id:        user.id,
      event_type:     eventType,
      scholarship_id: scholarshipId ?? null,
      event_metadata: metadata ?? null,
      ab_arm:         arm ?? null,
      income_bracket: income ?? null,
      occurred_at:    new Date().toISOString(),
    })
    // 23505 = duplicate, 23503 = FK violation (stale JWT / user not in auth.users) — swallow silently
    if (error && error.code !== '23505' && error.code !== '23503' && !error.message?.includes('column')) throw error

    // Mirror to GA (secondary signal — not research data of record)
    gtagEvent(eventType, {
      scholarship_id: scholarshipId ?? undefined,
      ab_arm:         arm ?? undefined,
      ...metadata,
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

// ── Deterministic A/B arm assignment ─────────────────────────────────────────
// Used when a user's profile has ab_arm = NULL (new user after migration backfill).
// Stable: same UUID always → same arm.  ~50/50 split across random UUIDs.
export function assignAbArm(userId: string): 'treatment' | 'control' {
  // Use first two hex nibbles of UUID for stability
  const nibble = parseInt(userId.replace(/-/g, '').slice(0, 2), 16)
  return nibble % 2 === 0 ? 'treatment' : 'control'
}
