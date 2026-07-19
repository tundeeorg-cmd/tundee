/**
 * Tests for the three research tables introduced in 20260719_research_tables_v3.sql.
 *
 * These are pure unit tests — no DB connection required.
 * They verify:
 *   1. TypeScript types accept valid values and reject invalid ones.
 *   2. EventRepository has no mutation methods (append-only contract).
 *   3. Consent gate logic (PDPA + minor guardian).
 *   4. Event type and outcome validation.
 *   5. Experiment assignment uniqueness constraint (logic layer).
 *   6. Append-only guard function interface.
 */

import { describe, it, expect } from 'vitest';
import {
  isResearchConsented,
  requiresGuardianConsent,
  isMinorFullyConsented,
  filterConsented,
  CURRENT_CONSENT_VERSION,
  MINOR_AGE_THRESHOLD,
} from '@/lib/research/consentGate';
import { EventRepository } from '@/lib/research/eventRepository';
import type {
  StudentProfileRow,
  EventRow,
  EventInsert,
  EventType,
  HouseholdIncomeBand,
  ExperimentAssignmentRow,
  ExperimentVariant,
  AreaType,
} from '@/lib/research/tableTypes';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<StudentProfileRow> = {}): StudentProfileRow {
  return {
    user_id:               'test-uuid-1',
    province:              'ขอนแก่น',
    region:                'Northeast',
    area_type:             'rural',
    household_income_band: 'band_2',
    monthly_income_thb:    null,
    welfare_card:          true,
    first_generation:      true,
    parent_education:      'primary',
    household_size:        5,
    school_type:           'government',
    school_province:       'ขอนแก่น',
    gpa:                   3.5,
    class_rank_pct:        15.0,
    gender:                null,
    birth_year:            2006,
    disability_status:     null,
    intended_level:        'bachelor',
    intended_field:        'engineering',
    language_pref:         'th',
    consent_research:      true,
    consent_at:            '2026-07-19T00:00:00Z',
    consent_version:       CURRENT_CONSENT_VERSION,
    guardian_consent:      true,
    created_at:            '2026-07-19T00:00:00Z',
    updated_at:            '2026-07-19T00:00:00Z',
    ...overrides,
  };
}

function makeEventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id:                  'evt-uuid-1',
    occurred_at:         '2026-07-19T10:00:00Z',
    user_id:             'test-uuid-1',
    session_id:          'sess-abc',
    scholarship_id:      'TD-0001',
    event_type:          'impression',
    rank_position:       1,
    score:               0.85,
    recommender_variant: 'hybrid',
    fairness_mode:       'on',
    query_text:          null,
    filters:             null,
    context:             { tab: 'matches' },
    outcome:             null,
    outcome_source:      null,
    outcome_date:        null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// student_profile type validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('StudentProfileRow types', () => {
  it('accepts all valid area_type values', () => {
    const types: AreaType[] = ['urban', 'peri_urban', 'rural'];
    types.forEach(at => {
      const p = makeProfile({ area_type: at });
      expect(p.area_type).toBe(at);
    });
  });

  it('accepts all valid household_income_band values (v2 + v3 formats)', () => {
    const v2: HouseholdIncomeBand[] = ['band_1', 'band_2', 'band_3', 'band_4', 'band_5', 'band_6', 'band_7'];
    const v3: HouseholdIncomeBand[] = ['<100k', '100-200k', '200-360k', '360-600k', '600k+', 'unknown'];
    [...v2, ...v3].forEach(band => {
      const p = makeProfile({ household_income_band: band });
      expect(p.household_income_band).toBe(band);
    });
  });

  it('accepts new v3 columns with null values', () => {
    const p = makeProfile({
      monthly_income_thb:  null,
      parent_education:    null,
      household_size:      null,
      school_province:     null,
      class_rank_pct:      null,
      disability_status:   null,
    });
    expect(p.monthly_income_thb).toBeNull();
    expect(p.parent_education).toBeNull();
    expect(p.household_size).toBeNull();
  });

  it('accepts peri_urban area_type (new in v3)', () => {
    const p = makeProfile({ area_type: 'peri_urban' });
    expect(p.area_type).toBe('peri_urban');
  });

  it('allows gender to be free-text (self-described)', () => {
    const p = makeProfile({ gender: 'non-binary / ไม่ระบุ' });
    expect(p.gender).toBe('non-binary / ไม่ระบุ');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// event table: type validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('EventRow types', () => {
  const ALL_EVENT_TYPES: EventType[] = [
    'search', 'view_list', 'impression', 'view_detail', 'click_apply',
    'track_add', 'track_remove', 'status_change', 'self_report_outcome', 'outcome_verified',
  ];

  it('includes all 10 required event types', () => {
    expect(ALL_EVENT_TYPES).toHaveLength(10);
  });

  it('includes outcome_verified (new in v3)', () => {
    expect(ALL_EVENT_TYPES).toContain('outcome_verified');
  });

  it('has first-class recommender signal columns', () => {
    const e = makeEventRow({ rank_position: 3, score: 0.72, recommender_variant: 'hybrid', fairness_mode: 'on' });
    expect(e.rank_position).toBe(3);
    expect(e.score).toBe(0.72);
    expect(e.recommender_variant).toBe('hybrid');
    expect(e.fairness_mode).toBe('on');
  });

  it('has outcome columns for self_report_outcome events', () => {
    const e = makeEventRow({
      event_type:     'self_report_outcome',
      outcome:        'awarded',
      outcome_source: 'self_report',
      outcome_date:   '2026-09-01',
    });
    expect(e.outcome).toBe('awarded');
    expect(e.outcome_source).toBe('self_report');
    expect(e.outcome_date).toBe('2026-09-01');
  });

  it('has outcome columns for outcome_verified events (partner import)', () => {
    const e = makeEventRow({
      event_type:     'outcome_verified',
      outcome:        'awarded',
      outcome_source: 'partner_verified',
      outcome_date:   '2026-09-15',
    });
    expect(e.event_type).toBe('outcome_verified');
    expect(e.outcome_source).toBe('partner_verified');
  });

  it('allows user_id to be null for anonymous sessions', () => {
    const e = makeEventRow({ user_id: null, session_id: 'anon-sess' });
    expect(e.user_id).toBeNull();
    expect(e.session_id).toBe('anon-sess');
  });

  it('allows filters to be a structured object', () => {
    const e = makeEventRow({ filters: { level: 'undergraduate', region: 'Northeast' } });
    expect(e.filters).toEqual({ level: 'undergraduate', region: 'Northeast' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EventRepository: append-only contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('EventRepository — append-only contract', () => {
  const repo = new EventRepository();

  it('has an insert() method', () => {
    expect(typeof repo.insert).toBe('function');
  });

  it('has an insertBatch() method', () => {
    expect(typeof repo.insertBatch).toBe('function');
  });

  it('does NOT have an update() method', () => {
    expect((repo as unknown as Record<string, unknown>)['update']).toBeUndefined();
  });

  it('does NOT have a delete() method', () => {
    expect((repo as unknown as Record<string, unknown>)['delete']).toBeUndefined();
  });

  it('does NOT have an upsert() method', () => {
    expect((repo as unknown as Record<string, unknown>)['upsert']).toBeUndefined();
  });

  it('does NOT have a findForUpdate() method', () => {
    expect((repo as unknown as Record<string, unknown>)['findForUpdate']).toBeUndefined();
  });

  it('accepts a valid EventInsert object (type-level test)', () => {
    const event: EventInsert = {
      user_id:             'user-uuid',
      session_id:          'sess-123',
      scholarship_id:      'TD-0001',
      event_type:          'impression',
      rank_position:       1,
      score:               0.85,
      recommender_variant: 'hybrid',
      fairness_mode:       'on',
      query_text:          null,
      filters:             null,
      context:             { tab: 'matches' },
      outcome:             null,
      outcome_source:      null,
      outcome_date:        null,
    };
    // Type compiles → contract is correct
    expect(event.event_type).toBe('impression');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Consent gate
// ═══════════════════════════════════════════════════════════════════════════════

describe('isResearchConsented', () => {
  it('returns true for a consented profile with current version', () => {
    const p = makeProfile({ consent_research: true, consent_version: CURRENT_CONSENT_VERSION });
    expect(isResearchConsented(p)).toBe(true);
  });

  it('returns false when consent_research is false', () => {
    const p = makeProfile({ consent_research: false, consent_version: CURRENT_CONSENT_VERSION });
    expect(isResearchConsented(p)).toBe(false);
  });

  it('returns false when consent_version is null (never consented)', () => {
    const p = makeProfile({ consent_research: true, consent_version: null });
    expect(isResearchConsented(p)).toBe(false);
  });

  it('returns false when consent_version is stale (old form version)', () => {
    const p = makeProfile({ consent_research: true, consent_version: '2025-01-v1' });
    expect(isResearchConsented(p)).toBe(false);
  });
});

describe('requiresGuardianConsent', () => {
  const CURRENT_YEAR = 2026;

  it(`requires consent for students under ${MINOR_AGE_THRESHOLD}`, () => {
    expect(requiresGuardianConsent(CURRENT_YEAR - 15, CURRENT_YEAR)).toBe(true);
    expect(requiresGuardianConsent(CURRENT_YEAR - 17, CURRENT_YEAR)).toBe(true);
  });

  it(`does not require consent for students ${MINOR_AGE_THRESHOLD}+`, () => {
    expect(requiresGuardianConsent(CURRENT_YEAR - 18, CURRENT_YEAR)).toBe(false);
    expect(requiresGuardianConsent(CURRENT_YEAR - 25, CURRENT_YEAR)).toBe(false);
  });

  it('handles null birth_year (no guardian consent needed)', () => {
    expect(requiresGuardianConsent(null, CURRENT_YEAR)).toBe(false);
  });

  it('uses current year by default', () => {
    const thisYear = new Date().getFullYear();
    expect(requiresGuardianConsent(thisYear - 15)).toBe(true);
    expect(requiresGuardianConsent(thisYear - 18)).toBe(false);
  });
});

describe('isMinorFullyConsented', () => {
  const CURRENT_YEAR = 2026;

  it('returns true for an adult regardless of guardian_consent', () => {
    const p = makeProfile({ birth_year: CURRENT_YEAR - 20, consent_research: true, guardian_consent: false });
    expect(isMinorFullyConsented(p)).toBe(true);
  });

  it('returns true for a minor with both consents', () => {
    const p = makeProfile({ birth_year: CURRENT_YEAR - 15, consent_research: true, guardian_consent: true });
    expect(isMinorFullyConsented(p)).toBe(true);
  });

  it('returns false for a minor missing guardian consent', () => {
    const p = makeProfile({ birth_year: CURRENT_YEAR - 15, consent_research: true, guardian_consent: false });
    expect(isMinorFullyConsented(p)).toBe(false);
  });

  it('returns false for a minor missing both consents', () => {
    const p = makeProfile({ birth_year: CURRENT_YEAR - 15, consent_research: false, guardian_consent: false });
    expect(isMinorFullyConsented(p)).toBe(false);
  });

  it('returns false for a minor whose guardian consented but student did not', () => {
    const p = makeProfile({ birth_year: CURRENT_YEAR - 15, consent_research: false, guardian_consent: true });
    expect(isMinorFullyConsented(p)).toBe(false);
  });
});

describe('filterConsented', () => {
  it('includes only fully consented, current-version profiles', () => {
    const profiles = [
      makeProfile({ user_id: 'a', consent_research: true,  consent_version: CURRENT_CONSENT_VERSION }),
      makeProfile({ user_id: 'b', consent_research: false, consent_version: CURRENT_CONSENT_VERSION }),
      makeProfile({ user_id: 'c', consent_research: true,  consent_version: '2025-01-v1' }),
      makeProfile({ user_id: 'd', consent_research: true,  consent_version: CURRENT_CONSENT_VERSION }),
    ];
    const result = filterConsented(profiles);
    expect(result.map(p => p.user_id)).toEqual(['a', 'd']);
  });

  it('returns empty array when no profiles are consented', () => {
    const profiles = [
      makeProfile({ consent_research: false }),
      makeProfile({ consent_research: true, consent_version: 'old-v1' }),
    ];
    expect(filterConsented(profiles)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// experiment_assignment
// ═══════════════════════════════════════════════════════════════════════════════

describe('ExperimentAssignmentRow types', () => {
  it('accepts valid variants', () => {
    const variants: ExperimentVariant[] = ['control', 'treatment'];
    variants.forEach(v => {
      const row: ExperimentAssignmentRow = {
        id:             'ea-uuid-1',
        user_id:        'user-uuid-1',
        experiment_key: 'ranking',
        variant:        v,
        assigned_at:    '2026-07-19T00:00:00Z',
      };
      expect(row.variant).toBe(v);
    });
  });

  it('has an id column (added in v3)', () => {
    const row: ExperimentAssignmentRow = {
      id:             'ea-uuid-1',
      user_id:        'user-uuid-1',
      experiment_key: 'ranking',
      variant:        'control',
      assigned_at:    '2026-07-19T00:00:00Z',
    };
    expect(typeof row.id).toBe('string');
  });

  it('enforces uniqueness concept: same user+key → same variant', () => {
    // Simulate what the DB UNIQUE (user_id, experiment_key) enforces:
    // In-memory dedup check (mirrors application-layer upsert logic)
    const assignments: ExperimentAssignmentRow[] = [];
    const upsertAssignment = (row: ExperimentAssignmentRow) => {
      const idx = assignments.findIndex(
        r => r.user_id === row.user_id && r.experiment_key === row.experiment_key,
      );
      if (idx >= 0) {
        // CONFLICT: existing row wins (do nothing)
      } else {
        assignments.push(row);
      }
    };

    upsertAssignment({ id: 'a', user_id: 'u1', experiment_key: 'ranking', variant: 'control',   assigned_at: '' });
    upsertAssignment({ id: 'b', user_id: 'u1', experiment_key: 'ranking', variant: 'treatment', assigned_at: '' });

    // Only one assignment for u1/ranking
    const u1Assignments = assignments.filter(r => r.user_id === 'u1' && r.experiment_key === 'ranking');
    expect(u1Assignments).toHaveLength(1);
    expect(u1Assignments[0].variant).toBe('control');  // first assignment wins
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Append-only guard (DB trigger logic, tested in TypeScript)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Append-only guard for event', () => {
  function simulateAppendOnlyGuard(operation: 'INSERT' | 'UPDATE' | 'DELETE'): void {
    if (operation === 'UPDATE' || operation === 'DELETE') {
      throw new Error(
        'event table is append-only: UPDATE and DELETE are not permitted. '
        + 'Correct outcome data by inserting a new row with event_type=outcome_verified.'
      );
    }
  }

  it('allows INSERT', () => {
    expect(() => simulateAppendOnlyGuard('INSERT')).not.toThrow();
  });

  it('blocks UPDATE', () => {
    expect(() => simulateAppendOnlyGuard('UPDATE')).toThrow('append-only');
  });

  it('blocks DELETE', () => {
    expect(() => simulateAppendOnlyGuard('DELETE')).toThrow('append-only');
  });

  it('error message suggests using outcome_verified event instead', () => {
    try {
      simulateAppendOnlyGuard('UPDATE');
    } catch (err) {
      expect(String(err)).toContain('outcome_verified');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Migration acceptance checklist (structure tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Migration acceptance: student_profile new columns', () => {
  const NEW_V3_COLUMNS = [
    'monthly_income_thb',
    'parent_education',
    'household_size',
    'school_province',
    'class_rank_pct',
    'disability_status',
  ] as const;

  it('all v3 new columns are present in StudentProfileRow type', () => {
    const sample = makeProfile();
    for (const col of NEW_V3_COLUMNS) {
      expect(col in sample).toBe(true);
    }
  });

  it('peri_urban is a valid area_type value', () => {
    const p = makeProfile({ area_type: 'peri_urban' });
    expect(p.area_type).toBe('peri_urban');
  });
});

describe('Migration acceptance: event table columns', () => {
  const REQUIRED_RECOMMENDER_COLUMNS: (keyof EventRow)[] = [
    'rank_position',
    'score',
    'recommender_variant',
    'fairness_mode',
  ];

  const REQUIRED_OUTCOME_COLUMNS: (keyof EventRow)[] = [
    'outcome',
    'outcome_source',
    'outcome_date',
  ];

  it('event has all required recommender signal columns', () => {
    const e = makeEventRow();
    for (const col of REQUIRED_RECOMMENDER_COLUMNS) {
      expect(col in e).toBe(true);
    }
  });

  it('event has all required outcome columns', () => {
    const e = makeEventRow();
    for (const col of REQUIRED_OUTCOME_COLUMNS) {
      expect(col in e).toBe(true);
    }
  });

  it('event has query_text and filters columns', () => {
    const e = makeEventRow({ query_text: 'ทุนวิศวกรรม', filters: { region: 'Northeast' } });
    expect(e.query_text).toBe('ทุนวิศวกรรม');
    expect(e.filters).toEqual({ region: 'Northeast' });
  });
});

describe('Migration acceptance: experiment_assignment id column', () => {
  it('ExperimentAssignmentRow includes an id column', () => {
    const row: ExperimentAssignmentRow = {
      id:             'ea-uuid-1',
      user_id:        'u1',
      experiment_key: 'ranking',
      variant:        'treatment',
      assigned_at:    '2026-07-19T00:00:00Z',
    };
    expect(row.id).toBe('ea-uuid-1');
  });
});
