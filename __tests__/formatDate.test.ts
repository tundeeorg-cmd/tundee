import { formatUserDate } from '../lib/formatDate';

describe('formatUserDate', () => {
  describe('EN locale', () => {
    it('formats a mid-year date', () => {
      expect(formatUserDate('2026-07-31', 'en')).toBe('31-Jul-2026');
    });
    it('formats a January date', () => {
      expect(formatUserDate('2026-01-01', 'en')).toBe('1-Jan-2026');
    });
    it('formats a December date', () => {
      expect(formatUserDate('2026-12-25', 'en')).toBe('25-Dec-2026');
    });
    it('does not shift date due to timezone', () => {
      // '2026-07-31' must parse as UTC, not local midnight
      expect(formatUserDate('2026-07-31', 'en')).toBe('31-Jul-2026');
    });
  });

  describe('TH locale', () => {
    it('renders Buddhist Era year (Gregorian + 543)', () => {
      expect(formatUserDate('2026-07-31', 'th')).toBe('31-ก.ค.-2569');
    });
    it('uses Thai abbreviated month for January', () => {
      expect(formatUserDate('2026-01-15', 'th')).toBe('15-ม.ค.-2569');
    });
    it('uses Thai abbreviated month for December', () => {
      expect(formatUserDate('2025-12-05', 'th')).toBe('5-ธ.ค.-2568');
    });
    it('handles all 12 Thai months', () => {
      const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      months.forEach((abbr, i) => {
        const mm = String(i + 1).padStart(2, '0');
        const result = formatUserDate(`2026-${mm}-01`, 'th');
        expect(result).toBe(`1-${abbr}-2569`);
      });
    });
  });
});
