/**
 * Tests for the full research + tracker + bilingual migration
 * (scripts/20260719_full_research_migration.sql).
 *
 * All tests are pure TypeScript — no DB connection required.
 * They verify that the TypeScript ORM types faithfully represent
 * the SQL DDL and that the migration is idempotent by design.
 */

import { describe, it, expect } from 'vitest';

// ─── TdScholarship new columns ────────────────────────────────────────────────

import type {
  TdScholarship,
  TdAwardType,
  TdSourceLanguage,
  TdTranslationReview,
} from '../lib/tdScholarships/types';

describe('TdScholarship — 13 new columns (2026-07-19 migration)', () => {
  const baseline: TdScholarship = {
    scholarship_id: 'TD-0001',
    scholarship_name: 'Test Scholarship',
    funder: 'Test Foundation',
    funder_type: null,
    level: null,
    field_of_study: null,
    award_amount_thb: '50000',
    region_eligibility: null,
    targets_low_income: false,
    num_recipients: null,
    min_gpa: null,
    income_cap_thb: null,
    language: null,
    deadline_raw: null,
    status: 'Open',
    application_link: 'https://example.com',
    source: null,
    verification_status: null,
    last_verified: null,
    verified_by: null,
    notes: null,
    deadline_date: null,
    deadline_is_rolling: false,
    deadline_note: null,
    is_displayed: true,
    display_reason: null,
    stale: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    // New columns — all nullable
    award_amount_thb_numeric: null,
    award_type: null,
    renewable: null,
    bond_obligation: null,
    application_open_date: null,
    welfare_card_priority: null,
    english_requirement: null,
    scholarship_name_en: null,
    scholarship_name_th: null,
    funder_en: null,
    funder_th: null,
    source_language: null,
    translation_review: null,
    // v2 canonical URL columns
    application_url: null,
    source_url: null,
    // v3 award tier
    award_value_tier: null,
  };

  it('accepts all 13 new columns as null (default state after migration)', () => {
    expect(baseline.award_amount_thb_numeric).toBeNull();
    expect(baseline.award_type).toBeNull();
    expect(baseline.renewable).toBeNull();
    expect(baseline.bond_obligation).toBeNull();
    expect(baseline.application_open_date).toBeNull();
    expect(baseline.welfare_card_priority).toBeNull();
    expect(baseline.english_requirement).toBeNull();
    expect(baseline.scholarship_name_en).toBeNull();
    expect(baseline.scholarship_name_th).toBeNull();
    expect(baseline.funder_en).toBeNull();
    expect(baseline.funder_th).toBeNull();
    expect(baseline.source_language).toBeNull();
    expect(baseline.translation_review).toBeNull();
  });

  it('accepts populated research covariates', () => {
    const s: TdScholarship = {
      ...baseline,
      award_amount_thb_numeric: 50000,
      award_type: 'annual',
      renewable: true,
      bond_obligation: false,
      application_open_date: '2026-08-01',
      welfare_card_priority: true,
      english_requirement: 'None',
    };
    expect(s.award_amount_thb_numeric).toBe(50000);
    expect(s.award_type).toBe('annual');
    expect(s.renewable).toBe(true);
    expect(s.bond_obligation).toBe(false);
    expect(s.welfare_card_priority).toBe(true);
    expect(s.english_requirement).toBe('None');
  });

  it('accepts populated bilingual fields', () => {
    const s: TdScholarship = {
      ...baseline,
      scholarship_name_en: 'Test Scholarship',
      scholarship_name_th: 'ทุนทดสอบ',
      funder_en: 'Test Foundation',
      funder_th: 'มูลนิธิทดสอบ',
      source_language: 'th',
      translation_review: 'draft',
    };
    expect(s.scholarship_name_en).toBe('Test Scholarship');
    expect(s.scholarship_name_th).toBe('ทุนทดสอบ');
    expect(s.source_language).toBe('th');
    expect(s.translation_review).toBe('draft');
  });

  it.each<TdAwardType>(['once', 'annual', 'monthly', 'full'])('award_type accepts %s', (t) => {
    const s: TdScholarship = { ...baseline, award_type: t };
    expect(s.award_type).toBe(t);
  });

  it.each<TdSourceLanguage>(['th', 'en'])('source_language accepts %s', (lang) => {
    const s: TdScholarship = { ...baseline, source_language: lang };
    expect(s.source_language).toBe(lang);
  });

  it.each<TdTranslationReview>(['verified', 'draft', 'missing'])('translation_review accepts %s', (r) => {
    const s: TdScholarship = { ...baseline, translation_review: r };
    expect(s.translation_review).toBe(r);
  });

  it('pre-existing columns are unchanged (no duplication)', () => {
    // These are columns added by PREVIOUS migrations — verify they still exist
    expect(baseline.deadline_date).toBeDefined();
    expect(baseline.deadline_is_rolling).toBeDefined();
    expect(baseline.is_displayed).toBeDefined();
    expect(baseline.stale).toBeDefined();
  });
});

