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
  isMouseOverContextMenu: boolean;
  isContextMenuOpen: boolean;
  // ID of setTimeout event when hovering over a video
  hoverTimeoutId: ReturnType<typeof setTimeout> | null;
  // Storing cropped images in local state to avoid refetching these
  playlistImages: PlaylistImageInfo;

  // Drag and drop state
  draggedIndex: number | null;
  targetIndex: number | null;

  // Click tracking for double-click detection
  lastClickTime: number;
  lastClickedVideo: Video | null;

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

  handleContextMenu: ({
    event,
    video,
  }: {
    event: MouseEvent;
    video: Video;
  }) => void;

  // Cleanup event handler
  setupClickOutsideListener: (containerElement: HTMLElement) => void;

  // Click handling for single/double click
  handleVideoClick: ({
    event,
    video,
    videos,
    playlist,
    onNavigate,
  }: {
    event: MouseEvent;
    video: Video;
    videos: Video[];
    playlist?: Playlist;
    onNavigate?: (video: Video, playlist?: Playlist) => void;
  }) => void;

  // Play button click handler
  handlePlayButtonClick: ({
    event,
    video,
    playlist,
    onNavigate,
  }: {
    event: MouseEvent;
    video: Video;
    playlist?: Playlist;
    onNavigate?: (video: Video, playlist?: Playlist) => void;
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
  isMouseOverContextMenu = $state(false);
  isContextMenuOpen = $state(false);
  hoverTimeoutId = $state<ReturnType<typeof setTimeout> | null>(null);
  playlistImages = $state({});
  manualHover = $state(false);

  // Drag and drop state
  draggedIndex = $state<number | null>(null);
  targetIndex = $state<number | null>(null);

  // Click tracking for double-click detection
  lastClickTime = $state(0);
  lastClickedVideo = $state<Video | null>(null);

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

  // Handle play button click - immediate navigation
  handlePlayButtonClick({
    event,
    video,
    playlist,
    onNavigate,
  }: {
    event: MouseEvent;
    video: Video;
    playlist?: Playlist;
    onNavigate?: (video: Video, playlist?: Playlist) => void;
  }) {
    // Stop the event from propagating to the row click handler
    event.stopPropagation();
    event.preventDefault();

    // Navigate immediately
    onNavigate?.(video, playlist);
  }

  // Handle single click (select) vs double click (navigate)
  handleVideoClick({
    event,
    video,
    videos,
    playlist,
    onNavigate,
  }: {
    event: MouseEvent;
    video: Video;
    videos: Video[];
    playlist?: Playlist;
    onNavigate?: (video: Video, playlist?: Playlist) => void;
  }) {
    const now = Date.now();
    const doubleClickDelay = 300; // milliseconds

    // Always handle selection immediately
    this.handleSelectVideos({ event, video, videos });

    // Check if this is a double-click (only for non-modifier clicks)
    if (
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      this.lastClickedVideo?.id === video.id &&
      now - this.lastClickTime < doubleClickDelay
    ) {
      // This is a double-click - navigate immediately
      onNavigate?.(video, playlist);

      // Reset double-click tracking
      this.lastClickTime = 0;
      this.lastClickedVideo = null;
    } else {
      // This is a single click - just update tracking for potential double-click
      this.lastClickTime = now;
      this.lastClickedVideo = video;
      // No navigation timeout - only double-click navigates
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

        this.selectedVideos = videosForDrag;

        const dragImageText =
          videosForDrag.length === 1
            ? videosForDrag[0].title
            : `${videosForDrag.length} videos`;
        createDragImage(event, dragImageText);
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
    const isCtrlPressed = event.ctrlKey || event.metaKey;
    const videoIndex = this.selectedVideos.findIndex((v) => v.id === video.id);

    if (isShiftPressed) {
      // SHIFT key - range selection
      if (this.selectedVideos.length === 0) {
        // No previous selection, just select this video
        this.selectedVideos = [video];
      } else {
        // Find the last selected video's position for range selection
        const lastSelectedVideo =
          this.selectedVideos[this.selectedVideos.length - 1];
        const lastSelectedIndex = videos.findIndex(
          (v) => v.id === lastSelectedVideo.id,
        );
        const currentIndex = videos.findIndex((v) => v.id === video.id);

        if (lastSelectedIndex !== -1 && currentIndex !== -1) {
          // Determine the range
          const startIndex = Math.min(lastSelectedIndex, currentIndex);
          const endIndex = Math.max(lastSelectedIndex, currentIndex);

          // Create range videos
          const rangeVideos: Video[] = [];
          for (let i = startIndex; i <= endIndex; i++) {
            rangeVideos.push(videos[i]);
          }

          // CTRL+SHIFT: Add range to existing selection (union)
          const existingIds = new Set(this.selectedVideos.map((v) => v.id));
          const newVideos = rangeVideos.filter((v) => !existingIds.has(v.id));
          this.selectedVideos = [...this.selectedVideos, ...newVideos];
        }
      }
    } else if (isCtrlPressed) {
      // CTRL only - toggle individual selection (non-contiguous multi-select)
      if (videoIndex === -1) {
        // Video not selected - add it to selection
        this.selectedVideos = [...this.selectedVideos, video];
      } else {
        // Video already selected - remove it from selection
        this.selectedVideos = this.selectedVideos.filter(
          (v) => v.id !== video.id,
        );
      }
    } else {
      // No modifier keys - standard single selection behavior
      if (videoIndex === -1) {
        // Video not selected - replace entire selection with just this video
        this.selectedVideos = [video];
      } else if (this.selectedVideos.length === 1) {
        // Only this video is selected - deselect it (toggle off)
        this.selectedVideos = [];
      } else {
        // Multiple videos selected - replace selection with just this video
        this.selectedVideos = [video];
      }
    }
  }

  handleContextMenu({ event, video }: { event: MouseEvent; video: Video }) {
    const isVideoSelected = this.selectedVideos.some((v) => v.id === video.id);

    if (!isVideoSelected) {
      this.selectedVideos = [];
      this.hoveredVideo = video;
    }
  }

  setupClickOutsideListener(containerElement: HTMLElement) {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't clear selection if:
      // - Context menu is open
      // - User is dragging
      // - Click is on a UI element that shouldn't clear selection (like buttons, menus, etc.)
      if (
        this.isContextMenuOpen ||
        this.dragContentType ||
        this.isMouseOverContextMenu
      ) {
        return;
      }

      // Check if click is outside the container
      if (!containerElement.contains(event.target as Node)) {
        // Only clear if there are selected videos
        if (this.selectedVideos.length > 0) {
          this.selectedVideos = [];
        }
      }
    };

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
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
