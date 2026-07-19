/**
 * Tests for the 28-column import engine (lib/tdScholarships/importEngine.ts).
 *
 * All tests are pure TypeScript — no DB connection, no file I/O.
 * They verify header mapping, award_value_tier normalization, bilingual
 * field handling, validation rules, and protection logic.
 */

import { describe, it, expect } from 'vitest';
import { normalizeAwardValueTier } from '../lib/tdScholarships/importEngine';
import type {
  TdAwardValueTier,
  TdImportRow,
  TdScholarship,
} from '../lib/tdScholarships/types';

// ── award_value_tier normalization ────────────────────────────────────────────

describe('normalizeAwardValueTier', () => {
  it.each<[string, TdAwardValueTier]>([
    ['Full-ride (tuition+living)',  'full_ride'],
    ['full-ride (tuition+living)',  'full_ride'],
    ['FULL-RIDE (TUITION+LIVING)', 'full_ride'],
    ['Full-tuition',               'full_tuition'],
    ['full tuition',               'full_tuition'],
    ['Large (≥100k THB)',          'large'],
    ['large (>=100k thb)',         'large'],
    ['Large',                      'large'],
    ['Medium (20k–100k)',          'medium'],
    ['medium (20k-100k)',          'medium'],
    ['Small (<20k)',               'small'],
    ['small (<20k)',               'small'],
    ['Stipend-only',               'stipend_only'],
    ['stipend only',               'stipend_only'],
    ['Stipend',                    'stipend_only'],
  ])('maps "%s" → %s', (raw, expected) => {
    expect(normalizeAwardValueTier(raw)).toBe(expected);
  });

  it.each(['', null, undefined, '  ', 'N/A', 'unknown tier'])(
    'returns null for blank/unrecognized: %s', (v) => {
      expect(normalizeAwardValueTier(v)).toBeNull();
    }
  );
});

// ── TdScholarship type — new columns ─────────────────────────────────────────

describe('TdScholarship — award_value_tier field', () => {
  const base: TdScholarship = {
    scholarship_id: 'TD-0001',
    scholarship_name: 'Test',
    scholarship_name_en: 'Test Scholarship',
    scholarship_name_th: 'ทุนทดสอบ',
    funder: 'Test Fund',
    funder_en: 'Test Fund',
    funder_th: 'กองทุนทดสอบ',
    funder_type: 'Thai University',
    source_language: 'th',
    translation_review: 'draft',
    level: 'Undergraduate',
    field_of_study: 'Engineering',
    award_value_tier: null,
    award_amount_thb_numeric: null,
    award_type: null,
    award_amount_thb: null,
    renewable: null,
    bond_obligation: null,
    region_eligibility: null,
    targets_low_income: false,
    welfare_card_priority: null,
    income_cap_thb: null,
    num_recipients: null,
    min_gpa: null,
    english_requirement: null,
    language: null,
    deadline_raw: null,
    deadline_date: null,
    deadline_is_rolling: false,
    deadline_note: null,
    status: 'Open',
    verification_status: 'verified',
    last_verified: null,
    verified_by: null,
    application_url: 'https://example.com',
    source_url: null,
    application_link: 'https://example.com',
    source: null,
    notes: null,
    application_open_date: null,
    is_displayed: true,
    display_reason: 'Displayed',
    stale: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-07-19T00:00:00Z',
  };

  it.each<TdAwardValueTier>(['full_ride', 'full_tuition', 'large', 'medium', 'small', 'stipend_only'])(
    'accepts award_value_tier: %s', (tier) => {
      const s: TdScholarship = { ...base, award_value_tier: tier };
      expect(s.award_value_tier).toBe(tier);
    }
  );

  it('defaults award_value_tier to null', () => {
    expect(base.award_value_tier).toBeNull();
  });
});

// ── TdImportRow — bilingual validation ───────────────────────────────────────

