import { PLAYLIST_TYPES } from '$lib/supabase/playlists';
import { z } from 'zod';

// Define the expected structure of your image properties
const imagePropertiesSchema = z.object({
  x: z.number(),
  y: z.number(),
  height: z.number(),
  width: z.number(),
});

// Create a schema that properly handles JSONB
const jsonbImagePropertiesSchema = z
  .unknown()
  .nullable()
  .transform((val, ctx) => {
    if (val === null || val === undefined) {
      return null;
    }

    // If it's already parsed (object), validate it
    if (typeof val === 'object') {
      const result = imagePropertiesSchema.safeParse(val);
      if (result.success) {
        return result.data;
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid image properties object structure',
        });
        return z.NEVER;
      }
    }

    // If it's a string, parse then validate
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        const result = imagePropertiesSchema.safeParse(parsed);
        if (result.success) {
          return result.data;
        } else {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid image properties format after parsing',
          });
          return z.NEVER;
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid JSON string in image_properties',
        });
        return z.NEVER;
      }
    }

    // Any other type is invalid
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'image_properties must be null, object, or JSON string',
    });
    return z.NEVER;
  });

export const playlistSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(250).nullable(),
  image_properties: jsonbImagePropertiesSchema.default(null),
  id: z.number(),
  type: z.enum(PLAYLIST_TYPES),
  isDeletingPlaylistImage: z.boolean(),
  thumbnail_url: z.string().nullable().default(null),
});

export type PlaylistSchema = z.infer<typeof playlistSchema>;
