import type { ParsedRow } from './importEngine';

export interface ImportProgress {
  total: number;
  done: number;
  inserted: number;
  updated: number;
  errors: string[];
}

export type ProgressCallback = (p: ImportProgress) => void;

// Only send columns that exist in the scholarships DB schema.
// Drops spreadsheet-only fields (notes, review_status) and fixes types.
const ALLOWED_COLUMNS = new Set([
  'name_th', 'name_en',
  'funder_name_th', 'funder_name_en', 'funder_type',
  'amount_thb', 'amount_type',
  'is_loan',
  'min_gpa', 'max_income_thb',
  'welfare_card_priority',
  'grade_levels', 'field_of_study', 'province_restriction',
  'enrolled_university_required',
  'english_level', 'english_score_required',
  'bond_obligation', 'renewable',
  'documents_required',
  'description_th', 'description_en',
  'deadline_date',
  'application_url', 'source_url',
  'historical_bias_score',
  'is_active',
  'last_verified_at',
]);

function buildPayload(row: ParsedRow): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    name_th:                     row.name_th,
    name_en:                     row.name_en,
    funder_name_th:              row.funder_name_th || null,
    funder_name_en:              row.funder_name_en,
    funder_type:                 row.funder_type,
    amount_thb:                  row.amount_thb,
    amount_type:                 row.amount_type,
    is_loan:                     row.is_loan,
    min_gpa:                     row.min_gpa,
    max_income_thb:              row.max_income_thb,
    welfare_card_priority:       row.welfare_card_priority,
    grade_levels:                row.grade_levels ?? [],
    field_of_study:              row.field_of_study ?? [],
    province_restriction:        row.province_restriction ?? [],
    enrolled_university_required: row.enrolled_university_required,
    english_level:               row.english_level,
    english_score_required:      row.english_score_required,
    bond_obligation:             row.bond_obligation,
    renewable:                   row.renewable,
    documents_required:          row.documents_required ?? [],
    description_th:              row.description_th,
    deadline_date:               row.deadline_date,
    application_url:             row.application_url,
    source_url:                  row.source_url,
    historical_bias_score:       row.historical_bias_score,
    is_active:                   true,
    last_verified_at:            new Date().toISOString(),
  };

  // Keep only allowed columns — prevents "column does not exist" errors
  const payload: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (ALLOWED_COLUMNS.has(key)) {
      payload[key] = val === undefined ? null : val;
    }
  }
  return payload;
}

export async function executeImport(
  rows: ParsedRow[],
  onProgress?: ProgressCallback
): Promise<ImportProgress> {
  const toImport = rows.filter(
    r => r.action !== 'skip' && r.conflictResolution !== 'skip'
  );

  const progress: ImportProgress = {
    total: toImport.length,
    done: 0,
    inserted: 0,
    updated: 0,
    errors: [],
  };

  onProgress?.(progress);

  // Send all rows to the server-side API route which uses the service role key.
  // The anon/authenticated Supabase client cannot INSERT due to RLS policies.
  const body = {
    rows: toImport.map(row => ({
      rowNum: row.rowNum,
      existingId: row.existingId,
      payload: buildPayload(row),
    })),
  };

  console.log('[Import] Sending', toImport.length, 'rows to /api/admin/import-rows');

  let result: { inserted: number; updated: number; errors: string[] };
  try {
    const res = await fetch('/api/admin/import-rows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      const msg = `Server error ${res.status}: ${text}`;
      console.error('[Import]', msg);
      return { ...progress, errors: [msg] };
    }

    result = await res.json();
  } catch (e) {
    const msg = `Network error: ${e instanceof Error ? e.message : String(e)}`;
    console.error('[Import]', msg);
    return { ...progress, errors: [msg] };
  }

  console.log('[Import] Result:', result);

  return {
    total: toImport.length,
    done: toImport.length,
    inserted: result.inserted,
    updated: result.updated,
    errors: result.errors,
  };
}
