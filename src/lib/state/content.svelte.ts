import type { Video } from "$lib/supabase/videos";
import { getContext, setContext } from "svelte";

// Define the drag content type
export type DragContentType = "video" | "playlist" | null;

export interface ContentState {
  selectedVideos: Video[];
  // If a playlist or video is being currently dragged
  dragContentType: DragContentType;
  // selection mode controls what clicking on content does
  isSelectionMode: boolean;
  isMouseOverContextMenu: boolean;
  // ID of setTimeout event when hovering over a video
  hoverTimeoutId: NodeJS.Timeout | null;
  // Storing cropped images in local state to avoid refetching these
  playlistImages: Record<string, string | undefined>;
}

export class ContentStateClass implements ContentState {
  selectedVideos = $state([]);
  dragContentType = $state(null);
  isSelectionMode = $state(false);
  isMouseOverContextMenu = $state(false);
  hoverTimeoutId = $state(null);
  playlistImages = $state({});
}

const DEFAULT_KEY = "$_content_state";

export function setContentState(key = DEFAULT_KEY) {
  const contentState = new ContentStateClass();
  return setContext(key, contentState);
}

export function getContentState(key = DEFAULT_KEY) {
  return getContext<ContentState>(key);
}
