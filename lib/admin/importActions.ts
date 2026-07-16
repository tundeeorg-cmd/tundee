import { createClient } from '@/lib/supabase/client';
import type { ParsedRow } from './importEngine';

export interface ImportProgress {
  total: number;
  done: number;
  inserted: number;
  updated: number;
  errors: string[];
}

export type ProgressCallback = (p: ImportProgress) => void;

function buildPayload(row: ParsedRow): Record<string, unknown> {
  return {
    name_th: row.name_th,
    name_en: row.name_en,
    funder_name_th: row.funder_name_th || null,
    funder_name_en: row.funder_name_en,
    funder_type: row.funder_type,
    amount_thb: row.amount_thb,
    amount_type: row.amount_type,
    is_loan: row.is_loan,
    min_gpa: row.min_gpa,
    max_income_thb: row.max_income_thb,
    welfare_card_priority: row.welfare_card_priority,
    grade_levels: row.grade_levels,
    field_of_study: row.field_of_study,
    province_restriction: row.province_restriction,
    enrolled_university_required: row.enrolled_university_required,
    english_level: row.english_level,
    english_score_required: row.english_score_required,
    bond_obligation: row.bond_obligation,
    renewable: row.renewable,
    documents_required: row.documents_required,
    description_th: row.description_th,
    deadline_date: row.deadline_date,
    application_url: row.application_url,
    source_url: row.source_url,
    historical_bias_score: row.historical_bias_score,
    is_active: true,
    last_verified_at: new Date().toISOString(),
  };
}

export async function executeImport(
  rows: ParsedRow[],
  onProgress?: ProgressCallback
): Promise<ImportProgress> {
  const supabase = createClient();

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

  for (const row of toImport) {
    const payload = buildPayload(row);
    try {
      if (row.existingId) {
        const { error } = await supabase
          .from('scholarships')
          .update(payload)
          .eq('id', row.existingId);
        if (error) throw error;
        progress.updated++;
      } else {
        const { error } = await supabase.from('scholarships').insert(payload);
        if (error) throw error;
        progress.inserted++;
      }
    } catch (e) {
      progress.errors.push(
        `Row ${row.rowNum} (${row.name_th}): ${e instanceof Error ? e.message : String(e)}`
      );
    }
    progress.done++;
    onProgress?.({ ...progress });
  }

  return progress;
}
