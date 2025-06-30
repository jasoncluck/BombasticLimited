import type { Video } from "$lib/supabase/videos";
import type { Playlist } from "$lib/supabase/playlists";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";
import { getContext, setContext } from "svelte";
import { createDragImage } from "$lib/utils/dragdrop";
import {
  isPlaylistVideosFilter,
  type CombinedContentFilter,
} from "$lib/components/content/content-filter";
import { handleUpdatePlaylistVideoPosition } from "$lib/components/playlist/playlist-service";
import { pageState } from "./page.svelte";

export type DragContentType = "video" | "playlist" | null;

export type PlaylistImageInfo = Record<string, string | undefined>;

export interface DragDropOptions {
  allowVideoReorder?: boolean;
  videos: Video[];
  videosCount?: number | null;
  playlist?: Playlist;
  contentFilter?: CombinedContentFilter;
  supabase?: SupabaseClient<Database>;
  onVideosUpdate?: (videos: Video[]) => void;
}

export interface DragDropHandlers {
  handleDragOver: (event: DragEvent, index: number) => void;
  handleDragEnd: () => void;
  handleDragLeave: (
    e: DragEvent & { currentTarget: EventTarget & HTMLElement },
  ) => void;
  handleDrop: (event: DragEvent, index: number) => void;
  handleDragStart: (
    event: DragEvent & { currentTarget: HTMLElement },
    index: number,
  ) => void;
}

export interface MouseHoverOptions {
  video: Video;
  isHoveringElement?: boolean;
  shouldScrollCheck?: boolean;
}

export interface ContentState {
  // Videos selected for multi-selection operations
  selectedVideos: Video[];
  // Single video being hovered or that context menu is operating on
  hoveredVideo: Video | null;
  // If a playlist or video is being currently dragged
  dragContentType: DragContentType;
  // selection mode controls what clicking on content does
  isSelectionMode: boolean;
  isMouseOverContextMenu: boolean;
  isContextMenuOpen: boolean;
  // ID of setTimeout event when hovering over a video
  hoverTimeoutId: ReturnType<typeof setTimeout> | null;
  // Storing cropped images in local state to avoid refetching these
  playlistImages: PlaylistImageInfo;

  // Drag and drop state
  draggedIndex: number | null;
  targetIndex: number | null;

  // Drag and drop method
  createDragDrop: (options: DragDropOptions) => DragDropHandlers;

  // Selection
  handleSelectVideos: ({
    event,
    video,
    videos,
  }: {
    event: MouseEvent;
    video: Video;
    videos: Video[];
  }) => void;

  // Mouse hover methods
  handleMouseEnter: (options: MouseHoverOptions) => void;
  handleMouseLeave: (isHoveringElement?: boolean) => void;
  manualHover: boolean;
}

export class ContentStateClass implements ContentState {
  selectedVideos = $state<Video[]>([]);
  hoveredVideo = $state<Video | null>(null);
  dragContentType = $state<DragContentType>(null);
  isSelectionMode = $state(false);
  isMouseOverContextMenu = $state(false);
  isContextMenuOpen = $state(false);
  hoverTimeoutId = $state<ReturnType<typeof setTimeout> | null>(null);
  playlistImages = $state({});
  manualHover = $state(false);

  // Drag and drop state
  draggedIndex = $state<number | null>(null);
  targetIndex = $state<number | null>(null);

  // Mouse hover methods
  handleMouseEnter(options: MouseHoverOptions) {
    const {
      video,
      isHoveringElement = false,
      shouldScrollCheck = false,
    } = options;

    // For content cards that need to check scrolling state
    if (shouldScrollCheck) {
      if (
        pageState.contentScrollState.scrolling &&
        this.dragContentType === null
      ) {
        this.manualHover = true;
      }
    }

    // Don't update hoveredVideo if context menu is open or if we're dragging
    if (!this.dragContentType && !this.isContextMenuOpen) {
      // Clear any existing timeout when entering a new element
      if (this.hoverTimeoutId) {
        clearTimeout(this.hoverTimeoutId);
        this.hoverTimeoutId = null;
      }

      this.hoveredVideo = video;
    }
  }

  handleMouseLeave(isHoveringElement: boolean = false) {
    this.manualHover = false;
    if (!this.isContextMenuOpen) {
      // Store the timeout ID so it can be cleared if needed
      const timeoutId = setTimeout(() => {
        if (
          !this.dragContentType &&
          !isHoveringElement &&
          !this.isMouseOverContextMenu
        ) {
          this.hoveredVideo = null;
        }
        this.hoverTimeoutId = null;
      }, 50);
      this.hoverTimeoutId = timeoutId;
    }
  }

