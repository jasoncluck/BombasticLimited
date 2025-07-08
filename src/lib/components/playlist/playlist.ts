import { goto } from "$app/navigation";
import type { Json } from "$lib/supabase/database.types";
import { type Playlist, isUserPlaylist } from "$lib/supabase/playlists";
import {
  type CombinedContentFilter,
  getSortKeysForView,
  isPlaylistVideosFilter,
  isSortKey,
  isSortOrder,
} from "../content/content-filter";

export interface ImageProperties extends Record<string, Json> {
  x: number;
  y: number;
  height: number;
  width: number;
}

export function handlePlaylistNavigation({
  playlist,
  contentFilter,
}: {
  playlist: Playlist;
  contentFilter?: CombinedContentFilter;
}) {
  const url = new URL(window.location.href);
  const searchParams = url.searchParams;

  // Build the base URL path
  const targetPath = `/playlist/${playlist.short_id}`;

  // Clear existing playlist sorting parameters
  getSortKeysForView("playlist").forEach((key) => {
    searchParams.delete(key);
  });

  // First check if there's an active content filter for playlist videos
  if (contentFilter && isPlaylistVideosFilter(contentFilter)) {
    searchParams.set(contentFilter.sort.key, contentFilter.sort.order);
  }
  // Check if the playlist has stored sort settings
  else if (isUserPlaylist(playlist)) {
    if (
      isSortKey(playlist.sorted_by, "playlist") &&
      isSortOrder(playlist.sort_order)
    ) {
      searchParams.set(playlist.sorted_by, playlist.sort_order);
    }
  }

  // Navigate to the playlist page with updated search parameters
  const targetUrl = `${targetPath}?${searchParams.toString()}`;
  goto(targetUrl);
}

export function parseImageProperties(jsonb: Json): ImageProperties | null {
  if (!jsonb) return null;

  try {
    // Handle if it's already an object
    const obj = typeof jsonb === "string" ? JSON.parse(jsonb) : jsonb;

    if (
      obj &&
      typeof obj === "object" &&
      typeof obj.x === "number" &&
      typeof obj.y === "number" &&
      typeof obj.height === "number" &&
      typeof obj.width === "number"
    ) {
      return obj as ImageProperties;
    }

    return null;
  } catch {
    return null;
  }
}

export function serializeImageProperties(props: ImageProperties | null): Json {
  return props;
}
