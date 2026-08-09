/**
 * Integration test: parse a small fixture and assert import report counts
 * under the Status-only display gate.
 *
 * We test the importEngine's row classification logic without hitting Supabase.
 * The server-side upsert is covered by unit tests on the display gate itself.
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
    open_date: null,
    deadline_raw: '2027-06-30',
    deadline_date: null,
    deadline_is_rolling: false,
    deadline_note: null,
    date_confidence: null,
    status: 'Open',
    status_effective: '',
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

describe('td import fixture (Status-only gate)', () => {
  const TODAY = new Date('2026-08-09T00:00:00Z');

  it('Open status + future deadline (no open_date) → is_displayed = true', () => {
    const r = makeRow({ deadline_raw: '2027-06-30' });
    const dp = parseDeadline(r.deadline_raw);
    const gate = isDisplayable({ open_date: r.open_date, deadline_date: dp.deadline_date, status: r.status, last_verified: r.last_verified }, TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('Verification Status no longer gates visibility — "unverified" row with Open status is still shown', () => {
    const r = makeRow({ verification_status: 'Auto-extracted (confirm deadline + link)' });
    const dp = parseDeadline(r.deadline_raw);
    const gate = isDisplayable({ open_date: r.open_date, deadline_date: dp.deadline_date, status: r.status, last_verified: r.last_verified }, TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('Closed status (no dates) → is_displayed = false', () => {
    const r = makeRow({ status: 'Closed', deadline_raw: null });
    const dp = parseDeadline(r.deadline_raw);
    const gate = isDisplayable({ open_date: r.open_date, deadline_date: dp.deadline_date, status: r.status, last_verified: r.last_verified }, TODAY);
    expect(gate.is_displayed).toBe(false);
  });

  it('both open_date and deadline_date present, deadline in the past → is_displayed = false (Closed)', () => {
    const r = makeRow({ open_date: '2025-01-01', deadline_raw: '2025-01-01' });
    const dp = parseDeadline(r.deadline_raw);
    const gate = isDisplayable({ open_date: r.open_date, deadline_date: dp.deadline_date, status: r.status, last_verified: r.last_verified }, TODAY);
    expect(gate.is_displayed).toBe(false);
    expect(gate.status_effective).toBe('Closed');
  });

  it('rolling deadline + sheet status=Open → is_displayed = true', () => {
    const r = makeRow({ deadline_raw: 'Rolling annual (per semester)' });
    const dp = parseDeadline(r.deadline_raw);
    expect(dp.deadline_is_rolling).toBe(true);
    expect(dp.deadline_date).toBeNull();
    const gate = isDisplayable({ open_date: r.open_date, deadline_date: dp.deadline_date, status: r.status, last_verified: r.last_verified }, TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('open_date in the future, deadline far future → Opening Soon, shown', () => {
    const r = makeRow({ open_date: '2026-09-01', deadline_raw: '2026-12-01' });
    const dp = parseDeadline(r.deadline_raw);
    const gate = isDisplayable({ open_date: r.open_date, deadline_date: dp.deadline_date, status: r.status, last_verified: r.last_verified }, TODAY);
    expect(gate.is_displayed).toBe(true);
    expect(gate.status_effective).toBe('Opening Soon');
  });

  it('status arrives blank (e.g. stray formula string) and no dates → hidden', () => {
    const r = makeRow({ status: '', deadline_raw: null });
    const dp = parseDeadline(r.deadline_raw);
    const gate = isDisplayable({ open_date: r.open_date, deadline_date: dp.deadline_date, status: r.status, last_verified: r.last_verified }, TODAY);
    expect(gate.is_displayed).toBe(false);
    expect(gate.status_effective).toBe('');
  });

  it('fixture with 5 rows produces correct inserted/skipped/displayed counts', () => {
    // Simulate what the import engine + Status-only display gate would produce for a batch
    const fixtures: TdImportRow[] = [
      makeRow({ scholarship_id: 'TD-1', action: 'insert' }),                                           // shown (Open)
      makeRow({ scholarship_id: 'TD-2', verification_status: 'unverified', action: 'insert' }),         // shown (verification doesn't gate)
      makeRow({ scholarship_id: 'TD-3', status: 'Closed', deadline_raw: null, action: 'insert' }),      // hidden
      makeRow({ scholarship_id: 'TD-4', open_date: '2025-01-01', deadline_raw: '2025-01-01', action: 'insert' }), // hidden (past)
      makeRow({ scholarship_id: 'TD-5', action: 'skip', skipReason: 'Missing Funder' }),                // skipped
    ];

    const results = fixtures.map(r => {
      if (r.action === 'skip') return { action: 'skip', displayed: false };
      const dp = parseDeadline(r.deadline_raw);
      const gate = isDisplayable({ open_date: r.open_date, deadline_date: dp.deadline_date, status: r.status, last_verified: r.last_verified }, TODAY);
      return { action: r.action, displayed: gate.is_displayed };
    });

    const inserted  = results.filter(r => r.action !== 'skip').length;
    const skipped   = results.filter(r => r.action === 'skip').length;
    const displayed = results.filter(r => r.displayed).length;

    expect(inserted).toBe(4);
    expect(skipped).toBe(1);
    expect(displayed).toBe(2); // TD-1 and TD-2
  });
});
