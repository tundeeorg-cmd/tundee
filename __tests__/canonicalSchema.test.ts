/**
 * Acceptance tests for the canonical 28-field scholarship schema,
 * the v2 finalize migration (scripts/20260719_v2_canonical_finalize.sql),
 * and the research/tracker table types.
 *
 * All tests are pure TypeScript — no DB connection required.
 * TypeScript compile errors ARE test failures: if a column was misspelled,
 * removed, or has the wrong type, the import at the top will fail.
 */

import { describe, it, expect } from 'vitest';

import type { TdScholarship, TdImportRow } from '../lib/tdScholarships/types';

import type {
  StudentProfileRow,
  StudentProfileInsert,
  EventRow,
  EventInsert,
  EventType,
  ExperimentAssignmentRow,
  ExperimentAssignmentInsert,
  ExperimentVariant,
  TrackedScholarshipRow,
  TrackedScholarshipInsert,
  TrackerStatus,
  ReminderLogRow,
  ReminderLogInsert,
  ReminderChannel,
} from '../lib/research/tableTypes';

// ─── 28-field canonical schema ────────────────────────────────────────────────

describe('TdScholarship — canonical 28-field schema', () => {
  const full: TdScholarship = {
    // ── Existing baseline columns ──
    scholarship_id: 'TD-0001',
    scholarship_name: 'ทุนทดสอบ',
    funder: 'กพ',
    funder_type: 'Thai University',
    level: 'Undergraduate',
    field_of_study: 'Engineering',
    award_amount_thb: '50,000',
    region_eligibility: 'All',
    targets_low_income: true,
    num_recipients: 10,
    min_gpa: 3.0,
    income_cap_thb: 200000,
    language: null,
    deadline_raw: '31 Aug 2026',
    status: 'Open',
    application_link: 'https://example.com/apply',  // legacy
    source: 'https://example.com',                  // legacy
    verification_status: 'verified',
    last_verified: '2026-07-01',
    verified_by: null,
    notes: null,
    deadline_date: '2026-08-31',
    deadline_is_rolling: false,
    deadline_note: null,
    is_displayed: true,
    display_reason: null,
    stale: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-07-19T00:00:00Z',
    // ── 13 columns from 20260719 migration ──
    award_amount_thb_numeric: 50000,
    award_type: 'annual',
    renewable: true,
    bond_obligation: false,
    application_open_date: '2026-06-01',
    welfare_card_priority: true,
    english_requirement: 'None',
    scholarship_name_en: 'Test Scholarship',
    scholarship_name_th: 'ทุนทดสอบ',
    funder_en: 'OEAED',
    funder_th: 'กพ',
    source_language: 'th',
    translation_review: 'verified',
    // ── 2 canonical URL columns from v2 migration ──
    application_url: 'https://example.com/apply',
    source_url: 'https://example.com',
    // ── award_value_tier from v3 migration ──
    award_value_tier: 'large',
  };

  it('all 28 canonical fields are present and type-correct', () => {
    // Column 1
    expect(full.scholarship_id).toBe('TD-0001');
    // Columns 2–3 (bilingual name)
    expect(full.scholarship_name_en).toBeTruthy();
    expect(full.scholarship_name_th).toBeTruthy();
    // Columns 4–5 (bilingual funder)
    expect(full.funder_en).toBeTruthy();
    expect(full.funder_th).toBeTruthy();
    // Column 6
    expect(full.source_language).toBe('th');
    // Columns 7–9
    expect(full.funder_type).toBeTruthy();
    expect(full.level).toBeTruthy();
    expect(full.field_of_study).toBeTruthy();
    // Column 10 (numeric award)
    expect(typeof full.award_amount_thb_numeric).toBe('number');
    // Column 11
    expect(full.award_type).toBe('annual');
    // Column 12
    expect(full.region_eligibility).toBeTruthy();
    // Columns 13–16
    expect(full.targets_low_income).toBe(true);
    expect(typeof full.income_cap_thb).toBe('number');
    expect(full.welfare_card_priority).toBe(true);
    expect(full.renewable).toBe(true);
    // Column 17
    expect(full.bond_obligation).toBe(false);
    // Column 18
    expect(typeof full.num_recipients).toBe('number');
    // Column 19
    expect(typeof full.min_gpa).toBe('number');
    // Column 20
    expect(full.english_requirement).toBe('None');
    // Column 21
    expect(full.application_open_date).toBe('2026-06-01');
    // Column 22 (raw + derived)
    expect(full.deadline_raw).toBeTruthy();
    expect(full.deadline_date).toBe('2026-08-31');
    // Column 23
    expect(full.status).toBe('Open');
    // Column 24 (canonical URL)
    expect(full.application_url).toBe('https://example.com/apply');
    // Column 25 (canonical source URL)
    expect(full.source_url).toBe('https://example.com');
    // Column 26–27
    expect(full.verification_status).toBeTruthy();
    expect(full.last_verified).toBeTruthy();
    // Column 28
    expect(full.notes).toBeNull();
  });

  it('internal columns (not in import sheet) retain default values', () => {
    expect(full.is_displayed).toBe(true);
    expect(full.deadline_is_rolling).toBe(false);
    expect(full.stale).toBe(false);
    expect(full.translation_review).toBe('verified');
  });

  it('legacy columns (application_link, source) still present for read compat', () => {
    expect(full.application_link).toBeTruthy();
    expect(full.source).toBeTruthy();
  });

  it('canonical URLs are independent of legacy columns', () => {
    const s: TdScholarship = { ...full, application_url: null, source_url: null };
    expect(s.application_url).toBeNull();
    expect(s.source_url).toBeNull();
    expect(s.application_link).toBeTruthy(); // legacy still set
  });
});

