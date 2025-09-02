import { z } from 'zod';

export const bugReportSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(2000, 'Description must be less than 2000 characters'),
  steps_to_reproduce: z
    .string()
    .max(1000, 'Steps to reproduce must be less than 1000 characters')
    .optional(),
  images: z
    .array(z.string().url())
    .max(3, 'Maximum 3 images allowed')
    .optional(),
});

export type BugReportSchema = z.infer<typeof bugReportSchema>;
