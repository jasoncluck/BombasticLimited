import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDateTime,
  formatDateTimeShort,
  formatDateTimeReadable,
  getCurrentLocalDateTime,
  utcToLocalDateTime,
  localToUtcDateTime,
  getTimezoneInfo,
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
      // Note: new Date('invalid-date') returns Invalid Date, not throwing
      const result = formatDateTimeShort('invalid-date');
      expect(result).toMatch(/Invalid/);
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
      
      expect(result).toHaveProperty('localTime');
      expect(result).toHaveProperty('utcTime');
      expect(result).toHaveProperty('timezoneOffset');
      expect(result).toHaveProperty('timezoneName');
      
      expect(typeof result.localTime).toBe('string');
      expect(typeof result.utcTime).toBe('string');
      expect(typeof result.timezoneOffset).toBe('number');
      expect(typeof result.timezoneName).toBe('string');
    });

    it('should return consistent timezone offset', () => {
      const result = getTimezoneInfo();
      // Timezone offset should be a valid number
      expect(Number.isFinite(result.timezoneOffset)).toBe(true);
    });

    it('should return valid UTC time format', () => {
      const result = getTimezoneInfo();
      // UTC time should be in ISO format
      expect(result.utcTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle various date formats gracefully', () => {
      const validFormats = [
        '2024-01-15T10:30:00.000Z',
        '2024-01-15T10:30:00Z',
        '2024-01-15 10:30:00',
        '2024/01/15',
      ];

      validFormats.forEach(format => {
        expect(() => formatDateTime(format)).not.toThrow();
        expect(() => formatDateTimeShort(format)).not.toThrow();
        expect(() => formatDateTimeReadable(format)).not.toThrow();
      });
    });

    it('should handle boundary dates', () => {
      const boundaryDates = [
        '1970-01-01T00:00:00.000Z', // Unix epoch
        '2038-01-19T03:14:07.000Z', // Y2038 problem
        '2000-02-29T12:00:00.000Z', // Leap year
      ];

      boundaryDates.forEach(date => {
        expect(formatDateTime(date)).not.toBe('Invalid Date');
        expect(formatDateTimeShort(date)).not.toBe('Invalid');
        expect(formatDateTimeReadable(date)).not.toBe('Invalid Date');
      });
    });
  });
});