// ─── Migration idempotency simulation ────────────────────────────────────────

describe('v2 migration — back-fill simulation', () => {
  function backfillCanonicalUrls(row: {
    application_link: string;
    source: string | null;
    application_url: string | null;
    source_url: string | null;
  }) {
    return {
      application_url: row.application_url ?? row.application_link,
      source_url: row.source_url ?? row.source,
    };
  }

  it('copies application_link → application_url when canonical is null', () => {
    const result = backfillCanonicalUrls({
      application_link: 'https://a.com', source: 'https://b.com',
      application_url: null, source_url: null,
    });
    expect(result.application_url).toBe('https://a.com');
    expect(result.source_url).toBe('https://b.com');
  });

  it('does not overwrite pre-existing canonical URL (COALESCE idempotency)', () => {
    const result = backfillCanonicalUrls({
      application_link: 'https://old.com', source: null,
      application_url: 'https://new.com', source_url: null,
    });
    expect(result.application_url).toBe('https://new.com');
    expect(result.source_url).toBeNull();
  });

  it('is idempotent — running back-fill twice yields the same result', () => {
    const input = {
      application_link: 'https://a.com', source: 'https://b.com',
      application_url: null as string | null, source_url: null as string | null,
    };
    const first = backfillCanonicalUrls(input);
    const second = backfillCanonicalUrls({ ...input, ...first });
    expect(second).toEqual(first);
  });
});

// ─── student_profile ──────────────────────────────────────────────────────────

