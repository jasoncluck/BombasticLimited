import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  adminNotificationSchema,
  type AdminNotificationSchema,
} from '../admin-notification-schema';

describe('adminNotificationSchema', () => {
  // Mock the current time for consistent testing
  let mockNow: Date;

  beforeEach(() => {
    mockNow = new Date('2024-01-15T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('valid data', () => {
    it('should parse valid notification with minimal fields', () => {
      const validData = {
        type: 'system' as const,
        title: 'System Notification',
        message: 'This is a system message',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result).toEqual({
        type: 'system',
        title: 'System Notification',
        message: 'This is a system message',
        startDatetime: undefined,
        endDatetime: undefined,
        _action: undefined,
      });
    });

    it('should parse valid notification with all fields', () => {
      const validData = {
        type: 'system' as const,
        title: 'Scheduled Notification',
        message: 'This is a scheduled message',
        startDatetime: '2024-01-16T12:00:00Z',
        endDatetime: '2024-01-17T12:00:00Z',
        _action: 'create',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should accept valid future dates', () => {
      const validData = {
        type: 'system' as const,
        title: 'Future Notification',
        message: 'Future message',
        startDatetime: '2024-01-16T14:00:00Z', // 2 hours after mock time
        endDatetime: '2024-01-17T14:00:00Z',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBe('2024-01-16T14:00:00Z');
      expect(result.endDatetime).toBe('2024-01-17T14:00:00Z');
    });

    it('should accept start date without end date', () => {
      const validData = {
        type: 'system' as const,
        title: 'Open-ended Notification',
        message: 'This notification has no end date',
        startDatetime: '2024-01-16T12:00:00Z',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBe('2024-01-16T12:00:00Z');
      expect(result.endDatetime).toBeUndefined();
    });

    it('should accept end date without start date', () => {
      const validData = {
        type: 'system' as const,
        title: 'Ending Notification',
        message: 'This notification ends at a specific time',
        endDatetime: '2024-01-17T12:00:00Z',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBeUndefined();
      expect(result.endDatetime).toBe('2024-01-17T12:00:00Z');
    });

    it('should accept various action types', () => {
      const validData = {
        type: 'system' as const,
        title: 'Action Notification',
        message: 'This has an action',
        _action: 'update',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result._action).toBe('update');
    });
  });

  describe('type validation', () => {
    it('should accept system type', () => {
      const validData = {
        type: 'system' as const,
        title: 'System Message',
        message: 'System notification',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.type).toBe('system');
    });

    it('should reject invalid notification type', () => {
      const invalidData = {
        type: 'invalid' as any,
        title: 'Invalid Type',
        message: 'This should fail',
      };

      expect(() => adminNotificationSchema.parse(invalidData)).toThrow(
        'Please select a valid notification type'
      );
    });

    it('should reject missing type', () => {
      const invalidData = {
        title: 'Missing Type',
        message: 'This should fail',
      };

      expect(() => adminNotificationSchema.parse(invalidData)).toThrow();
    });

    it('should reject null type', () => {
      const invalidData = {
        type: null as any,
        title: 'Null Type',
        message: 'This should fail',
      };

      expect(() => adminNotificationSchema.parse(invalidData)).toThrow();
    });
  });

  describe('title validation', () => {
    it('should reject empty title', () => {
      const invalidData = {
        type: 'system' as const,
        title: '',
        message: 'Valid message',
      };

      expect(() => adminNotificationSchema.parse(invalidData)).toThrow(
        'Title is required'
      );
    });

    it('should accept whitespace-only title (not trimmed)', () => {
      const validData = {
        type: 'system' as const,
        title: '   ',
        message: 'Valid message',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.title).toBe('   ');
    });

    it('should reject missing title', () => {
      const invalidData = {
        type: 'system' as const,
        message: 'Valid message',
      };

      expect(() => adminNotificationSchema.parse(invalidData)).toThrow();
    });

    it('should accept single character title', () => {
      const validData = {
        type: 'system' as const,
        title: 'A',
        message: 'Valid message',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.title).toBe('A');
    });

    it('should accept long title', () => {
      const longTitle = 'A'.repeat(1000);
      const validData = {
        type: 'system' as const,
        title: longTitle,
        message: 'Valid message',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.title).toBe(longTitle);
    });
  });

  describe('message validation', () => {
    it('should reject empty message', () => {
      const invalidData = {
        type: 'system' as const,
        title: 'Valid title',
        message: '',
      };

      expect(() => adminNotificationSchema.parse(invalidData)).toThrow(
        'Message is required'
      );
    });

    it('should accept whitespace-only message (not trimmed)', () => {
      const invalidData = {
        type: 'system' as const,
        title: 'Valid title',
        message: '   ',
      };

      const result = adminNotificationSchema.parse(invalidData);
      expect(result.message).toBe('   ');
    });

    it('should reject missing message', () => {
      const invalidData = {
        type: 'system' as const,
        title: 'Valid title',
      };

      expect(() => adminNotificationSchema.parse(invalidData)).toThrow();
    });

    it('should accept single character message', () => {
      const validData = {
        type: 'system' as const,
        title: 'Valid title',
        message: 'A',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.message).toBe('A');
    });

    it('should accept long message', () => {
      const longMessage = 'A'.repeat(1000);
      const validData = {
        type: 'system' as const,
        title: 'Valid title',
        message: longMessage,
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.message).toBe(longMessage);
    });

    it('should accept message with special characters and formatting', () => {
      const specialMessage =
        'Alert! 🚨 System will be down from 2-4 PM.\n\nPlease save your work.';
      const validData = {
        type: 'system' as const,
        title: 'Maintenance Alert',
        message: specialMessage,
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.message).toBe(specialMessage);
    });
  });

  describe('datetime validation', () => {
    it('should accept valid ISO date strings', () => {
      const validData = {
        type: 'system' as const,
        title: 'Scheduled Notification',
        message: 'Message',
        startDatetime: '2024-01-16T12:00:00Z',
        endDatetime: '2024-01-17T12:00:00Z',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBe('2024-01-16T12:00:00Z');
      expect(result.endDatetime).toBe('2024-01-17T12:00:00Z');
    });

    it('should accept valid date strings without timezone', () => {
      const validData = {
        type: 'system' as const,
        title: 'Scheduled Notification',
        message: 'Message',
        startDatetime: '2024-01-16T12:00:00',
        endDatetime: '2024-01-17T12:00:00',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBe('2024-01-16T12:00:00');
      expect(result.endDatetime).toBe('2024-01-17T12:00:00');
    });

    it('should reject invalid date format', () => {
      const invalidData = {
        type: 'system' as const,
        title: 'Invalid Date',
        message: 'Message',
        startDatetime: 'not-a-date',
        endDatetime: '2024-01-17T12:00:00Z',
      };

      const result = adminNotificationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);

      if (!result.success) {
        const startDatetimeIssue = result.error.issues.find((issue) =>
          issue.path.includes('startDatetime')
        );
        expect(startDatetimeIssue?.message).toBe('Invalid datetime format');
      }
    });

    it('should reject invalid end date format', () => {
      const invalidData = {
        type: 'system' as const,
        title: 'Invalid End Date',
        message: 'Message',
        startDatetime: '2024-01-16T12:00:00Z',
        endDatetime: 'invalid-date',
      };

      const result = adminNotificationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);

      if (!result.success) {
        const endDatetimeIssue = result.error.issues.find((issue) =>
          issue.path.includes('endDatetime')
        );
        expect(endDatetimeIssue?.message).toBe('Invalid datetime format');
      }
    });

    it('should reject end date before start date', () => {
      const invalidData = {
        type: 'system' as const,
        title: 'Wrong Order',
        message: 'Message',
        startDatetime: '2024-01-17T12:00:00Z',
        endDatetime: '2024-01-16T12:00:00Z', // before start
      };

      expect(() => adminNotificationSchema.parse(invalidData)).toThrow(
        'End date must be after start date'
      );
    });

    it('should reject start date in the past', () => {
      const invalidData = {
        type: 'system' as const,
        title: 'Past Date',
        message: 'Message',
        startDatetime: '2024-01-13T11:59:00Z', // more than 24 hours before mock current time
      };

      const result = adminNotificationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);

      if (!result.success) {
        const startDatetimeIssue = result.error.issues.find((issue) =>
          issue.path.includes('startDatetime')
        );
        expect(startDatetimeIssue?.message).toBe(
          'Start date cannot be more than 24 hours in the past'
        );
      }
    });

    it('should accept start date exactly at current time', () => {
      const validData = {
        type: 'system' as const,
        title: 'Current Time',
        message: 'Message',
        startDatetime: '2024-01-15T12:00:00Z', // exactly current mock time
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBe('2024-01-15T12:00:00Z');
    });

    it('should accept only start date without validation issues', () => {
      const validData = {
        type: 'system' as const,
        title: 'Only Start',
        message: 'Message',
        startDatetime: '2024-01-16T12:00:00Z',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBe('2024-01-16T12:00:00Z');
      expect(result.endDatetime).toBeUndefined();
    });

    it('should accept only end date without validation issues', () => {
      const validData = {
        type: 'system' as const,
        title: 'Only End',
        message: 'Message',
        endDatetime: '2024-01-17T12:00:00Z',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBeUndefined();
      expect(result.endDatetime).toBe('2024-01-17T12:00:00Z');
    });
  });

  describe('optional fields', () => {
    it('should accept undefined startDatetime', () => {
      const validData = {
        type: 'system' as const,
        title: 'No Start',
        message: 'Message',
        startDatetime: undefined,
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBeUndefined();
    });

    it('should accept undefined endDatetime', () => {
      const validData = {
        type: 'system' as const,
        title: 'No End',
        message: 'Message',
        endDatetime: undefined,
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.endDatetime).toBeUndefined();
    });

    it('should accept undefined _action', () => {
      const validData = {
        type: 'system' as const,
        title: 'No Action',
        message: 'Message',
        _action: undefined,
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result._action).toBeUndefined();
    });

    it('should accept empty string for _action', () => {
      const validData = {
        type: 'system' as const,
        title: 'Empty Action',
        message: 'Message',
        _action: '',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result._action).toBe('');
    });
  });

  describe('edge cases and comprehensive validation', () => {
    it('should handle complex date scenarios', () => {
      const validData = {
        type: 'system' as const,
        title: 'Complex Dates',
        message: 'Message',
        startDatetime: '2024-01-16T00:00:00.000Z',
        endDatetime: '2024-01-16T23:59:59.999Z',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBe('2024-01-16T00:00:00.000Z');
      expect(result.endDatetime).toBe('2024-01-16T23:59:59.999Z');
    });

    it('should handle millisecond precision in dates', () => {
      const validData = {
        type: 'system' as const,
        title: 'Precise Timing',
        message: 'Message',
        startDatetime: '2024-01-16T12:30:45.123Z',
        endDatetime: '2024-01-16T12:30:45.124Z', // 1ms later
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.startDatetime).toBe('2024-01-16T12:30:45.123Z');
      expect(result.endDatetime).toBe('2024-01-16T12:30:45.124Z');
    });

    it('should handle unicode characters in title and message', () => {
      const validData = {
        type: 'system' as const,
        title: '系统通知 🔔',
        message: 'Système sera en maintenance 🛠️',
        _action: 'créer',
      };

      const result = adminNotificationSchema.parse(validData);
      expect(result.title).toContain('🔔');
      expect(result.message).toContain('🛠️');
      expect(result._action).toBe('créer');
    });

    it('should reject equal start and end dates', () => {
      const invalidData = {
        type: 'system' as const,
        title: 'Same Dates',
        message: 'Message',
        startDatetime: '2024-01-16T12:00:00Z',
        endDatetime: '2024-01-16T12:00:00Z', // exactly same time
      };

      expect(() => adminNotificationSchema.parse(invalidData)).toThrow(
        'End date must be after start date'
      );
    });
  });

  describe('type inference', () => {
    it('should infer correct TypeScript type', () => {
      const data: AdminNotificationSchema = {
        type: 'system',
        title: 'Test',
        message: 'Message',
        startDatetime: '2024-01-16T12:00:00Z',
        endDatetime: '2024-01-17T12:00:00Z',
        _action: 'create',
      };

      // This should compile without errors, testing type inference
      expect(typeof data.type).toBe('string');
      expect(typeof data.title).toBe('string');
      expect(typeof data.message).toBe('string');
      expect(data.startDatetime).toBeDefined();
      expect(data.endDatetime).toBeDefined();
      expect(data._action).toBeDefined();
    });

    it('should allow optional fields to be undefined in type', () => {
      const data: AdminNotificationSchema = {
        type: 'system',
        title: 'Test',
        message: 'Message',
        // Optional fields can be omitted
      };

      expect(data.startDatetime).toBeUndefined();
      expect(data.endDatetime).toBeUndefined();
      expect(data._action).toBeUndefined();
    });
  });
});
