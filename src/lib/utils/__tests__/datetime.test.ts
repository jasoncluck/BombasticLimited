import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDateTime,
  formatDateTimeShort,
  formatDateTimeReadable,
  getCurrentLocalDateTime,
  utcToLocalDateTime,
  localToUtcDateTime,
  getTimezoneInfo,
  convertLocalToUTC,
  convertUTCToLocal,
  formatDateWithTimezone,
  isInPast,
  isInFuture,
  addMinutes,
  addHours,
  addDays,
} from '../datetime';

describe('datetime utilities', () => {
  // Mock Date to have consistent tests
  const mockDate = new Date('2024-01-15T10:30:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatDateTime', () => {
    it('should format valid datetime string', () => {
      const result = formatDateTime('2024-01-15T10:30:00.000Z');
      expect(result).toMatch(/2024/);
      expect(result).toMatch(/15/);
    });

    it('should return "N/A" for null input', () => {
      expect(formatDateTime(null)).toBe('N/A');
    });

    it('should return "Invalid Date" for invalid input', () => {
      expect(formatDateTime('invalid-date')).toBe('Invalid Date');
    });

    it('should handle empty string', () => {
      expect(formatDateTime('')).toBe('N/A');
    });
  });

  describe('formatDateTimeShort', () => {
    it('should format valid datetime string to date only', () => {
      const result = formatDateTimeShort('2024-01-15T10:30:00.000Z');
      expect(result).toMatch(/2024/);
      expect(result).toMatch(/15/);
      // Should not contain time information like hours/minutes
      expect(result).not.toMatch(/10:30/);
    });

    it('should return "N/A" for null input', () => {
      expect(formatDateTimeShort(null)).toBe('N/A');
    });

    it('should return "Invalid Date" for invalid input', () => {
      const result = formatDateTimeShort('invalid-date');
      expect(result).toBe('Invalid Date');
    });
  });

  describe('formatDateTimeReadable', () => {
    it('should format valid datetime string in readable format', () => {
      const result = formatDateTimeReadable('2024-01-15T10:30:00.000Z');
      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/15/);
      expect(result).toMatch(/2024/);
      expect(result).toMatch(/AM|PM/);
    });

    it('should return "N/A" for null input', () => {
      expect(formatDateTimeReadable(null)).toBe('N/A');
    });

    it('should return "Invalid Date" for invalid input', () => {
      expect(formatDateTimeReadable('invalid-date')).toBe('Invalid Date');
    });
  });

  describe('getCurrentLocalDateTime', () => {
    it('should return datetime string in correct format', () => {
      const result = getCurrentLocalDateTime();
      // Should match format "YYYY-MM-DDTHH:MM"
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('should handle timezone offset correctly', () => {
      const result = getCurrentLocalDateTime();
      expect(result).toBeTruthy();
      expect(result.length).toBe(16); // "YYYY-MM-DDTHH:MM" is 16 characters
    });
  });

  describe('utcToLocalDateTime', () => {
    it('should convert UTC string to local datetime format', () => {
      const result = utcToLocalDateTime('2024-01-15T10:30:00.000Z');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(result).toBeTruthy();
    });

    it('should return empty string for null input', () => {
      expect(utcToLocalDateTime(null)).toBe('');
    });

    it('should return empty string for invalid input', () => {
      expect(utcToLocalDateTime('invalid-date')).toBe('');
    });

    it('should handle empty string', () => {
      expect(utcToLocalDateTime('')).toBe('');
    });
  });

  describe('localToUtcDateTime', () => {
    it('should convert local datetime to UTC ISO string', () => {
      const result = localToUtcDateTime('2024-01-15T10:30');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result).toMatch(/2024-01-15/);
    });

    it('should return empty string for empty input', () => {
      expect(localToUtcDateTime('')).toBe('');
    });

    it('should return empty string for invalid input', () => {
      expect(localToUtcDateTime('invalid-date')).toBe('');
    });
  });

  describe('getTimezoneInfo', () => {
    it('should return timezone information object', () => {
      const result = getTimezoneInfo();

      expect(result).toHaveProperty('timezoneName');
      expect(result).toHaveProperty('abbreviation');
      expect(result).toHaveProperty('offset');
      expect(result).toHaveProperty('offsetMinutes');

      expect(typeof result.timezoneName).toBe('string');
      expect(typeof result.abbreviation).toBe('string');
      expect(typeof result.offset).toBe('string');
      expect(typeof result.offsetMinutes).toBe('number');
    });

    it('should return consistent timezone offset', () => {
      const result = getTimezoneInfo();
      // Timezone offset should be a valid number
      expect(Number.isFinite(result.offsetMinutes)).toBe(true);
    });

    it('should return valid offset format', () => {
      const result = getTimezoneInfo();
      // Offset should be in format ±HH:MM
      expect(result.offset).toMatch(/^[+-]\d{2}:\d{2}$/);
    });
  });

  describe('convertLocalToUTC (alias)', () => {
    it('should work as alias for localToUtcDateTime', () => {
      const input = '2024-01-15T10:30';
      const result1 = convertLocalToUTC(input);
      const result2 = localToUtcDateTime(input);
      expect(result1).toBe(result2);
    });
  });

  describe('convertUTCToLocal (alias)', () => {
    it('should work as alias for utcToLocalDateTime', () => {
      const input = '2024-01-15T10:30:00.000Z';
      const result1 = convertUTCToLocal(input);
      const result2 = utcToLocalDateTime(input);
      expect(result1).toBe(result2);
    });
  });

  describe('formatDateWithTimezone', () => {
    it('should format Date object with timezone information', () => {
      const testDate = new Date('2024-01-15T10:30:00.000Z');
      const result = formatDateWithTimezone(testDate);

      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/15/);
      expect(result).toMatch(/2024/);
      expect(result).toMatch(/AM|PM/);
    });

    it('should format date string with timezone information', () => {
      const result = formatDateWithTimezone('2024-01-15T10:30:00.000Z');

      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/15/);
      expect(result).toMatch(/2024/);
      expect(result).toMatch(/AM|PM/);
    });

    it('should include seconds when requested', () => {
      const testDate = new Date('2024-01-15T10:30:45.000Z');
      const result = formatDateWithTimezone(testDate, true);

      expect(result).toMatch(/45/); // Should include seconds
    });

    it('should return "Invalid Date" for invalid input', () => {
      expect(formatDateWithTimezone('invalid-date')).toBe('Invalid Date');
    });
  });

  describe('isInPast', () => {
    it('should return true for past dates', () => {
      const pastDate = '2024-01-14T10:30:00.000Z'; // One day before mock date
      expect(isInPast(pastDate)).toBe(true);
    });

    it('should return false for future dates', () => {
      const futureDate = '2024-01-16T10:30:00.000Z'; // One day after mock date
      expect(isInPast(futureDate)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isInPast('')).toBe(false);
    });

    it('should return false for invalid date', () => {
      expect(isInPast('invalid-date')).toBe(false);
    });
  });

  describe('isInFuture', () => {
    it('should return true for future dates', () => {
      const futureDate = '2024-01-16T10:30:00.000Z'; // One day after mock date
      expect(isInFuture(futureDate)).toBe(true);
    });

    it('should return false for past dates', () => {
      const pastDate = '2024-01-14T10:30:00.000Z'; // One day before mock date
      expect(isInFuture(pastDate)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isInFuture('')).toBe(false);
    });

    it('should return false for invalid date', () => {
      expect(isInFuture('invalid-date')).toBe(false);
    });
  });

  describe('addMinutes', () => {
    it('should add minutes to datetime string', () => {
      const result = addMinutes('2024-01-15T10:30:00.000Z', 30);
      expect(result).toBe('2024-01-15T11:00:00.000Z');
    });

    it('should handle negative minutes (subtract)', () => {
      const result = addMinutes('2024-01-15T10:30:00.000Z', -30);
      expect(result).toBe('2024-01-15T10:00:00.000Z');
    });

    it('should return empty string for empty input', () => {
      expect(addMinutes('', 30)).toBe('');
    });

    it('should return empty string for invalid input', () => {
      expect(addMinutes('invalid-date', 30)).toBe('');
    });
  });

  describe('addHours', () => {
    it('should add hours to datetime string', () => {
      const result = addHours('2024-01-15T10:30:00.000Z', 2);
      expect(result).toBe('2024-01-15T12:30:00.000Z');
    });

    it('should handle negative hours (subtract)', () => {
      const result = addHours('2024-01-15T10:30:00.000Z', -2);
      expect(result).toBe('2024-01-15T08:30:00.000Z');
    });

    it('should return empty string for empty input', () => {
      expect(addHours('', 2)).toBe('');
    });

    it('should return empty string for invalid input', () => {
      expect(addHours('invalid-date', 2)).toBe('');
    });
  });

  describe('addDays', () => {
    it('should add days to datetime string', () => {
      const result = addDays('2024-01-15T10:30:00.000Z', 1);
      expect(result).toBe('2024-01-16T10:30:00.000Z');
    });

    it('should handle negative days (subtract)', () => {
      const result = addDays('2024-01-15T10:30:00.000Z', -1);
      expect(result).toBe('2024-01-14T10:30:00.000Z');
    });

    it('should handle month boundaries', () => {
      const result = addDays('2024-01-31T10:30:00.000Z', 1);
      expect(result).toBe('2024-02-01T10:30:00.000Z');
    });

    it('should handle leap years', () => {
      const result = addDays('2024-02-28T10:30:00.000Z', 1);
      expect(result).toBe('2024-02-29T10:30:00.000Z'); // 2024 is a leap year
    });

    it('should return empty string for empty input', () => {
      expect(addDays('', 1)).toBe('');
    });

    it('should return empty string for invalid input', () => {
      expect(addDays('invalid-date', 1)).toBe('');
    });
  });

  describe('round trip conversion', () => {
    it('should maintain consistency when converting local to UTC and back', () => {
      const originalLocal = '2024-01-15T10:30';
      const utc = localToUtcDateTime(originalLocal);
      const backToLocal = utcToLocalDateTime(utc);

      expect(backToLocal).toBe(originalLocal);
    });

    it('should handle edge cases in conversion', () => {
      const edgeCases = [
        '2024-01-01T00:00', // Start of year
        '2024-12-31T23:59', // End of year
        '2024-02-29T12:00', // Leap year
      ];

      edgeCases.forEach((localTime) => {
        const utc = localToUtcDateTime(localTime);
        const backToLocal = utcToLocalDateTime(utc);
        expect(backToLocal).toBe(localTime);
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle various datetime formats gracefully', () => {
      const testFunctions = [
        (input: string) => formatDateTime(input),
        (input: string) => formatDateTimeShort(input),
        (input: string) => formatDateTimeReadable(input),
        (input: string) => formatDateWithTimezone(input),
        (input: string) => isInPast(input),
        (input: string) => isInFuture(input),
      ];

      const invalidInputs = [
        '',
        'invalid-date',
        'not-a-date',
        '2024-13-32T25:61:61.000Z', // Invalid date components
      ];

      testFunctions.forEach((fn) => {
        invalidInputs.forEach((input) => {
          expect(() => fn(input)).not.toThrow();
        });
      });
    });

    it('should handle boundary dates correctly', () => {
      const boundaryDates = [
        '1970-01-01T00:00:00.000Z', // Unix epoch
        '2038-01-19T03:14:07.000Z', // Y2038 problem
        '2000-02-29T12:00:00.000Z', // Leap year
        '1900-02-28T12:00:00.000Z', // Non-leap year
      ];

      boundaryDates.forEach((date) => {
        expect(() => formatDateTime(date)).not.toThrow();
        expect(() => formatDateWithTimezone(date)).not.toThrow();
        expect(() => isInPast(date)).not.toThrow();
        expect(() => isInFuture(date)).not.toThrow();
        expect(() => addDays(date, 1)).not.toThrow();
      });
    });

    it('should handle timezone information consistently', () => {
      const info1 = getTimezoneInfo();
      const info2 = getTimezoneInfo();

      expect(info1.timezoneName).toBe(info2.timezoneName);
      expect(info1.offsetMinutes).toBe(info2.offsetMinutes);
      expect(info1.offset).toBe(info2.offset);
    });
  });
});