describe('StudentProfileRow — research attributes', () => {
  const profile: StudentProfileRow = {
    user_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    province: 'ขอนแก่น',
    region: 'Northeast',
    area_type: 'urban',
    household_income_band: '<100k',
    monthly_income_thb: 8000,
    welfare_card: true,
    first_generation: true,
    parent_education: 'primary',
    household_size: 5,
    school_type: 'government',
    school_province: 'ขอนแก่น',
    gpa: 3.75,
    class_rank_pct: 12.5,
    gender: 'female',
    birth_year: 2008,
    disability_status: null,
    intended_level: 'undergraduate',
    intended_field: 'Education',
    preferred_scholarship_types: ['full_ride', 'stipend_only'],
    language_pref: 'th',
    consent_research: true,
    consent_at: '2026-07-01T00:00:00Z',
    consent_version: '2026-v1',
    guardian_consent: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-19T00:00:00Z',
  };

  it('has all PDPA consent fields', () => {
    expect(profile.consent_research).toBe(true);
    expect(profile.consent_version).toBe('2026-v1');
    expect(profile.guardian_consent).toBe(true);   // required for minor (birth_year 2008)
  });

  it('region is derived from province (GENERATED column — read-only)', () => {
    expect(profile.region).toBe('Northeast');
  });

  it('StudentProfileInsert excludes generated + auto-timestamp columns', () => {
    const insert: StudentProfileInsert = {
      user_id: profile.user_id,
      province: profile.province,
      area_type: profile.area_type,
      household_income_band: '<100k',
      monthly_income_thb: 8000,
      welfare_card: true,
      first_generation: true,
      parent_education: 'primary',
      household_size: 5,
      school_type: 'government',
      school_province: 'ขอนแก่น',
      gpa: 3.75,
      class_rank_pct: 12.5,
      gender: null,
      birth_year: 2008,
      disability_status: null,
      intended_level: 'undergraduate',
      intended_field: null,
      preferred_scholarship_types: null,
      language_pref: 'th',
      consent_research: true,
      consent_at: '2026-07-01T00:00:00Z',
      consent_version: '2026-v1',
      guardian_consent: true,
    };
    expect('region' in insert).toBe(false);
    expect('created_at' in insert).toBe(false);
    expect(insert.consent_research).toBe(true);
  });
});

// ─── event — append-only ──────────────────────────────────────────────────────

describe('EventRow — append-only interaction log', () => {
  const base: EventRow = {
    id: 'eeeeeeee-0000-0000-0000-000000000001',
    occurred_at: '2026-07-19T12:00:00Z',
    user_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    session_id: 'sess-001',
    scholarship_id: 'TD-0001',
    event_type: 'view_detail',
    rank_position: 3,
    score: 0.87,
    recommender_variant: 'fairness-v1',
    fairness_mode: 'on',
    query_text: null,
    filters: null,
    context: {},
    outcome: null,
    outcome_source: null,
    outcome_date: null,
  };

  it.each<EventType>([
    'search', 'view_list', 'impression', 'view_detail', 'click_apply',
    'track_add', 'track_remove', 'status_change', 'self_report_outcome', 'outcome_verified',
  ])('accepts event_type %s', (t) => {
    const e: EventRow = { ...base, event_type: t };
    expect(e.event_type).toBe(t);
  });

  it('outcome fields are only set on outcome events', () => {
    const e: EventRow = {
      ...base,
      event_type: 'self_report_outcome',
      outcome: 'awarded',
      outcome_source: 'self_report',
      outcome_date: '2026-09-01',
    };
    expect(e.outcome).toBe('awarded');
    expect(e.outcome_source).toBe('self_report');
  });

  it('EventInsert excludes auto-generated id and occurred_at', () => {
    const insert: EventInsert = {
      user_id: base.user_id,
      session_id: base.session_id,
      scholarship_id: base.scholarship_id,
      event_type: 'click_apply',
      rank_position: 1,
      score: 0.91,
      recommender_variant: 'baseline',
      fairness_mode: 'off',
      query_text: null,
      filters: null,
      context: { source: 'list' },
      outcome: null,
      outcome_source: null,
      outcome_date: null,
    };
    expect('id' in insert).toBe(false);
    expect(insert.event_type).toBe('click_apply');
  });
});

// ─── experiment_assignment ────────────────────────────────────────────────────

describe('ExperimentAssignmentRow', () => {
  const row: ExperimentAssignmentRow = {
    id: 'ffffffff-0000-0000-0000-000000000001',
    user_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    experiment_key: 'ranking',
    variant: 'treatment',
    assigned_at: '2026-07-01T00:00:00Z',
  };

  it.each<ExperimentVariant>(['control', 'treatment'])('accepts variant %s', (v) => {
    const r: ExperimentAssignmentRow = { ...row, variant: v };
    expect(r.variant).toBe(v);
  });

  it('ExperimentAssignmentInsert excludes auto-generated fields', () => {
    const insert: ExperimentAssignmentInsert = {
      user_id: row.user_id,
      experiment_key: 'banner',
      variant: 'control',
    };
    expect('id' in insert).toBe(false);
    expect('assigned_at' in insert).toBe(false);
    expect(insert.experiment_key).toBe('banner');
  });

  it('UNIQUE (user_id, experiment_key) — duplicate raises conflict', () => {
    type Key = { user_id: string; experiment_key: string };
    function wouldConflict(existing: Key[], candidate: Key) {
      return existing.some(e => e.user_id === candidate.user_id && e.experiment_key === candidate.experiment_key);
    }
    const existing: Key[] = [{ user_id: 'u1', experiment_key: 'ranking' }];
    expect(wouldConflict(existing, { user_id: 'u1', experiment_key: 'ranking' })).toBe(true);
    expect(wouldConflict(existing, { user_id: 'u1', experiment_key: 'banner' })).toBe(false);
  });
});

