import { z } from 'zod';

export const adminNotificationSchema = z.object({
  type: z.string().min(1, 'Type is required'),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  startDatetime: z.string().optional(),
  endDatetime: z.string().optional(),
  _action: z.string().optional(),
});

export type AdminNotificationSchema = typeof adminNotificationSchema;
