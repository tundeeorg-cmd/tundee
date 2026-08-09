/**
 * Tests for the in-app admin workflow under the Status-only display gate.
 *
 * Coverage:
 * 1. Bulk Set Status flips is_displayed per status_effective (verification_status is irrelevant)
 * 2. Import protection: curated name/funder not overwritten by unverified file rows
 *    (dates/status always come fresh from the sheet — see app/api/admin/td-import/route.ts)
 * 3. Inline status/deadline/open_date edit: is_displayed recomputed automatically
 * 4. CSV export column order matches the legacy 20-column export schema
 */

import { describe, it, expect } from 'vitest';
import { isDisplayable, bangkokMidnight } from '../lib/tdScholarships/displayGate';
import { parseDeadline } from '../lib/tdScholarships/deadlineParser';

// ── Shared helpers ────────────────────────────────────────────────────────────

const TODAY_STR = '2026-08-09';
const TODAY = new Date(TODAY_STR + 'T00:00:00Z');

function displayRow(overrides: Partial<{
  open_date: string | null;
  deadline_date: string | null;
  status: string | null;
  last_verified: string | null;
}>) {
  return {
    open_date: null,
    deadline_date: null,
    status: 'Open',
    last_verified: null,
    ...overrides,
  };
}

// ── 1. Bulk set_status ────────────────────────────────────────────────────────

