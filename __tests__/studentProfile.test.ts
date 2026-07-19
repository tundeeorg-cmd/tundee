import {
  PROVINCES, deriveRegion, regionLabel,
  isMinor, computeAge, BIRTH_YEAR_MIN, BIRTH_YEAR_MAX,
  validateGpa, validateBirthYear, validateMonthlyIncome, validateClassRankPct, validateHouseholdSize,
  computeCompleteness,
} from '../lib/studentProfile';

describe('PROVINCES', () => {
  it('has all 77 Thai provinces', () => {
    expect(PROVINCES).toHaveLength(77);
  });

  it('every province resolves to a non-Other region (matches public.derive_region())', () => {
    for (const p of PROVINCES) {
      expect(deriveRegion(p.value)).not.toBe('Other');
    }
  });
});

describe('deriveRegion — mirrors public.derive_region() in 20260719_full_research_migration.sql', () => {
  it('maps Bangkok', () => {
    expect(deriveRegion('กรุงเทพมหานคร')).toBe('Bangkok');
  });
  it('maps a Central province', () => {
    expect(deriveRegion('นนทบุรี')).toBe('Central');
  });
  it('maps a North province', () => {
    expect(deriveRegion('เชียงใหม่')).toBe('North');
  });
  it('maps a Northeast province', () => {
    expect(deriveRegion('ขอนแก่น')).toBe('Northeast');
  });
  it('maps a South province', () => {
    expect(deriveRegion('ภูเก็ต')).toBe('South');
  });
  it('maps an East province', () => {
    expect(deriveRegion('ชลบุรี')).toBe('East');
  });
  it('maps a West province', () => {
    expect(deriveRegion('กาญจนบุรี')).toBe('West');
  });
  it('falls back to Other for an unrecognized value', () => {
    expect(deriveRegion('Not A Province')).toBe('Other');
    expect(deriveRegion('')).toBe('Other');
  });
});

describe('regionLabel', () => {
  it('localizes region names', () => {
    expect(regionLabel('Northeast', 'th')).toBe('ภาคอีสาน');
    expect(regionLabel('Northeast', 'en')).toBe('Northeast');
  });
  it('falls back to Other for an unrecognized region', () => {
    expect(regionLabel('Nowhere', 'en')).toBe('Other');
  });
});

describe('age / minor helpers', () => {
  const now = new Date('2026-07-19T00:00:00Z');

  it('computes age from birth year', () => {
    expect(computeAge(2008, now)).toBe(18);
    expect(computeAge(2010, now)).toBe(16);
  });

  it('flags under-18 as a minor', () => {
    expect(isMinor(2010, now)).toBe(true);
  });

  it('does not flag exactly-18 as a minor (birth-year-only approximation)', () => {
    expect(isMinor(2008, now)).toBe(false);
  });

  it('treats null/NaN birth year as not-a-minor (can\'t determine, don\'t block)', () => {
    expect(isMinor(null, now)).toBe(false);
    expect(isMinor(NaN, now)).toBe(false);
  });

  it('BIRTH_YEAR bounds match the student_profile CHECK constraint', () => {
    expect(BIRTH_YEAR_MIN).toBe(1990);
    expect(BIRTH_YEAR_MAX).toBe(2015);
  });
});

describe('validators', () => {
  it('validateGpa accepts blank and in-range values, rejects out-of-range', () => {
    expect(validateGpa('', 'en')).toBeNull();
    expect(validateGpa('3.75', 'en')).toBeNull();
    expect(validateGpa('4.00', 'en')).toBeNull();
    expect(validateGpa('4.01', 'en')).not.toBeNull();
    expect(validateGpa('-1', 'en')).not.toBeNull();
  });

  it('validateBirthYear enforces the DB CHECK range', () => {
    expect(validateBirthYear('', 'en')).toBeNull();
    expect(validateBirthYear('2008', 'en')).toBeNull();
    expect(validateBirthYear('1989', 'en')).not.toBeNull();
    expect(validateBirthYear('2016', 'en')).not.toBeNull();
  });

  it('validateMonthlyIncome rejects negative values', () => {
    expect(validateMonthlyIncome('', 'en')).toBeNull();
    expect(validateMonthlyIncome('15000', 'en')).toBeNull();
    expect(validateMonthlyIncome('-1', 'en')).not.toBeNull();
  });

  it('validateClassRankPct enforces 0-100', () => {
    expect(validateClassRankPct('10', 'en')).toBeNull();
    expect(validateClassRankPct('101', 'en')).not.toBeNull();
    expect(validateClassRankPct('-5', 'en')).not.toBeNull();
  });

  it('validateHouseholdSize requires a positive integer', () => {
    expect(validateHouseholdSize('4', 'en')).toBeNull();
    expect(validateHouseholdSize('0', 'en')).not.toBeNull();
    expect(validateHouseholdSize('3.5', 'en')).not.toBeNull();
  });
});

describe('computeCompleteness', () => {
  const blank = {
    province: '', area_type: '', household_income_band: '', school_type: '',
    school_province: '', gpa: '', intended_level: '', intended_field: '',
    birth_year: '', gender: '', monthly_income_thb: '', parent_education: '',
    household_size: '', class_rank_pct: '', disability_status: '',
    first_generation: null, preferred_scholarship_types: [],
  };

  it('is 0% for a fully blank form', () => {
    expect(computeCompleteness(blank)).toBe(0);
  });

  it('is 100% when every counted field is filled', () => {
    const full = {
      ...blank,
      province: 'ขอนแก่น', area_type: 'urban', household_income_band: '<100k',
      school_type: 'government', school_province: 'ขอนแก่น', gpa: '3.5',
      intended_level: 'bachelor', intended_field: 'engineering', birth_year: '2008',
      gender: 'female', monthly_income_thb: '15000', parent_education: 'primary',
      household_size: '4', class_rank_pct: '10', disability_status: 'none',
      first_generation: true, preferred_scholarship_types: ['full_ride'],
    };
    expect(computeCompleteness(full)).toBe(100);
  });

  it('increases monotonically as fields are filled in', () => {
    const one = computeCompleteness({ ...blank, province: 'ขอนแก่น' });
    const two = computeCompleteness({ ...blank, province: 'ขอนแก่น', gpa: '3.5' });
    expect(two).toBeGreaterThan(one);
    expect(one).toBeGreaterThan(0);
  });

  it('counts first_generation=false as answered, not blank', () => {
    expect(computeCompleteness({ ...blank, first_generation: false }))
      .toBeGreaterThan(computeCompleteness(blank));
  });
});
