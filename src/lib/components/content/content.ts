import { SOURCES } from "$lib/constants/source";
import type { Database } from "$lib/supabase/database.types";
import { isUserPlaylist, type Playlist } from "$lib/supabase/playlists";
import { isVideoWithPlaylistTimestamp, type Video } from "$lib/supabase/videos";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  getSortKeysForView,
  isPlaylistVideosFilter,
  isSortKey,
  isSortOrder,
  type CombinedContentFilter,
  type PlaylistVideosFilter,
} from "./content-filter";
import { goto } from "$app/navigation";

export interface CarouselVideoDragInfo {
  readonly videoId: string;
  readonly videoThumbnailUrl: string;
}

export const CONTENT_DISPLAY = {
  CARD: "CARD",
  TABLE: "TABLE",
} as const;

export type ContentDisplay =
  (typeof CONTENT_DISPLAY)[keyof typeof CONTENT_DISPLAY];

export const TILES_DISPLAY = {
  CAROUSEL: "CAROUSEL",
  TILES: "TILES",
} as const;

export type TilesDisplay = (typeof TILES_DISPLAY)[keyof typeof TILES_DISPLAY];

export type ContentView = "continueWatching" | "playlist" | "default";

export type ContentSelectVariant = "header" | "item" | "list-items";

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
  readonly contentFilter: CombinedContentFilter;
  readonly playlistContentFilter?: PlaylistVideosFilter;
  readonly sectionId?: string;
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

export function handleContentNavigation({
  video,
  contentFilter,
  playlist,
}: {
  video: Video;
  contentFilter: CombinedContentFilter;
  playlist?: Playlist;
}) {
  const url = new URL(window.location.href);

  const searchParams = url.searchParams;

  // Build the base URL path
  let targetPath = `/video/${video.id}`;

  getSortKeysForView("playlist").forEach((key) => {
    searchParams.delete(key);
  });

  // First check to see if a playlist is already in progress with an active filter, if so use that
  if (playlist && contentFilter && isPlaylistVideosFilter(contentFilter)) {
    searchParams.set(contentFilter.sort.key, contentFilter.sort.order);
    targetPath = `/playlist/${playlist.short_id}/video/${video.id}`;
  }
  // Check to see if the playlist is specified and use those stored sort settings. If those don't exist
  // (i.e: we're not coming from a playlist), then use the video timestamp if it's available which should only be in the
  // continue watching views
  else if (playlist && isUserPlaylist(playlist)) {
    // Clear existing playlist sorting parameters

    if (
      isSortKey(playlist.sorted_by, "playlist") &&
      isSortOrder(playlist.sort_order)
    ) {
      searchParams.set(playlist.sorted_by, playlist.sort_order);
    }
    targetPath = `/playlist/${playlist.short_id}/video/${video.id}`;
  } else if (isVideoWithPlaylistTimestamp(video)) {
    if (
      isSortKey(video.playlist_sorted_by, "playlist") &&
      isSortOrder(video.playlist_sort_order)
    ) {
      searchParams.set(video.playlist_sorted_by, video.playlist_sort_order);
    }
    targetPath = `/playlist/${video.playlist_short_id}/video/${video.id}`;
  }

  // Apply any existing search params to the new URL
  const newUrl = new URL(targetPath, window.location.origin);
  newUrl.search = searchParams.toString();

  goto(newUrl.toString(), {
    invalidate: ["supabase:db:videos"],
  });
}
