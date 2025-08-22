import type { NotificationType } from '$lib/supabase/notifications';
import { z } from 'zod';

const NOTIFICATION_TYPES = [
  'system',
] as const satisfies readonly NotificationType[];

export const adminNotificationSchema = z
  .object({
    type: z.enum(NOTIFICATION_TYPES, {
      errorMap: () => ({ message: 'Please select a valid notification type' }),
    }),
    title: z.string().min(1, 'Title is required'),
    message: z.string().min(1, 'Message is required'),
    startDatetime: z.string().optional(),
    endDatetime: z.string().optional(),
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

      // Check if start date is valid
      if (isNaN(startDate.getTime())) {
        return false;
      }

      // Check if end date is valid
      if (isNaN(endDate.getTime())) {
        return false;
      }

      return true;
    },
    {
      message: 'Invalid date format provided',
      path: ['startDatetime'],
    }
  )
  .refine(
    (data) => {
      // Only validate if both dates are provided and valid
      if (!data.startDatetime || !data.endDatetime) {
        return true;
      }

      const startDate = new Date(data.startDatetime);
      const endDate = new Date(data.endDatetime);

      // Skip if dates are invalid (handled by previous refine)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return true;
      }

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
      // Additional validation: ensure start date is not in the past (optional)
      if (!data.startDatetime) {
        return true;
      }

      const startDate = new Date(data.startDatetime);
      const now = new Date(); // Use current time instead of hardcoded date

      // Skip if start date is invalid
      if (isNaN(startDate.getTime())) {
        return true;
      }

      // Allow scheduling notifications in the past for testing/admin purposes
      // Remove this refinement if you want to allow past dates
      return startDate >= now;
    },
    {
      message: 'Start date cannot be in the past',
      path: ['startDatetime'],
    }
  );

export type AdminNotificationSchema = z.infer<typeof adminNotificationSchema>;