  // Drag and drop methods for reordering
  createDragDrop(options: DragDropOptions): DragDropHandlers {
    const handleDragOver = (event: DragEvent, index: number) => {
      if (!options.allowVideoReorder) return;

      event.preventDefault();
      if (
        this.draggedIndex !== null &&
        this.draggedIndex !== index &&
        this.targetIndex !== index
      ) {
        this.targetIndex = index;
      }
    };

    const handleDragEnd = () => {
      this.draggedIndex = null;
      this.targetIndex = null;
    };

    const handleDragLeave = (
      e: DragEvent & { currentTarget: EventTarget & HTMLElement },
    ) => {
      if (!options.allowVideoReorder) return;
      // Only set targetIndex to null if we're actually leaving the container
      // and not just moving between its child elements. This avoids having a flickering issue.
      const relatedTarget = e.relatedTarget as Node;
      if (!e.currentTarget.contains(relatedTarget)) {
        this.targetIndex = null;
      }
    };

    const handleDrop = (event: DragEvent, index: number) => {
      if (!options.allowVideoReorder || !options.supabase) return;
      if (
        !options.playlist ||
        options.contentFilter?.sort.key !== "playlistOrder"
      ) {
        return;
      }
      event.preventDefault();
      if (this.draggedIndex !== null && this.draggedIndex !== index) {
        // Reorder the videos array
        const updatedVideos = [...options.videos];
        const [movedItem] = updatedVideos.splice(this.draggedIndex, 1);
        updatedVideos.splice(index, 0, movedItem);

        // Update the videos through the callback
        options.onVideosUpdate?.(updatedVideos);

        if (!isPlaylistVideosFilter(options.contentFilter)) {
          throw new Error("Invalid content filter, expected playlist filter");
        }

        if (!options.videosCount) {
          throw new Error(
            "Could not find total video count, unable to reorder videos.",
          );
        }

        handleUpdatePlaylistVideoPosition({
          video: movedItem,
          position:
            options.contentFilter.sort.order === "ascending"
              ? index + 1
              : options.videosCount - index,
          playlist: options.playlist,
          supabase: options.supabase,
        });
      }
      this.draggedIndex = null;
      this.targetIndex = null;
    };

    const handleDragStart = (
      event: DragEvent & { currentTarget: HTMLElement },
      index: number,
    ) => {
      // Set the drag index for visual feedback
      this.draggedIndex = index;

      // Set drag content type
      this.dragContentType = "video";

      // Handle drag data transfer and drag image
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", index.toString());

        // If videos aren't already selected, use the hovered video for dragging
        const videosForDrag =
          this.selectedVideos.length > 0
            ? this.selectedVideos
            : this.hoveredVideo
              ? [this.hoveredVideo]
              : [options.videos[index]];

        const dragImageText =
          videosForDrag.length === 1
            ? videosForDrag[0].title
            : `${videosForDrag.length} videos`;
        createDragImage(event, dragImageText);
      }
    };

    return {
      handleDragOver,
      handleDragEnd,
      handleDragLeave,
      handleDrop,
      handleDragStart,
    };
  }

  handleSelectVideos({
    event,
    video,
    videos,
  }: {
    event: MouseEvent;
    video: Video;
    videos: Video[];
  }) {
    const isShiftPressed = event.shiftKey;
    const videoIndex = this.selectedVideos.findIndex((v) => v.id === video.id);

    if (!isShiftPressed) {
      // Original behavior when SHIFT is not pressed
      if (videoIndex === -1) {
        this.selectedVideos.push(video);
      } else {
        this.selectedVideos.splice(videoIndex, 1);
      }
    } else {
      // SHIFT key is pressed - implement range selection
      // If no videos are selected yet, just add this one
      if (this.selectedVideos.length === 0) {
        this.selectedVideos.push(video);
      } else {
        const lastSelectedVideo =
          this.selectedVideos[this.selectedVideos.length - 1];

        const lastSelectedIndex = videos.findIndex(
          (v) => v.id === lastSelectedVideo.id,
        );
        const currentIndex = videos.findIndex((v) => v.id === video.id);

        // Determine start and end indices for the range
        const startIndex = Math.min(lastSelectedIndex, currentIndex);
        const endIndex = Math.max(lastSelectedIndex, currentIndex);

        // Select all videos in the range
        for (let i = startIndex; i <= endIndex; i++) {
          const rangeVideo = videos[i];
          // Check if this video is not already in selectedVideos
          if (!this.selectedVideos.some((v) => v.id === rangeVideo.id)) {
            this.selectedVideos.push(rangeVideo);
          }
        }
      }
    }
  }
}

const DEFAULT_KEY = "$_content_state";

export function setContentState(key = DEFAULT_KEY) {
  const contentState = new ContentStateClass();
  return setContext(key, contentState);
}

export function getContentState(key = DEFAULT_KEY) {
  return getContext<ContentState>(key);
}