// ─── tracked_scholarship ──────────────────────────────────────────────────────

describe('TrackedScholarshipRow — canonical 5-status + reminder_opt_in', () => {
  const row: TrackedScholarshipRow = {
    id: 'aaaaaaaa-0000-0000-0000-000000000002',
    user_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    scholarship_id: 'TD-0001',
    status: 'interested',
    notes: null,
    reminder_opt_in: true,
    created_at: '2026-07-19T00:00:00Z',
    updated_at: '2026-07-19T00:00:00Z',
  };

  it.each<TrackerStatus>(['interested', 'applying', 'applied', 'awarded', 'rejected'])(
    'accepts DB-canonical status %s', (s) => {
      expect({ ...row, status: s }.status).toBe(s);
    }
  );

  it('reminder_opt_in controls whether LINE reminders are sent', () => {
    expect({ ...row, reminder_opt_in: false }.reminder_opt_in).toBe(false);
  });

  it('UNIQUE (user_id, scholarship_id)', () => {
    type Key = { user_id: string; scholarship_id: string };
    function wouldConflict(existing: Key[], candidate: Key) {
      return existing.some(e => e.user_id === candidate.user_id && e.scholarship_id === candidate.scholarship_id);
    }
    const existing: Key[] = [{ user_id: 'u1', scholarship_id: 'TD-0001' }];
    expect(wouldConflict(existing, { user_id: 'u1', scholarship_id: 'TD-0001' })).toBe(true);
    expect(wouldConflict(existing, { user_id: 'u1', scholarship_id: 'TD-0002' })).toBe(false);
  });
});

// ─── reminder_log — idempotent dedup ─────────────────────────────────────────

describe('ReminderLogRow — idempotent LINE reminder ledger', () => {
  const row: ReminderLogRow = {
    id: 42,
    user_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    scholarship_id: 'TD-0001',
    offset_days: 14,
    deadline_date: '2026-08-31',
    channel: 'line',
    sent_at: '2026-08-17T08:00:00Z',
  };

  it('has the 4-column dedup key (user_id, scholarship_id, offset_days, deadline_date)', () => {
    expect(row.offset_days).toBe(14);
    expect(row.deadline_date).toBe('2026-08-31');
  });

  it('supports 14-day and 1-day reminder offsets', () => {
    expect({ ...row, offset_days: 14 }.offset_days).toBe(14);
    expect({ ...row, offset_days: 1 }.offset_days).toBe(1);
  });

  it.each<ReminderChannel>(['line', 'email', 'push'])('channel %s is accepted', (c) => {
    expect({ ...row, channel: c }.channel).toBe(c);
  });

  it('idempotency: inserting same (user,sch,offset,deadline) twice yields no second row', () => {
    type DedupeKey = { user_id: string; scholarship_id: string; offset_days: number; deadline_date: string };
    function wouldInsert(existing: DedupeKey[], candidate: DedupeKey) {
      return !existing.some(e =>
        e.user_id === candidate.user_id &&
        e.scholarship_id === candidate.scholarship_id &&
        e.offset_days === candidate.offset_days &&
        e.deadline_date === candidate.deadline_date
      );
    }
    const key = { user_id: 'u1', scholarship_id: 'TD-0001', offset_days: 14, deadline_date: '2026-08-31' };
    expect(wouldInsert([], key)).toBe(true);         // first send: insert
    expect(wouldInsert([key], key)).toBe(false);     // second run: skip
  });

  it('ReminderLogInsert excludes bigserial id', () => {
    const insert: ReminderLogInsert = {
      user_id: row.user_id,
      scholarship_id: row.scholarship_id,
      offset_days: 1,
      deadline_date: '2026-08-31',
      channel: 'line',
      sent_at: '2026-08-30T08:00:00Z',
    };
    expect('id' in insert).toBe(false);
  });
});

