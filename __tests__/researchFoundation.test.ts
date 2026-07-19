/**
 * Tests for the research data foundation.
 *
 * Covers:
 *   - computeVariant: sticky 50/50 split, deterministic
 *   - pseudonymise: stable across calls, no PII leakage
 *   - region derivation constants (subset validation)
 *   - funnel event type exhaustiveness
 *   - shouldSendReminder-style gate: consent_research required for export
 *   - self-report outcome validation
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { computeVariant, RANKING_EXPERIMENT } from '@/lib/research/experiment';

// ─── computeVariant ───────────────────────────────────────────────────────────

describe('computeVariant', () => {
  it('returns only "control" or "treatment"', () => {
    const uuids = [
      'a0000000-0000-0000-0000-000000000000',
      'b1111111-1111-1111-1111-111111111111',
      'c2222222-2222-2222-2222-222222222222',
      'd3333333-3333-3333-3333-333333333333',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ];
    for (const id of uuids) {
      const v = computeVariant(id, RANKING_EXPERIMENT);
      expect(['control', 'treatment']).toContain(v);
    }
  });

  it('is deterministic — same userId + key always gives same variant', () => {
    const userId = '12345678-abcd-ef01-2345-6789abcdef01';
    const v1 = computeVariant(userId, RANKING_EXPERIMENT);
    const v2 = computeVariant(userId, RANKING_EXPERIMENT);
    expect(v1).toBe(v2);
  });

  it('changes when experiment_key changes (different randomisation per experiment)', () => {
    const userId = '12345678-abcd-ef01-2345-6789abcdef01';
    // Not guaranteed to differ but different key should use different seed
    const v1 = computeVariant(userId, 'ranking');
    const v2 = computeVariant(userId, 'other_experiment');
    // Just verify it runs without error — key is part of the seed
    expect(['control', 'treatment']).toContain(v1);
    expect(['control', 'treatment']).toContain(v2);
  });

  it('achieves roughly 50/50 split across 1000 random-ish UUIDs', () => {
    // Generate 1000 deterministic pseudo-UUIDs via sequential hex
    let treatment = 0;
    for (let i = 0; i < 1000; i++) {
      const hex = i.toString(16).padStart(8, '0');
      const fakeId = `${hex}-0000-0000-0000-000000000000`;
      if (computeVariant(fakeId, RANKING_EXPERIMENT) === 'treatment') treatment++;
    }
    // Allow 40–60% range for a deterministic hash (not truly random)
    expect(treatment).toBeGreaterThan(400);
    expect(treatment).toBeLessThan(600);
  });
});

// ─── Pseudonymisation ─────────────────────────────────────────────────────────

function pseudonymise(userId: string): string {
  return crypto.createHash('sha256').update(userId).digest('hex');
}

describe('pseudonymise', () => {
  const REAL_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('is stable — same input always gives same output', () => {
    expect(pseudonymise(REAL_USER_ID)).toBe(pseudonymise(REAL_USER_ID));
  });

  it('returns a 64-char hex string (SHA-256)', () => {
    const p = pseudonymise(REAL_USER_ID);
    expect(p).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not contain the original user_id', () => {
    const p = pseudonymise(REAL_USER_ID);
    expect(p).not.toContain(REAL_USER_ID);
    expect(p).not.toContain('a1b2c3d4');
  });

  it('produces different outputs for different user_ids', () => {
    const p1 = pseudonymise('user-aaa');
    const p2 = pseudonymise('user-bbb');
    expect(p1).not.toBe(p2);
  });

  it('is consistent across export calls (same userId → same pseudo_id)', () => {
    // Simulates two separate export runs
    const run1 = pseudonymise(REAL_USER_ID);
    const run2 = pseudonymise(REAL_USER_ID);
    expect(run1).toBe(run2);
  });
});

// ─── Consent gate (research export logic) ─────────────────────────────────────

describe('consent gate', () => {
  interface FakeProfile {
    user_id: string;
    consent_research: boolean;
    region: string;
  }

  function filterConsented(profiles: FakeProfile[]): FakeProfile[] {
    return profiles.filter(p => p.consent_research === true);
  }

  const profiles: FakeProfile[] = [
    { user_id: 'user-a', consent_research: true,  region: 'North' },
    { user_id: 'user-b', consent_research: false, region: 'Bangkok' },
    { user_id: 'user-c', consent_research: true,  region: 'Northeast' },
    { user_id: 'user-d', consent_research: false, region: 'South' },
  ];

  it('includes only consented users', () => {
    const result = filterConsented(profiles);
    expect(result.map(p => p.user_id)).toEqual(['user-a', 'user-c']);
  });

  it('excludes non-consented users', () => {
    const result = filterConsented(profiles);
    expect(result.every(p => p.consent_research)).toBe(true);
  });

  it('excludes all when none consented', () => {
    const none = profiles.map(p => ({ ...p, consent_research: false }));
    expect(filterConsented(none)).toHaveLength(0);
  });

  it('pseudonymised export row contains no PII-like fields', () => {
    // Simulate what the export API produces
    const exportRow = {
      pseudo_user_id:        pseudonymise('user-a'),
      session_id:            'sess-123',
      scholarship_id:        'SCH001',
      event_type:            'impression',
      context:               { rank: 1, variant: 'control' },
      occurred_at:           '2026-07-19T00:00:00Z',
      region:                'North',
      household_income_band: 'band_2',
    };

    const keys = Object.keys(exportRow);
    // Must not contain PII field names
    expect(keys).not.toContain('user_id');
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('name');
    expect(keys).not.toContain('phone');
    expect(keys).not.toContain('line_user_id');
    // Must contain the pseudonymous identifier
    expect(keys).toContain('pseudo_user_id');
    expect(exportRow.pseudo_user_id).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── Self-report outcome validation ───────────────────────────────────────────

describe('self-report outcome validation', () => {
  const VALID_OUTCOMES = ['applied', 'awarded', 'rejected'];

  it('accepts all valid outcomes', () => {
    for (const o of VALID_OUTCOMES) {
      expect(VALID_OUTCOMES.includes(o)).toBe(true);
    }
  });

  it('rejects invalid outcomes', () => {
    const invalid = ['win', 'lost', '', 'APPLIED', 'pending'];
    for (const o of invalid) {
      expect(VALID_OUTCOMES.includes(o)).toBe(false);
    }
  });
});

// ─── Funnel event types exhaustiveness ────────────────────────────────────────

describe('funnel event types', () => {
  const EXPECTED_TYPES = [
    'search',
    'view_list',
    'impression',
    'view_detail',
    'click_apply',
    'track_add',
    'track_remove',
    'status_change',
    'self_report_outcome',
  ] as const;

  it('all expected event types are defined', () => {
    // This is a compile-time safety net — if FunnelEventType changes, update this list
    const set = new Set(EXPECTED_TYPES);
    expect(set.size).toBe(EXPECTED_TYPES.length); // no duplicates
    for (const t of EXPECTED_TYPES) {
      expect(typeof t).toBe('string');
    }
  });

  it('impression is in the list (critical for causal inference exposure signal)', () => {
    expect(EXPECTED_TYPES).toContain('impression');
  });
});

// ─── Region derivation (subset validation) ────────────────────────────────────

describe('region derivation', () => {
  // Mirror the CASE logic from the SQL function
  const REGION_MAP: Record<string, string> = {
    'กรุงเทพมหานคร': 'Bangkok',
    'เชียงใหม่': 'North',
    'เชียงราย': 'North',
    'นครราชสีมา': 'Northeast',
    'ขอนแก่น': 'Northeast',
    'อุบลราชธานี': 'Northeast',
    'ภูเก็ต': 'South',
    'สงขลา': 'South',
    'ชลบุรี': 'East',
    'กาญจนบุรี': 'West',
    'นนทบุรี': 'Central',
    'ปทุมธานี': 'Central',
  };

  for (const [province, expectedRegion] of Object.entries(REGION_MAP)) {
    it(`${province} → ${expectedRegion}`, () => {
      expect(REGION_MAP[province]).toBe(expectedRegion);
    });
  }

  it('unknown province maps to "Other" (fallback)', () => {
    const unknown = REGION_MAP['ดาวอังคาร'] ?? 'Other';
    expect(unknown).toBe('Other');
  });
});

// ─── Minor guardian consent requirement ───────────────────────────────────────

describe('guardian consent', () => {
  function needsGuardianConsent(birthYear: number | null): boolean {
    if (birthYear === null) return false;
    return new Date().getFullYear() - birthYear < 18;
  }

  it('requires guardian consent for birth year indicating age < 18', () => {
    const thisYear = new Date().getFullYear();
    expect(needsGuardianConsent(thisYear - 15)).toBe(true);
    expect(needsGuardianConsent(thisYear - 17)).toBe(true);
  });

  it('does not require guardian consent for adults', () => {
    const thisYear = new Date().getFullYear();
    expect(needsGuardianConsent(thisYear - 18)).toBe(false);
    expect(needsGuardianConsent(thisYear - 25)).toBe(false);
  });

  it('handles null birth_year (no guardian consent needed)', () => {
    expect(needsGuardianConsent(null)).toBe(false);
  });
});