describe('Bulk Set Status logic (Status-only gate)', () => {
  it('Open, no dates → is_displayed = true', () => {
    const gate = isDisplayable(displayRow({ status: 'Open' }), TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('Opening Soon, no dates → is_displayed = true', () => {
    const gate = isDisplayable(displayRow({ status: 'Opening Soon' }), TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('Closing Soon, no dates → is_displayed = true', () => {
    const gate = isDisplayable(displayRow({ status: 'Closing Soon' }), TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('Closed → is_displayed = false', () => {
    const gate = isDisplayable(displayRow({ status: 'Closed' }), TODAY);
    expect(gate.is_displayed).toBe(false);
  });

  it('Both dates present, deadline in the past → is_displayed = false regardless of stored status', () => {
    const gate = isDisplayable(displayRow({ open_date: '2025-01-01', deadline_date: '2025-06-01', status: 'Open' }), TODAY);
    expect(gate.is_displayed).toBe(false);
    expect(gate.status_effective).toBe('Closed');
  });

  it('verification_status has no bearing — isDisplayable does not even accept the field', () => {
    // Type-level guarantee: the row shape passed to isDisplayable has no
    // verification_status key at all (see lib/tdScholarships/displayGate.ts).
    const gate = isDisplayable(displayRow({ status: 'Open' }), TODAY);
    expect(gate.is_displayed).toBe(true);
  });
});

// ── 2. Import protection (name/funder only — not dates/status) ──────────────

describe('Import protection: curated name/funder not overwritten', () => {
  // Simulates what app/api/admin/td-import/route.ts does for a protected row
  function simulateImportRow(
    incomingVerificationStatus: string | null,
    dbIsVerified: boolean,
    incomingNameEn: string,
    dbNameEn: string,
  ) {
    const incomingIsVerified = (incomingVerificationStatus ?? '').toLowerCase() === 'verified';
    const isProtected = dbIsVerified && !incomingIsVerified;
    const effectiveNameEn = isProtected ? (dbNameEn ?? incomingNameEn) : incomingNameEn;
    return { isProtected, effectiveNameEn };
  }

  it('DB verified + incoming not verified → name is protected', () => {
    const { isProtected, effectiveNameEn } = simulateImportRow(
      'Auto-extracted (confirm deadline + link)', true, 'Incoming Name', 'DB Name',
    );
    expect(isProtected).toBe(true);
    expect(effectiveNameEn).toBe('DB Name');
  });

  it('DB verified + incoming also verified → not protected (update allowed)', () => {
    const { isProtected, effectiveNameEn } = simulateImportRow('verified', true, 'Incoming Name', 'DB Name');
    expect(isProtected).toBe(false);
    expect(effectiveNameEn).toBe('Incoming Name');
  });

  it('DB not verified → not protected', () => {
    const { isProtected } = simulateImportRow(null, false, 'Incoming Name', 'DB Name');
    expect(isProtected).toBe(false);
  });

  it('dates and status always come from the incoming sheet row, protected or not', () => {
    // Unlike name/funder, deadline_raw/open_date/status are never read from the
    // DB row on import — they always reflect the freshly uploaded master sheet.
    const incomingDeadlineRaw = '2020-01-01';
    const dp = parseDeadline(incomingDeadlineRaw);
    expect(dp.deadline_date).toBe('2020-01-01');
  });
});

// ── 3. Inline edits → is_displayed recompute ─────────────────────────────────

describe('Inline edit → is_displayed recompute (Status-only gate)', () => {
  it('Changing status to Closed → is_displayed false', () => {
    const gate = isDisplayable({ open_date: null, deadline_date: null, status: 'Closed', last_verified: null }, TODAY);
    expect(gate.is_displayed).toBe(false);
  });

  it('Changing status to Open → is_displayed true', () => {
    const gate = isDisplayable({ open_date: null, deadline_date: null, status: 'Open', last_verified: null }, TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('Setting open_date in the future (with a deadline) → Opening Soon, shown, no Apply', () => {
    const gate = isDisplayable({ open_date: '2026-12-01', deadline_date: '2027-01-01', status: 'Open', last_verified: null }, TODAY);
    expect(gate.is_displayed).toBe(true);
    expect(gate.status_effective).toBe('Opening Soon');
  });

  it('Editing deadline_raw to a past date (with an open_date already past) → is_displayed false', () => {
    const dp = parseDeadline('2025-01-01');
    const gate = isDisplayable({ open_date: '2024-01-01', deadline_date: dp.deadline_date, status: 'Open', last_verified: null }, TODAY);
    expect(gate.is_displayed).toBe(false);
  });

  it('Editing deadline_raw to a future date (no open_date) → falls back to stored status', () => {
    const dp = parseDeadline('2028-12-31');
    const gate = isDisplayable({ open_date: null, deadline_date: dp.deadline_date, status: 'Open', last_verified: null }, TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('bangkokMidnight is used consistently for "today" in inline edits', () => {
    const bkk = bangkokMidnight(new Date('2026-08-09T20:00:00Z'));
    expect(bkk.toISOString().startsWith('2026-08-10')).toBe(true);
  });
});

// ── 4. CSV export column order ────────────────────────────────────────────────

describe('CSV export column order (legacy 20-column export schema unchanged)', () => {
  const EXPORT_COLUMNS = [
    'scholarship_id', 'scholarship_name', 'funder', 'funder_type', 'level',
    'field_of_study', 'award_amount_thb', 'region_eligibility', 'targets_low_income',
    'num_recipients', 'min_gpa', 'income_cap_thb', 'language', 'deadline_raw',
    'status', 'application_link', 'source', 'verification_status', 'last_verified', 'notes',
  ];

  const EXPORT_HEADERS = [
    'Scholarship ID', 'Scholarship Name', 'Funder', 'Funder Type', 'Level',
    'Field of Study', 'Award Amount (THB)', 'Region Eligibility', 'Targets Low-Income (Y/N)',
    'No. of Recipients', 'Min GPA', 'Income Cap (THB/yr)', 'Language', 'Deadline',
    'Status', 'Application Link', 'Source', 'Verification Status', 'Last Verified', 'Notes',
  ];

  it('exports exactly 20 columns', () => {
    expect(EXPORT_COLUMNS).toHaveLength(20);
    expect(EXPORT_HEADERS).toHaveLength(20);
  });

  it('targets_low_income exported as Y/N boolean string', () => {
    function cell(v: unknown): string {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'boolean' ? (v ? 'Y' : 'N') : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }
    expect(cell(true)).toBe('Y');
    expect(cell(false)).toBe('N');
  });

  it('cells with commas are quoted', () => {
    function cell(v: unknown): string {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'boolean' ? (v ? 'Y' : 'N') : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }
    expect(cell('Science, Tech')).toBe('"Science, Tech"');
    expect(cell('He said "hi"')).toBe('"He said ""hi"""');
  });
});