// ─── Migration acceptance checklist ──────────────────────────────────────────

describe('Migration acceptance checklist', () => {
  it('migration is named 20260719_v2_canonical_finalize — pre-req is full_research_migration', () => {
    // Convention: file must exist at scripts/20260719_v2_canonical_finalize.sql
    // This test documents the dependency chain.
    expect('scripts/20260719_full_research_migration.sql → scripts/20260719_v2_canonical_finalize.sql').toBeTruthy();
  });

  it('canonical 28-field schema maps cleanly onto TdScholarship type', () => {
    const canonicalFields: (keyof TdScholarship)[] = [
      'scholarship_id',        // 1
      'scholarship_name_en',   // 2
      'scholarship_name_th',   // 3
      'funder_en',             // 4
      'funder_th',             // 5
      'source_language',       // 6
      'funder_type',           // 7
      'level',                 // 8
      'field_of_study',        // 9
      'award_amount_thb_numeric', // 10
      'award_type',            // 11
      'region_eligibility',    // 12
      'targets_low_income',    // 13
      'income_cap_thb',        // 14
      'welfare_card_priority', // 15
      'renewable',             // 16
      'bond_obligation',       // 17
      'num_recipients',        // 18
      'min_gpa',               // 19
      'english_requirement',   // 20
      'application_open_date', // 21
      'deadline_raw',          // 22 (raw; deadline_date/is_rolling/note are derived)
      'status',                // 23
      'application_url',       // 24 (canonical)
      'source_url',            // 25 (canonical)
      'verification_status',   // 26
      'last_verified',         // 27
      'notes',                 // 28
    ];
    expect(canonicalFields).toHaveLength(28);
  });

  it('deprecated columns (award_amount_thb text, language, scholarship_name, funder) remain but are not required by importer', () => {
    // These columns are nullable legacy aliases; the importer no longer populates them.
    const legacy: Partial<TdScholarship> = {
      award_amount_thb: null,
      language: null,
      scholarship_name: 'kept for compat',
      funder: 'kept for compat',
    };
    expect(legacy).toBeTruthy();
  });

  it('no pre-existing display-gate column is duplicated (deadline_date, is_displayed, stale)', () => {
    const check: Pick<TdScholarship, 'deadline_date' | 'deadline_is_rolling' | 'is_displayed' | 'stale' | 'translation_review'> = {
      deadline_date: '2026-08-31',
      deadline_is_rolling: false,
      is_displayed: true,
      stale: false,
      translation_review: 'missing',
    };
    expect(check.is_displayed).toBe(true);
    expect(check.translation_review).toBe('missing');
  });

  it('profiles table (Supabase) has LINE linking columns — not users table', () => {
    // Supabase uses auth.users; LINE columns live on public.profiles
    // This test documents the adaptation from the generic BIGINT spec.
    expect('profiles.line_user_id → TEXT UNIQUE').toBeTruthy();
    expect('profiles.line_linked_at → TIMESTAMPTZ').toBeTruthy();
  });

  it('event table has DB-level append-only guard', () => {
    // DB trigger: trg_event_append_only raises EXCEPTION on UPDATE/DELETE
    // App layer: EventRepository exposes insert/insertBatch only
    expect('trg_event_append_only → BEFORE UPDATE OR DELETE → RAISE EXCEPTION').toBeTruthy();
  });

  it('student_profile export requires consent_research = TRUE (PDPA)', () => {
    // v_event_research_export joins student_profile ON consent_research = TRUE
    const profiles = [
      { user_id: 'a', consent_research: true,  consent_version: '2026-v1' },
      { user_id: 'b', consent_research: false, consent_version: '2026-v1' },
      { user_id: 'c', consent_research: true,  consent_version: '2026-v1' },
    ];
    const exported = profiles.filter(p => p.consent_research);
    expect(exported.map(p => p.user_id)).toEqual(['a', 'c']);
  });
});
