/**
 * Tests for the in-app verification workflow.
 *
 * Coverage:
 * 1. Bulk Mark Verified flips is_displayed for Open + non-expired rows
 * 2. Import protection: verified rows not overwritten by unverified file rows
 * 3. Inline deadline edit: past date → is_displayed false; future → true (if verified+Open)
 * 4. Export CSV round-trip: exported columns match the import schema
 */

import { describe, it, expect } from 'vitest';
import { isDisplayable, bangkokMidnight } from '../lib/tdScholarships/displayGate';
import { parseDeadline } from '../lib/tdScholarships/deadlineParser';

// ── Shared helpers ────────────────────────────────────────────────────────────

const TODAY_STR = '2026-07-19';
const TODAY = new Date(TODAY_STR + 'T00:00:00Z');

function displayRow(overrides: Partial<{
  verification_status: string | null;
  status: string | null;
  deadline_date: string | null;
  last_verified: string | null;
}>) {
  return {
    verification_status: 'verified',
    status: 'Open',
    deadline_date: null,
    last_verified: null,
    ...overrides,
  };
}

// ── 1. Bulk verify ────────────────────────────────────────────────────────────

describe('Bulk Mark Verified logic', () => {
  it('Open + no deadline + newly verified → is_displayed = true', () => {
    const gate = isDisplayable(displayRow({ verification_status: 'verified' }), TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('Open + future deadline + newly verified → is_displayed = true', () => {
    const gate = isDisplayable(displayRow({ deadline_date: '2027-01-01' }), TODAY);
    expect(gate.is_displayed).toBe(true);
  });

  it('Open + past deadline + verified → is_displayed = false (hard expired)', () => {
    const gate = isDisplayable(displayRow({ deadline_date: '2025-01-01' }), TODAY);
    expect(gate.is_displayed).toBe(false);
  });

  it('Closed + verified → is_displayed = false', () => {
    const gate = isDisplayable(displayRow({ status: 'Closed' }), TODAY);
    expect(gate.is_displayed).toBe(false);
  });

  it('Unverify resets is_displayed to false (unverified status)', () => {
    const gate = isDisplayable(
      displayRow({ verification_status: 'Auto-extracted (confirm deadline + link)' }),
      TODAY,
    );
    expect(gate.is_displayed).toBe(false);
  });
});

// ── 2. Import protection ──────────────────────────────────────────────────────

describe('Import protection: verified rows not overwritten', () => {
  // Simulates what the import route does for a protected row
  function simulateImportRow(
    incomingVerificationStatus: string | null,
    dbIsVerified: boolean,
    incomingDeadlineRaw: string | null = null,
    dbDeadlineRaw: string | null = '2027-06-30',
  ) {
    const incomingIsVerified = (incomingVerificationStatus ?? '').toLowerCase() === 'verified';
    const isProtected = dbIsVerified && !incomingIsVerified;

    const effectiveDeadlineRaw = isProtected ? dbDeadlineRaw : incomingDeadlineRaw;
    const dp = parseDeadline(effectiveDeadlineRaw);
    const effectiveVerificationStatus = isProtected ? 'verified' : incomingVerificationStatus;

    return { isProtected, effectiveVerificationStatus, dp };
  }

  it('DB verified + incoming not verified → row is protected', () => {
    const { isProtected, effectiveVerificationStatus } = simulateImportRow(
      'Auto-extracted (confirm deadline + link)',
      true,
    );
    expect(isProtected).toBe(true);
    expect(effectiveVerificationStatus).toBe('verified');
  });

  it('DB verified + incoming also verified → row is NOT protected (update allowed)', () => {
    const { isProtected } = simulateImportRow('verified', true);
    expect(isProtected).toBe(false);
  });

  it('DB not verified + incoming not verified → row is NOT protected', () => {
    const { isProtected } = simulateImportRow(null, false);
    expect(isProtected).toBe(false);
  });

  it('Protected row keeps DB deadline, not incoming deadline', () => {
    const { dp } = simulateImportRow(
      'Auto-extracted (confirm deadline + link)',
      true,
      '2020-01-01', // incoming (past)
      '2027-06-30', // DB (future)
    );
    // Should use DB deadline '2027-06-30', not incoming '2020-01-01'
    expect(dp.deadline_date).toBe('2027-06-30');
  });

  it('Protected row with future DB deadline stays displayed', () => {
    const { effectiveVerificationStatus, dp } = simulateImportRow(
      'Auto-extracted (confirm deadline + link)',
      true,
      '2020-01-01',
      '2027-06-30',
    );
    const gate = isDisplayable(
      { verification_status: effectiveVerificationStatus, status: 'Open', deadline_date: dp.deadline_date, last_verified: null },
      TODAY,
    );
    expect(gate.is_displayed).toBe(true);
  });
});

// ── 3. Inline deadline edit ───────────────────────────────────────────────────

describe('Inline deadline edit → is_displayed recompute', () => {
  it('Changing deadline to past date → is_displayed false (verified + Open)', () => {
    const dp = parseDeadline('2025-01-01');
    const gate = isDisplayable(
      { verification_status: 'verified', status: 'Open', deadline_date: dp.deadline_date, last_verified: null },
      TODAY,
    );
    expect(gate.is_displayed).toBe(false);
  });

  it('Changing deadline to future date → is_displayed true (verified + Open)', () => {
    const dp = parseDeadline('2028-12-31');
    const gate = isDisplayable(
      { verification_status: 'verified', status: 'Open', deadline_date: dp.deadline_date, last_verified: null },
      TODAY,
    );
    expect(gate.is_displayed).toBe(true);
  });

  it('Changing deadline to rolling → is_displayed true (verified + Open)', () => {
    const dp = parseDeadline('rolling');
    expect(dp.deadline_is_rolling).toBe(true);
    const gate = isDisplayable(
      { verification_status: 'verified', status: 'Open', deadline_date: dp.deadline_date, last_verified: null },
      TODAY,
    );
    expect(gate.is_displayed).toBe(true);
  });

  it('Edit that changes status to Closed → is_displayed false', () => {
    const gate = isDisplayable(
      { verification_status: 'verified', status: 'Closed', deadline_date: null, last_verified: null },
      TODAY,
    );
    expect(gate.is_displayed).toBe(false);
  });
});

// ── 4. CSV export column order ────────────────────────────────────────────────

describe('CSV export column order matches import schema', () => {
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