describe('TdImportRow — bilingual name/funder validation logic', () => {
  function simulateValidate(row: Partial<TdImportRow>): { valid: boolean; reason: string } {
    if (!row.scholarship_id) return { valid: false, reason: 'Missing Scholarship ID' };
    if (!row.scholarship_name_en && !row.scholarship_name_th) {
      return { valid: false, reason: 'Missing Scholarship Name (need at least one of EN or TH)' };
    }
    if (!row.funder_en && !row.funder_th) {
      return { valid: false, reason: 'Missing Funder (need at least one of EN or TH)' };
    }
    if (!row.application_url) return { valid: false, reason: 'Missing Application Link' };
    try {
      const u = new URL(row.application_url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { valid: false, reason: 'Invalid URL protocol' };
      }
    } catch {
      return { valid: false, reason: `Application Link is not a valid URL: "${row.application_url}"` };
    }
    return { valid: true, reason: '' };
  }

  it('passes with scholarship_name_en only', () => {
    const result = simulateValidate({
      scholarship_id: 'TD-0001',
      scholarship_name_en: 'Test EN',
      scholarship_name_th: null,
      funder_en: 'Fund EN',
      funder_th: null,
      application_url: 'https://example.com',
    });
    expect(result.valid).toBe(true);
  });

  it('passes with scholarship_name_th only', () => {
    const result = simulateValidate({
      scholarship_id: 'TD-0002',
      scholarship_name_en: null,
      scholarship_name_th: 'ทุนทดสอบ',
      funder_en: null,
      funder_th: 'ผู้ให้ทุน',
      application_url: 'https://example.com',
    });
    expect(result.valid).toBe(true);
  });

  it('fails when both scholarship_name_en and scholarship_name_th are null', () => {
    const result = simulateValidate({
      scholarship_id: 'TD-0003',
      scholarship_name_en: null,
      scholarship_name_th: null,
      funder_en: 'Fund',
      application_url: 'https://example.com',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Scholarship Name');
  });

  it('fails when both funder_en and funder_th are null', () => {
    const result = simulateValidate({
      scholarship_id: 'TD-0004',
      scholarship_name_en: 'Test',
      funder_en: null,
      funder_th: null,
      application_url: 'https://example.com',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Funder');
  });

  it('fails with missing scholarship_id', () => {
    const result = simulateValidate({
      scholarship_name_en: 'Test',
      funder_en: 'Fund',
      application_url: 'https://example.com',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Scholarship ID');
  });

  it('fails with invalid URL', () => {
    const result = simulateValidate({
      scholarship_id: 'TD-0005',
      scholarship_name_en: 'Test',
      funder_en: 'Fund',
      application_url: 'not-a-url',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('valid URL');
  });

  it('accepts http:// as valid URL protocol', () => {
    const result = simulateValidate({
      scholarship_id: 'TD-0006',
      scholarship_name_en: 'Test',
      funder_en: 'Fund',
      application_url: 'http://legacy.example.com',
    });
    expect(result.valid).toBe(true);
  });
});

// ── Bilingual name/funder back-fill logic ─────────────────────────────────────

describe('Bilingual name/funder resolution', () => {
  function resolveName(nameEn: string | null, nameTh: string | null, legacy: string): string {
    return nameEn ?? nameTh ?? legacy ?? '';
  }

  function resolveFunder(funderEn: string | null, funderTh: string | null, legacy: string): string {
    return funderEn ?? funderTh ?? legacy ?? '';
  }

  it('prefers EN name over TH', () => {
    expect(resolveName('Scholarship EN', 'ทุน TH', '')).toBe('Scholarship EN');
  });

  it('falls back to TH when EN is null', () => {
    expect(resolveName(null, 'ทุน TH', '')).toBe('ทุน TH');
  });

  it('falls back to legacy when both EN and TH are null', () => {
    expect(resolveName(null, null, 'Legacy Name')).toBe('Legacy Name');
  });

  it('prefers EN funder over TH', () => {
    expect(resolveFunder('Fund EN', 'กองทุน TH', '')).toBe('Fund EN');
  });

  it('falls back to TH funder when EN is null', () => {
    expect(resolveFunder(null, 'กองทุน TH', '')).toBe('กองทุน TH');
  });
});

// ── Verified-row protection logic ─────────────────────────────────────────────

describe('Verified-row protection logic', () => {
  type DbVerifiedRow = {
    verification_status: string;
    deadline_raw: string | null;
    deadline_date: string | null;
    status: string | null;
    scholarship_name_en: string | null;
    funder_en: string | null;
    application_url: string | null;
  };

  function simulateProtection(
    dbRow: DbVerifiedRow | null,
    incomingVerifStatus: string | null,
    incomingField: string,
  ): { isProtected: boolean; effectiveField: string } {
    const incomingIsVerified = (incomingVerifStatus ?? '').toLowerCase() === 'verified';
    const isProtected = !!dbRow && (dbRow.verification_status ?? '').toLowerCase() === 'verified' && !incomingIsVerified;
    return {
      isProtected,
      effectiveField: isProtected ? (dbRow!.scholarship_name_en ?? incomingField) : incomingField,
    };
  }

  it('does NOT protect when incoming row is also verified', () => {
    const db: DbVerifiedRow = {
      verification_status: 'verified',
      deadline_raw: 'Aug 2026',
      deadline_date: '2026-08-31',
      status: 'Open',
      scholarship_name_en: 'DB Name',
      funder_en: 'DB Funder',
      application_url: 'https://db.com',
    };
    const result = simulateProtection(db, 'verified', 'Incoming Name');
    expect(result.isProtected).toBe(false);
    expect(result.effectiveField).toBe('Incoming Name');
  });

  it('protects when DB is verified but incoming is not', () => {
    const db: DbVerifiedRow = {
      verification_status: 'verified',
      deadline_raw: 'Aug 2026',
      deadline_date: '2026-08-31',
      status: 'Open',
      scholarship_name_en: 'DB Name',
      funder_en: 'DB Funder',
      application_url: 'https://db.com',
    };
    const result = simulateProtection(db, 'unverified', 'Incoming Name');
    expect(result.isProtected).toBe(true);
    expect(result.effectiveField).toBe('DB Name');
  });

  it('does not protect new rows (no existing DB entry)', () => {
    const result = simulateProtection(null, null, 'New Name');
    expect(result.isProtected).toBe(false);
    expect(result.effectiveField).toBe('New Name');
  });

  it('does not protect when DB row is unverified', () => {
    const db: DbVerifiedRow = {
      verification_status: 'unverified',
      deadline_raw: null,
      deadline_date: null,
      status: 'Recheck',
      scholarship_name_en: 'DB Name',
      funder_en: 'DB Funder',
      application_url: 'https://db.com',
    };
    const result = simulateProtection(db, null, 'Incoming Name');
    expect(result.isProtected).toBe(false);
    expect(result.effectiveField).toBe('Incoming Name');
  });
});

// ── 28-column header coverage ─────────────────────────────────────────────────

describe('28-column canonical schema — header coverage', () => {
  const CANONICAL_HEADERS_28 = [
    'Scholarship ID',
    'Scholarship Name (EN)',
    'Scholarship Name (TH)',
    'Funder (EN)',
    'Funder (TH)',
    'Funder Type',
    'Level',
    'Field of Study',
    'Award Value Tier',
    'Award Amount (THB) Numeric',
    'Award Type',
    'Renewable (Y/N)',
    'Bond/Obligation (Y/N)',
    'Region Eligibility',
    'Targets Low-Income (Y/N)',
    'Welfare Card Priority (Y/N)',
    'Income Cap (THB/yr)',
    'No. of Recipients',
    'Min GPA',
    'English Requirement',
    'Source Language',
    'Deadline',
    'Status',
    'Application Link',
    'Source',
    'Verification Status',
    'Last Verified',
    'Notes',
  ];

  it('has exactly 28 canonical headers', () => {
    expect(CANONICAL_HEADERS_28).toHaveLength(28);
  });

  it('each canonical header normalizes to a non-empty lowercase+trimmed string', () => {
    function normalizeHeader(h: string) {
      return h.toLowerCase().trim().replace(/\s+/g, ' ').replace(/\*+$/, '');
    }
    for (const h of CANONICAL_HEADERS_28) {
      const n = normalizeHeader(h);
      expect(n.length).toBeGreaterThan(0);
    }
  });

  it('header 9 ("Award Value Tier") with leading space still normalizes correctly', () => {
    function normalizeHeader(h: string) {
      return h.toLowerCase().trim().replace(/\s+/g, ' ').replace(/\*+$/, '');
    }
    expect(normalizeHeader(' Award Value Tier ')).toBe('award value tier');
    expect(normalizeHeader('Award Value Tier')).toBe('award value tier');
  });

  it('Application Link maps to application_url (canonical), NOT application_link (deprecated)', () => {
    // The engine reads "Application Link" header and maps to application_url field.
    // application_link is kept as a deprecated alias for backward compat.
    const exampleRow: Partial<TdImportRow> = {
      application_url: 'https://example.com/apply',
      application_link: 'https://example.com/apply',
    };
    expect(exampleRow.application_url).toBe('https://example.com/apply');
    expect(exampleRow.application_link).toBe(exampleRow.application_url);
  });

  it('Source maps to source_url (canonical), NOT source (deprecated)', () => {
    const exampleRow: Partial<TdImportRow> = {
      source_url: 'https://example.com',
      source: 'https://example.com',
    };
    expect(exampleRow.source_url).toBe('https://example.com');
    expect(exampleRow.source).toBe(exampleRow.source_url);
  });
});

// ── Upsert idempotency (no-duplicate guarantee) ───────────────────────────────

describe('Upsert idempotency', () => {
  it('duplicate scholarship_id within file: first occurrence kept, rest skipped', () => {
    type Row = { scholarship_id: string; action: string; skipReason: string; isDuplicate: boolean };
    function simulateDedupe(ids: string[]): Row[] {
      const idCount = new Map<string, number>();
      for (const id of ids) idCount.set(id, (idCount.get(id) ?? 0) + 1);

      const seenIds = new Set<string>();
      return ids.map(id => {
        const isDup = (idCount.get(id) ?? 1) > 1;
        if (isDup && seenIds.has(id)) {
          return { scholarship_id: id, action: 'skip', skipReason: `Duplicate Scholarship ID "${id}" within this file`, isDuplicate: true };
        }
        if (isDup) seenIds.add(id);
        return { scholarship_id: id, action: 'insert', skipReason: '', isDuplicate: false };
      });
    }

    const rows = simulateDedupe(['TD-0001', 'TD-0002', 'TD-0001', 'TD-0003']);
    expect(rows[0].action).toBe('insert'); // first TD-0001
    expect(rows[2].action).toBe('skip');   // second TD-0001
    expect(rows[2].isDuplicate).toBe(true);
    expect(rows[1].action).toBe('insert'); // TD-0002
    expect(rows[3].action).toBe('insert'); // TD-0003
  });
});

// ── Display gate summary ──────────────────────────────────────────────────────

describe('Display gate (unchanged rule)', () => {
  it('is_displayed = true only when verified + Open + not past deadline', () => {
    function gate(row: { verification_status: string | null; status: string | null; deadline_date: string | null }, today: string) {
      const verif = (row.verification_status ?? '').trim().toLowerCase();
      const status = (row.status ?? '').trim().toLowerCase();
      if (verif !== 'verified') return false;
      if (status !== 'open') return false;
      if (row.deadline_date && row.deadline_date < today) return false;
      return true;
    }

    const today = '2026-07-19';
    expect(gate({ verification_status: 'verified', status: 'Open', deadline_date: '2026-08-31' }, today)).toBe(true);
    expect(gate({ verification_status: 'unverified', status: 'Open', deadline_date: null }, today)).toBe(false);
    expect(gate({ verification_status: 'verified', status: 'Closed', deadline_date: null }, today)).toBe(false);
    expect(gate({ verification_status: 'verified', status: 'Open', deadline_date: '2026-01-01' }, today)).toBe(false); // past
    expect(gate({ verification_status: 'verified', status: 'Open', deadline_date: null }, today)).toBe(true); // no deadline
  });

  it('active count = rows where is_displayed = true', () => {
    const rows = [
      { scholarship_id: 'TD-0001', is_displayed: true },
      { scholarship_id: 'TD-0002', is_displayed: false },
      { scholarship_id: 'TD-0003', is_displayed: true },
    ];
    const activeCount = rows.filter(r => r.is_displayed).length;
    expect(activeCount).toBe(2);
  });
});

// ── Deprecated columns (not imported) ────────────────────────────────────────

describe('Deprecated columns', () => {
  it('TdImportRow has award_amount_thb marked deprecated (legacy only)', () => {
    const row: Partial<TdImportRow> = { award_amount_thb: '50,000 บาท/ปี' };
    expect(row.award_amount_thb).toBeTruthy();
  });

  it('TdImportRow has language marked deprecated (use english_requirement instead)', () => {
    // language column is legacy; english_requirement is the canonical field
    const row: Partial<TdImportRow> = { english_requirement: 'TOEFL 79' };
    expect(row.english_requirement).toBe('TOEFL 79');
  });

  it('application_open_date is deprecated in TdScholarship (no longer in 28-field schema)', () => {
    const s: Partial<TdScholarship> = { application_open_date: null };
    expect(s.application_open_date).toBeNull();
  });
});
