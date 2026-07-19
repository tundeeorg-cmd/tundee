import { resolveName, resolveFunder, formatDeadline } from '../lib/tracker/display';
import type { TdScholarship } from '../lib/tdScholarships/types';

function baseScholarship(overrides: Partial<TdScholarship> = {}): TdScholarship {
  return {
    scholarship_id: 'TD-0001',
    scholarship_name_en: null,
    scholarship_name_th: null,
    funder_en: null,
    funder_th: null,
    source_language: null,
    translation_review: null,
    scholarship_name: '',
    funder: '',
    funder_type: null,
    level: null,
    field_of_study: null,
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
    status: null,
    verification_status: null,
    last_verified: null,
    verified_by: null,
    application_url: null,
    source_url: null,
    application_link: '',
    source: null,
    notes: null,
    application_open_date: null,
    is_displayed: true,
    display_reason: null,
    stale: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolveName', () => {
  it('prefers the Thai name in TH locale', () => {
    const s = baseScholarship({ scholarship_name_th: 'ทุนเอ', scholarship_name_en: 'Scholarship A' });
    expect(resolveName(s, 'th')).toBe('ทุนเอ');
  });

  it('prefers the English name in EN locale', () => {
    const s = baseScholarship({ scholarship_name_th: 'ทุนเอ', scholarship_name_en: 'Scholarship A' });
    expect(resolveName(s, 'en')).toBe('Scholarship A');
  });

  it('falls back to English when Thai name is missing (international scholarship)', () => {
    const s = baseScholarship({ scholarship_name_th: null, scholarship_name_en: 'Global Scholarship' });
    expect(resolveName(s, 'th')).toBe('Global Scholarship');
  });

  it('falls back to Thai when English name is missing', () => {
    const s = baseScholarship({ scholarship_name_th: 'ทุนไทย', scholarship_name_en: null });
    expect(resolveName(s, 'en')).toBe('ทุนไทย');
  });

  it('falls back to the deprecated legacy field as a last resort, never rendering empty', () => {
    const s = baseScholarship({ scholarship_name_th: null, scholarship_name_en: null, scholarship_name: 'Legacy Name' });
    expect(resolveName(s, 'th')).toBe('Legacy Name');
    expect(resolveName(s, 'en')).toBe('Legacy Name');
  });

  it('toggling locale changes the displayed name (switcher regression guard)', () => {
    const s = baseScholarship({ scholarship_name_th: 'ทุนเอ', scholarship_name_en: 'Scholarship A' });
    expect(resolveName(s, 'th')).not.toBe(resolveName(s, 'en'));
  });
});

describe('resolveFunder', () => {
  it('prefers Thai funder in TH locale and English in EN locale', () => {
    const s = baseScholarship({ funder_th: 'มหาวิทยาลัยเอ', funder_en: 'University A' });
    expect(resolveFunder(s, 'th')).toBe('มหาวิทยาลัยเอ');
    expect(resolveFunder(s, 'en')).toBe('University A');
  });

  it('falls back across locales and finally to the legacy field', () => {
    const s = baseScholarship({ funder_th: null, funder_en: null, funder: 'Legacy Funder' });
    expect(resolveFunder(s, 'th')).toBe('Legacy Funder');
  });
});

describe('formatDeadline', () => {
  it('localizes a rolling deadline', () => {
    const s = baseScholarship({ deadline_is_rolling: true });
    expect(formatDeadline(s, 'th').text).toBe('เปิดรับตลอด');
    expect(formatDeadline(s, 'en').text).toBe('Always open');
  });

  it('renders a Buddhist-era date in TH and Gregorian in EN for a far-future deadline', () => {
    const future = new Date();
    future.setDate(future.getDate() + 90);
    const iso = future.toISOString().slice(0, 10);
    const s = baseScholarship({ deadline_date: iso });
    expect(formatDeadline(s, 'th').color).toBe('gray');
    expect(formatDeadline(s, 'th').text).toMatch(/^\d{1,2}-[ก-๙.]+-\d{4}$/);
    expect(formatDeadline(s, 'en').text).toMatch(/^\d{1,2}-[A-Za-z]{3}-\d{4}$/);
  });

  it('flags an urgent (<=7 day) deadline in red with a days-left label', () => {
    const soon = new Date();
    soon.setHours(0, 0, 0, 0);
    soon.setDate(soon.getDate() + 3);
    const s = baseScholarship({ deadline_date: soon.toISOString().slice(0, 10) });
    const d = formatDeadline(s, 'en');
    expect(d.color).toBe('red');
    expect(d.daysLabel).toBe('3d left');
  });

  it('shows a prose deadline_note as-is', () => {
    const s = baseScholarship({ deadline_note: 'Contact university for dates' });
    expect(formatDeadline(s, 'en').text).toBe('Contact university for dates');
  });

  it('marks a past deadline as expired with no days label', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const s = baseScholarship({ deadline_date: past.toISOString().slice(0, 10) });
    const d = formatDeadline(s, 'th');
    expect(d.text).toBe('หมดเขตแล้ว');
    expect(d.daysLabel).toBeNull();
  });
});
