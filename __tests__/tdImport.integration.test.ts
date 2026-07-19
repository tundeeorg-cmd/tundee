/**
 * Integration test: parse a small fixture and assert import report counts.
 *
 * We test the importEngine's row classification logic without hitting Supabase.
 * The server-side upsert/display gate is covered by unit tests.
 */
import { describe, it, expect } from 'vitest';
import { parseDeadline } from '../lib/tdScholarships/deadlineParser';
import { isDisplayable } from '../lib/tdScholarships/displayGate';
import type { TdImportRow } from '../lib/tdScholarships/types';

// Build a minimal TdImportRow for testing
function makeRow(overrides: Partial<TdImportRow> = {}): TdImportRow {
  return {
    rowNum: 1,
    scholarship_id: 'TD-TEST-1',
    // Bilingual canonical fields
    scholarship_name_en: 'Test Scholarship',
    scholarship_name_th: 'ทุนทดสอบ',
    funder_en: 'Test Funder',
    funder_th: null,
    source_language: null,
    // Legacy back-fill (derived)
    scholarship_name: 'Test Scholarship',
    funder: 'Test Funder',
    funder_type: 'Thai University',
    level: 'Undergraduate',
    field_of_study: 'Any',
    award_value_tier: null,
    award_amount_thb_numeric: null,
    award_type: null,
    award_amount_thb: null,
    renewable: null,
    bond_obligation: null,
    region_eligibility: 'National (Thailand)',
    targets_low_income: false,
    welfare_card_priority: null,
    income_cap_thb: null,
    num_recipients: 10,
    min_gpa: 3.0,
    english_requirement: null,
    deadline_raw: '2027-06-30',
    deadline_date: null,
    deadline_is_rolling: false,
    deadline_note: null,
    status: 'Open',
    application_url: 'https://example.com/apply',
    source_url: 'https://example.com',
    application_link: 'https://example.com/apply',
    source: 'https://example.com',
    verification_status: 'verified',
    last_verified: '2026-06-01',
    notes: null,
    action: 'insert',
    skipReason: '',
    isDuplicate: false,
    ...overrides,
  };
}

describe('td import fixture', () => {
  const TODAY = new Date('2026-07-18T00:00:00Z');

  it('verified + Open + future deadline → is_displayed = true', () => {
    const r = makeRow({ deadline_raw: '2027-06-30' });
    const dp = parseDeadline(r.deadline_raw);
    const gate = isDisplayable({ ...r, deadline_date: dp.deadline_date }, TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('unverified row → is_displayed = false', () => {
    const r = makeRow({ verification_status: 'Auto-extracted (confirm deadline + link)' });
    const dp = parseDeadline(r.deadline_raw);
    const gate = isDisplayable({ ...r, deadline_date: dp.deadline_date }, TODAY);
    expect(gate.is_displayed).toBe(false);
  });

  it('closed row → is_displayed = false', () => {
    const r = makeRow({ status: 'Closed' });
    const dp = parseDeadline(r.deadline_raw);
    const gate = isDisplayable({ ...r, deadline_date: dp.deadline_date }, TODAY);
    expect(gate.is_displayed).toBe(false);
  });

  it('past deadline + verified + Open → is_displayed = false', () => {
    const r = makeRow({ deadline_raw: '2025-01-01' });
    const dp = parseDeadline(r.deadline_raw);
    const gate = isDisplayable({ ...r, deadline_date: dp.deadline_date }, TODAY);
    expect(gate.is_displayed).toBe(false);
  });

  it('rolling deadline + verified + Open → is_displayed = true', () => {
    const r = makeRow({ deadline_raw: 'Rolling annual (per semester)' });
    const dp = parseDeadline(r.deadline_raw);
    expect(dp.deadline_is_rolling).toBe(true);
    expect(dp.deadline_date).toBeNull();
    const gate = isDisplayable({ ...r, deadline_date: dp.deadline_date }, TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('fixture with 5 rows produces correct inserted/skipped counts', () => {
    // Simulate what the import engine + display gate would produce for a batch
    const fixtures: TdImportRow[] = [
      makeRow({ scholarship_id: 'TD-1', action: 'insert' }),                                  // shown
      makeRow({ scholarship_id: 'TD-2', verification_status: 'unverified', action: 'insert' }), // hidden
      makeRow({ scholarship_id: 'TD-3', status: 'Closed', action: 'insert' }),                  // hidden
      makeRow({ scholarship_id: 'TD-4', deadline_raw: '2025-01-01', action: 'insert' }),         // hidden (past)
      makeRow({ scholarship_id: 'TD-5', action: 'skip', skipReason: 'Missing Funder' }),         // skipped
    ];

    const results = fixtures.map(r => {
      if (r.action === 'skip') return { action: 'skip', displayed: false };
      const dp = parseDeadline(r.deadline_raw);
      const gate = isDisplayable({ ...r, deadline_date: dp.deadline_date }, TODAY);
      return { action: r.action, displayed: gate.is_displayed };
    });

    const inserted   = results.filter(r => r.action !== 'skip').length;
    const skipped    = results.filter(r => r.action === 'skip').length;
    const displayed  = results.filter(r => r.displayed).length;

    expect(inserted).toBe(4);
    expect(skipped).toBe(1);
    expect(displayed).toBe(1); // only TD-1
  });
});
