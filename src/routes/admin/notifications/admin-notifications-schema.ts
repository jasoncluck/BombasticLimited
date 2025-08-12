import type { NotificationType } from '$lib/supabase/notifications';
import { z } from 'zod';

const NOTIFICATION_TYPES = [
  'system',
  'playlist_update',
] as const satisfies readonly NotificationType[];

export const adminNotificationSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES, {
    errorMap: () => ({ message: 'Please select a valid notification type' }),
  }),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  startDatetime: z.string().optional(),
  endDatetime: z.string().optional(),
  _action: z.string().optional(),
});

export type AdminNotificationSchema = typeof adminNotificationSchema;
