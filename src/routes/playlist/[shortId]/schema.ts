import { PLAYLIST_TYPES } from "$lib/supabase/playlists";
import { z } from "zod";

export const playlistSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(100).nullable(),
  imageProperties: z
    .object({
      x: z.number(),
      y: z.number(),
      height: z.number(),
      width: z.number(),
    })
    .nullable(),
  id: z.number(),
  type: z.enum(PLAYLIST_TYPES).default("Private"),
  isDeletingPlaylistImage: z.boolean().default(false),
});

export type PlaylistSchema = typeof playlistSchema;
