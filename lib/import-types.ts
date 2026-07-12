// Shared types for the scholarship import pipeline.
// Used by both the API route (app/api/admin/import/route.ts)
// and the admin UI (app/admin/page.tsx).

export type ImportAction = 'insert' | 'update' | 'skip' | 'invalid'

export interface ImportRowResult {
  /** 1-based row number in the uploaded file */
  row: number
  name_th: string
  funder: string
  dedupe_key: string
  action: ImportAction
  /** Human-readable reason (for skip/invalid rows) */
  skip_reason?: string
  /** Non-fatal warnings attached to an otherwise-valid row */
  flags: string[]
}

export interface ImportSummary {
  dry_run: boolean
  inserted: number
  updated: number
  skipped_not_verified: number
  skipped_past_deadline: number
  skipped_no_deadline: number
  skipped_invalid: number
  /** Rows where name_en was auto-generated */
  translated: number
  /** All rows with their disposition */
  rows: ImportRowResult[]
}