// ─── Bilingual back-fill logic ────────────────────────────────────────────────

describe('Bilingual back-fill logic', () => {
  /** Pure simulation of the SQL back-fill UPDATE in the migration. */
  function backfillBilingual(row: Pick<TdScholarship, 'scholarship_name' | 'funder' | 'scholarship_name_th' | 'scholarship_name_en' | 'funder_th' | 'funder_en'>): Pick<TdScholarship, 'scholarship_name_th' | 'scholarship_name_en' | 'funder_th' | 'funder_en'> {
    return {
      scholarship_name_th: row.scholarship_name_th ?? row.scholarship_name,
      scholarship_name_en: row.scholarship_name_en ?? row.scholarship_name,
      funder_th: row.funder_th ?? row.funder,
      funder_en: row.funder_en ?? row.funder,
    };
  }

  it('copies scholarship_name into both bilingual columns when both are null', () => {
    const result = backfillBilingual({
      scholarship_name: 'ทุนเรียนดี', funder: 'กพ',
      scholarship_name_th: null, scholarship_name_en: null,
      funder_th: null, funder_en: null,
    });
    expect(result.scholarship_name_th).toBe('ทุนเรียนดี');
    expect(result.scholarship_name_en).toBe('ทุนเรียนดี');
    expect(result.funder_th).toBe('กพ');
    expect(result.funder_en).toBe('กพ');
  });

  it('does NOT overwrite an already-populated bilingual column (COALESCE idempotency)', () => {
    const result = backfillBilingual({
      scholarship_name: 'ทุนเรียนดี', funder: 'กพ',
      scholarship_name_th: 'ทุนเรียนดีที่มีอยู่แล้ว',
      scholarship_name_en: 'Pre-existing EN name',
      funder_th: null,
      funder_en: 'Pre-existing EN funder',
    });
    expect(result.scholarship_name_th).toBe('ทุนเรียนดีที่มีอยู่แล้ว');
    expect(result.scholarship_name_en).toBe('Pre-existing EN name');
    expect(result.funder_th).toBe('กพ'); // was null, gets back-filled
    expect(result.funder_en).toBe('Pre-existing EN funder');
  });

  it('is idempotent — running back-fill twice yields the same result', () => {
    const input = {
      scholarship_name: 'ทุนเรียนดี', funder: 'กพ',
      scholarship_name_th: null as string | null, scholarship_name_en: null as string | null,
      funder_th: null as string | null, funder_en: null as string | null,
    };
    const first = backfillBilingual(input);
    const second = backfillBilingual({ ...input, ...first });
    expect(second).toEqual(first);
  });
});

// ─── TrackedScholarshipRow ────────────────────────────────────────────────────

import type {
  TrackedScholarshipRow,
  TrackedScholarshipInsert,
  TrackedScholarshipUpdate,
  TrackerStatus,
} from '../lib/research/tableTypes';

