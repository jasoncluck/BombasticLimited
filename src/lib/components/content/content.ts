import { SOURCES } from "$lib/constants/source";
import type { Database } from "$lib/supabase/database.types";
import type { Playlist } from "$lib/supabase/playlists";
import type { Video } from "$lib/supabase/videos";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  getFilterKeysForView,
  getSortKeysForView,
  isSortKey,
  isSortOrder,
  type PlaylistVideosFilter,
} from "./content-filter";
import { page } from "$app/state";
import { goto } from "$app/navigation";

export interface CarouselVideoDragInfo {
  readonly videoId: string;
  readonly videoThumbnailUrl: string;
}

export const CONTENT_DISPLAY = {
  CAROUSEL: "CAROUSEL",
  TILES: "TILES",
  TABLE: "TABLE",
} as const;

export type ContentView = "continueWatching" | "playlist" | "default";

export type ContentDisplay =
  (typeof CONTENT_DISPLAY)[keyof typeof CONTENT_DISPLAY];

export interface ContentDragInfo {
  readonly id: string;
  readonly thumbnailUrl: string;
}

export interface ContentDisplayProps {
  readonly videos: Video[];
  readonly videosCount?: number | null;
  readonly playlists: Playlist[];
  readonly isContinueVideos?: boolean;
  readonly playlist?: Playlist;
  readonly playlistContentFilter?: PlaylistVideosFilter;
  readonly supabase: SupabaseClient<Database>;
  readonly session: Session | null;
}

export const CONTENT_DIPSLAY = {
  FULL: "FULL",
  BRIEF: "BRIEF",
  NONE: "NONE",
} as const;

export type ContentDescription =
  (typeof CONTENT_DIPSLAY)[keyof typeof CONTENT_DIPSLAY];

// Key/Value mappings for landing page which has multiple Content components
export const sourceWithContinueStateKeys = [
  "continueWatching",
  ...SOURCES,
] as const;
export type SourceWithContinueStateKeys =
  (typeof sourceWithContinueStateKeys)[number];

export type CarouselState = { lastViewedIndex: number };
export type SourceWithContinueCarouselState = Record<
  SourceWithContinueStateKeys,
  CarouselState
>;

// TODO: Finish
export function handleContentNavigation({
  video,
  playlistShortId,
  playlistSortedBy,
  playlistSortOrder,
}: {
  video: Video;
  playlistShortId?: string | null;
  playlistSortedBy?: "title" | "datePublished" | "playlistOrder";
  playlistSortOrder?: "ascending" | "descending";
}) {
  const url = new URL(window.location.href);
  console.log(playlistSortedBy);

  const searchParams = url.searchParams;

  // Build the base URL path
  let targetPath = `/videos/${video.id}`;

  if (playlistShortId) {
    // Clear existing playlist sorting parameters
    getSortKeysForView("playlist").forEach((key) => {
      searchParams.delete(key);
    });

    if (
      isSortKey(playlistSortedBy, "playlist") &&
      isSortOrder(playlistSortOrder)
    ) {
      searchParams.set(playlistSortedBy, playlistSortOrder);
    }
    targetPath = `/playlist/${playlistShortId}/video/${video.id}`;
  }

  // Apply any existing search params to the new URL
  const newUrl = new URL(targetPath, window.location.origin);
  newUrl.search = searchParams.toString();

  goto(newUrl.toString(), {
    invalidate: ["supabase:db:videos"],
  });
}
