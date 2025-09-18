import type { NotificationType } from '$lib/supabase/notifications';
import { z } from 'zod';

const NOTIFICATION_TYPES = [
  'system',
] as const satisfies readonly NotificationType[];

// Custom datetime validation that handles both local datetime-local format and ISO strings
const datetimeString = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value) return true; // Optional field

      // Try to parse as Date - handles both datetime-local format and ISO strings
      const date = new Date(value);
      return !isNaN(date.getTime());
    },
    {
      message: 'Invalid datetime format',
    }
  );

export const adminNotificationSchema = z
  .object({
    type: z.enum(NOTIFICATION_TYPES, {
      errorMap: () => ({ message: 'Please select a valid notification type' }),
    }),
    title: z.string().min(1, 'Title is required'),
    message: z.string().min(1, 'Message is required'),
    startDatetime: datetimeString,
    endDatetime: datetimeString,
    _action: z.string().optional(),
  })
  .refine(
    (data) => {
      // Only validate if both dates are provided
      if (!data.startDatetime || !data.endDatetime) {
        return true;
      }

      const startDate = new Date(data.startDatetime);
      const endDate = new Date(data.endDatetime);

      // Ensure start date is before end date
      return startDate < endDate;
    },
    {
      message: 'End date must be after start date',
      path: ['endDatetime'],
    }
  )
  .refine(
    (data) => {
      // Optional validation: ensure start date is not too far in the past
      if (!data.startDatetime) {
        return true;
      }

      const startDate = new Date(data.startDatetime);
      const now = new Date();

      // Allow start dates up to 24 hours in the past for admin flexibility
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      return startDate >= twentyFourHoursAgo;
    },
    {
      message: 'Start date cannot be more than 24 hours in the past',
      path: ['startDatetime'],
    }
  );

export type AdminNotificationSchema = z.infer<typeof adminNotificationSchema>;