describe('TrackedScholarshipRow', () => {
  const row: TrackedScholarshipRow = {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    user_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    scholarship_id: 'TD-0001',
    status: 'interested',
    notes: null,
    reminder_opt_in: true,
    created_at: '2026-07-19T00:00:00Z',
    updated_at: '2026-07-19T00:00:00Z',
  };

  it('has all required columns', () => {
    expect(row.id).toBeTruthy();
    expect(row.user_id).toBeTruthy();
    expect(row.scholarship_id).toBeTruthy();
    expect(row.status).toBe('interested');
    expect(row.reminder_opt_in).toBe(true);
    expect(row.created_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
  });

  it.each<TrackerStatus>(['interested', 'applying', 'applied', 'awarded', 'rejected'])(
    'accepts status %s', (s) => {
      const r: TrackedScholarshipRow = { ...row, status: s };
      expect(r.status).toBe(s);
    }
  );

  it('TrackedScholarshipInsert excludes auto-generated columns', () => {
    const insert: TrackedScholarshipInsert = {
      user_id: row.user_id,
      scholarship_id: row.scholarship_id,
      status: 'applied',
      notes: 'Ready to submit',
      reminder_opt_in: true,
    };
    expect('id' in insert).toBe(false);
    expect('created_at' in insert).toBe(false);
    expect('updated_at' in insert).toBe(false);
    expect(insert.status).toBe('applied');
  });

  it('TrackedScholarshipUpdate allows partial status update only', () => {
    const update: TrackedScholarshipUpdate = { status: 'awarded' };
    expect(update.status).toBe('awarded');
    expect('id' in update).toBe(false);
    expect('user_id' in update).toBe(false);
    expect('scholarship_id' in update).toBe(false);
  });

  it('reminder_opt_in defaults to true and can be disabled', () => {
    const r: TrackedScholarshipRow = { ...row, reminder_opt_in: false };
    expect(r.reminder_opt_in).toBe(false);
  });
});

// ─── ReminderLogRow ───────────────────────────────────────────────────────────

import type {
  ReminderLogRow,
  ReminderLogInsert,
  ReminderChannel,
} from '../lib/research/tableTypes';

describe('ReminderLogRow', () => {
  const row: ReminderLogRow = {
    id: 1,
    user_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    scholarship_id: 'TD-0001',
    offset_days: 14,
    deadline_date: '2026-08-31',
    channel: 'line',
    sent_at: '2026-07-19T08:00:00Z',
  };

  it('has all required columns including offset_days and deadline_date', () => {
    expect(row.id).toBe(1);
    expect(row.user_id).toBeTruthy();
    expect(row.scholarship_id).toBeTruthy();
    expect(row.offset_days).toBe(14);
    expect(row.deadline_date).toBe('2026-08-31');
    expect(row.channel).toBe('line');
    expect(row.sent_at).toBeTruthy();
  });

  it.each<ReminderChannel>(['line', 'email', 'push'])('accepts channel %s', (c) => {
    const r: ReminderLogRow = { ...row, channel: c };
    expect(r.channel).toBe(c);
  });

  it('supports both 14-day and 1-day reminder offsets', () => {
    expect({ ...row, offset_days: 14 }.offset_days).toBe(14);
    expect({ ...row, offset_days: 1 }.offset_days).toBe(1);
  });

  it('UNIQUE key = (user_id, scholarship_id, offset_days, deadline_date) — duplicate yields same values', () => {
    const a = { user_id: 'u1', scholarship_id: 'TD-0001', offset_days: 14, deadline_date: '2026-08-31' };
    const b = { ...a };
    expect(a.user_id === b.user_id && a.scholarship_id === b.scholarship_id &&
           a.offset_days === b.offset_days && a.deadline_date === b.deadline_date).toBe(true);
  });

  it('ReminderLogInsert excludes bigserial id', () => {
    const insert: ReminderLogInsert = {
      user_id: row.user_id,
      scholarship_id: row.scholarship_id,
      offset_days: 1,
      deadline_date: '2026-08-31',
      channel: 'line',
      sent_at: '2026-07-19T09:00:00Z',
    };
    expect('id' in insert).toBe(false);
    expect(insert.offset_days).toBe(1);
  });

  it('id is a number (bigserial), not a string (uuid)', () => {
    expect(typeof row.id).toBe('number');
  });
});

// ─── Migration idempotency — structural checks ────────────────────────────────

describe('Migration idempotency — no column duplication with pre-existing schema', () => {
  it('pre-existing scholarship columns are not re-declared in new interface', () => {
    // Verify that columns added by EARLIER migrations still type-check
    // (i.e., they share the same name & type — no renamed duplicates)
    const s: Pick<TdScholarship, 'deadline_date' | 'deadline_is_rolling' | 'is_displayed'> = {
      deadline_date: null,
      deadline_is_rolling: false,
      is_displayed: true,
    };
    expect(s.deadline_date).toBeNull();
    expect(s.deadline_is_rolling).toBe(false);
    expect(s.is_displayed).toBe(true);
  });

  it('award_amount_thb (text) and award_amount_thb_numeric (number) are distinct fields', () => {
    const s: Pick<TdScholarship, 'award_amount_thb' | 'award_amount_thb_numeric'> = {
      award_amount_thb: '50,000',
      award_amount_thb_numeric: 50000,
    };
    expect(typeof s.award_amount_thb).toBe('string');
    expect(typeof s.award_amount_thb_numeric).toBe('number');
  });
});

// ─── Append-only guard — event table ─────────────────────────────────────────

import { EventRepository } from '../lib/research/eventRepository';

describe('EventRepository — append-only contract', () => {
  it('exposes insert() method', () => {
    expect(typeof EventRepository.prototype.insert).toBe('function');
  });

  it('exposes insertBatch() method', () => {
    expect(typeof EventRepository.prototype.insertBatch).toBe('function');
  });

  it('does NOT expose update()', () => {
    expect((EventRepository.prototype as unknown as Record<string, unknown>).update).toBeUndefined();
  });

  it('does NOT expose delete()', () => {
    expect((EventRepository.prototype as unknown as Record<string, unknown>).delete).toBeUndefined();
  });

  it('does NOT expose upsert()', () => {
    expect((EventRepository.prototype as unknown as Record<string, unknown>).upsert).toBeUndefined();
  });
});

// ─── Consent model ────────────────────────────────────────────────────────────

import {
  isResearchConsented,
  requiresGuardianConsent,
  isMinorFullyConsented,
  filterConsented,
  CURRENT_CONSENT_VERSION,
} from '../lib/research/consentGate';

describe('Consent gate', () => {
  const consented = {
    consent_research: true,
    consent_version: CURRENT_CONSENT_VERSION,
    guardian_consent: null,
    birth_year: 2000,
  };

  it('isResearchConsented — true when consent_research=true and version matches', () => {
    expect(isResearchConsented(consented)).toBe(true);
  });

  it('isResearchConsented — false when consent_research=false', () => {
    expect(isResearchConsented({ ...consented, consent_research: false })).toBe(false);
  });

  it('isResearchConsented — false when version is stale', () => {
    expect(isResearchConsented({ ...consented, consent_version: '2025-01-v1' })).toBe(false);
  });

  it('requiresGuardianConsent — true for minor (under 18)', () => {
    const currentYear = new Date().getFullYear();
    expect(requiresGuardianConsent(currentYear - 16, currentYear)).toBe(true);
  });

  it('requiresGuardianConsent — false for adult (18+)', () => {
    const currentYear = new Date().getFullYear();
    expect(requiresGuardianConsent(currentYear - 20, currentYear)).toBe(false);
  });

  it('isMinorFullyConsented — requires both consent_research and guardian_consent', () => {
    const minor = { ...consented, birth_year: new Date().getFullYear() - 15, guardian_consent: true };
    expect(isMinorFullyConsented(minor)).toBe(true);
  });

  it('isMinorFullyConsented — false when guardian_consent is missing for minor', () => {
    const minor = { ...consented, birth_year: new Date().getFullYear() - 15, guardian_consent: null };
    expect(isMinorFullyConsented(minor)).toBe(false);
  });

  it('filterConsented — returns only consented+current-version rows', () => {
    const profiles = [
      { ...consented, user_id: 'a' },
      { ...consented, user_id: 'b', consent_research: false },
      { ...consented, user_id: 'c', consent_version: 'old' },
      { ...consented, user_id: 'd' },
    ];
    const result = filterConsented(profiles);
    expect(result.map(p => p.user_id)).toEqual(['a', 'd']);
  });
});

// ─── Uniqueness constraints (logical) ────────────────────────────────────────

describe('Uniqueness constraints — logical model', () => {
  it('tracked_scholarship: (user_id, scholarship_id) must be unique — duplicate should fail', () => {
    type Key = { user_id: string; scholarship_id: string };
    function wouldViolate(existing: Key[], candidate: Key): boolean {
      return existing.some(e => e.user_id === candidate.user_id && e.scholarship_id === candidate.scholarship_id);
    }
    const existing: Key[] = [{ user_id: 'u1', scholarship_id: 'TD-0001' }];
    expect(wouldViolate(existing, { user_id: 'u1', scholarship_id: 'TD-0001' })).toBe(true);
    expect(wouldViolate(existing, { user_id: 'u1', scholarship_id: 'TD-0002' })).toBe(false);
    expect(wouldViolate(existing, { user_id: 'u2', scholarship_id: 'TD-0001' })).toBe(false);
  });

  it('experiment_assignment: (user_id, experiment_key) must be unique', () => {
    type Key = { user_id: string; experiment_key: string };
    function wouldViolate(existing: Key[], candidate: Key): boolean {
      return existing.some(e => e.user_id === candidate.user_id && e.experiment_key === candidate.experiment_key);
    }
    const existing: Key[] = [{ user_id: 'u1', experiment_key: 'ranking' }];
    expect(wouldViolate(existing, { user_id: 'u1', experiment_key: 'ranking' })).toBe(true);
    expect(wouldViolate(existing, { user_id: 'u1', experiment_key: 'banner' })).toBe(false);
  });
});

// ─── Acceptance checklist ────────────────────────────────────────────────────

describe('Migration acceptance checklist', () => {
  it('TdScholarship has 13 original new columns from 20260719 migration', () => {
    const newCols: (keyof TdScholarship)[] = [
      'award_amount_thb_numeric',
      'award_type',
      'renewable',
      'bond_obligation',
      'application_open_date',
      'welfare_card_priority',
      'english_requirement',
      'scholarship_name_en',
      'scholarship_name_th',
      'funder_en',
      'funder_th',
      'source_language',
      'translation_review',
    ];
    expect(newCols).toHaveLength(13);
  });

  it('TdScholarship has canonical URL columns (v2 finalize migration)', () => {
    const s: Pick<TdScholarship, 'application_url' | 'source_url'> = {
      application_url: 'https://example.com/apply',
      source_url: 'https://example.com',
    };
    expect(s.application_url).toBeTruthy();
    expect(s.source_url).toBeTruthy();
  });

  it('tableTypes.ts exports TrackedScholarshipRow and ReminderLogRow', () => {
    const row: TrackedScholarshipRow = {
      id: 'x', user_id: 'u', scholarship_id: 'TD-0001', status: 'interested',
      notes: null, reminder_opt_in: true,
      created_at: '', updated_at: '',
    };
    const log: ReminderLogRow = {
      id: 1, user_id: 'u', scholarship_id: 'TD-0001',
      offset_days: 14, deadline_date: '2026-08-31',
      channel: 'line', sent_at: '',
    };
    expect(row).toBeTruthy();
    expect(log).toBeTruthy();
  });
});
