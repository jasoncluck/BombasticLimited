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
import type { PageState } from "./page.svelte";

export type DragContentType = "video" | "playlist" | null;

export type PlaylistImageInfo = Record<string, string | undefined>;

export interface CarouselState {
  lastViewedIndex: number;
}

// Video drag and drop CSS classes
export const VIDEO_DROPZONE_CLASSES = [
  "border-solid",
  "border-primary",
  "bg-primary/40",
];

export const END_DROPZONE_CLASSES = ["border-transparent"];

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
  // Page state dependency
  pageState: PageState;

  // Carousel state for snapshots
  carouselState: CarouselState;

  // Videos selected for multi-selection operations
  selectedVideos: Video[];
  // Single video being hovered or that context menu is operating on
  hoveredVideo: Video | null;
  // If a playlist or video is being currently dragged
  dragContentType: DragContentType;
  isMenuOpen: boolean;
  isMouseOverMenu: boolean;
  isContextMenuOpen: boolean;
  isDropdownMenuOpen: boolean;
  // ID of setTimeout event when hovering over a video
  hoverTimeoutId: ReturnType<typeof setTimeout> | null;

  // Drag and drop state
  draggedIndex: number | null;
  targetIndex: number | null;

  // Click tracking for double-click detection
  lastClickTime: number;
  lastClickedVideo: Video | null;

  // Video drag and drop CSS classes
  getVideoDropzoneClasses: (playlist: Playlist, session: any) => string[];
  getEndDropzoneClasses: () => string[];

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

  // Mouse hover methods
  handleMouseEnter: (options: MouseHoverOptions) => void;
  handleMouseLeave: (isHoveringElement?: boolean) => void;

  getVideoDragClasses: (index: number) => string;

  manualHover: boolean;
}

export class ContentStateClass implements ContentState {
  pageState: PageState;
  carouselState = $state<CarouselState>({ lastViewedIndex: 0 });
  selectedVideos = $state<Video[]>([]);
  hoveredVideo = $state<Video | null>(null);
  dragContentType = $state<DragContentType>(null);
  isMenuOpen = $state(false);
  isMouseOverMenu = $state(false);
  isContextMenuOpen = $state(false);
  isDropdownMenuOpen = $state(false);
  hoverTimeoutId = $state<ReturnType<typeof setTimeout> | null>(null);
  manualHover = $state(false);

  // Drag and drop state
  draggedIndex = $state<number | null>(null);
  targetIndex = $state<number | null>(null);

  // Click tracking for double-click detection
  lastClickTime = $state(0);
  lastClickedVideo = $state<Video | null>(null);

  constructor(pageState: PageState) {
    this.pageState = pageState;
  }

  // Video drag and drop CSS classes
  getVideoDropzoneClasses(playlist: Playlist, session: any): string[] {
    if (
      this.dragContentType === "video" &&
      playlist.created_by === session?.user.id
    ) {
      return VIDEO_DROPZONE_CLASSES;
    }
    return [];
  }

  getEndDropzoneClasses(): string[] {
    return END_DROPZONE_CLASSES;
  }

  // Mouse hover methods
  handleMouseEnter(options: MouseHoverOptions) {
    const { video, shouldScrollCheck = false } = options;

    if (this.isContextMenuOpen) {
      return;
    }

    // For content cards that need to check scrolling state
    if (shouldScrollCheck) {
      if (
        this.pageState.contentScrollState.scrolling &&
        this.dragContentType === null
      ) {
        this.manualHover = true;
      }
    }

    // Don't update hoveredVideo if context menu is open or if we're dragging
    if (!this.dragContentType) {
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
    if (!this.isContextMenuOpen || !this.isDropdownMenuOpen) {
      // Store the timeout ID so it can be cleared if needed
      const timeoutId = setTimeout(() => {
        if (!this.dragContentType && !isHoveringElement) {
          this.hoveredVideo = null;
        }
        this.hoverTimeoutId = null;
      }, 50);
      this.hoverTimeoutId = timeoutId;
    }
  }

  getVideoDragClasses(index: number): string {
    let classes = "relative";

    if (this.draggedIndex === index) {
      classes += " ";
    }

    if (this.targetIndex === index) {
      classes += " relative";

      if (this.draggedIndex === null || this.draggedIndex < this.targetIndex) {
        // Show indicator at the bottom
        classes +=
          " after:absolute after:left-0 after:bottom-0 after:w-full after:h-[2px] after:bg-primary after:z-10";
      } else {
        // Show indicator at the top (using after with negative margin)
        classes +=
          " after:absolute after:left-0 after:top-0 after:-mt-px after:w-full after:h-[2px] after:bg-primary after:z-10";
      }
    }
    return classes;
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

        // Get the video being dragged
        const draggedVideo = options.videos[index];

        // Check if the dragged video is in the selected videos
        const isDraggedVideoSelected = this.selectedVideos.some(
          (video) => video.id === draggedVideo.id,
        );

        // If the dragged video is not in selectedVideos, use just the dragged video
        // Otherwise, use the selected videos
        const videosForDrag =
          isDraggedVideoSelected && this.selectedVideos.length > 0
            ? this.selectedVideos
            : [draggedVideo];

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
        // Check if we have selected videos to move multiple, otherwise move single video
        const selectedVideos =
          this.selectedVideos && this.selectedVideos.length > 0
            ? this.selectedVideos
            : [options.videos[this.draggedIndex]];

        // IMPORTANT: Sort the selected videos by their current position in the array
        // to maintain the correct order regardless of selection order
        const videosToMove = selectedVideos.sort((a, b) => {
          const indexA = options.videos.findIndex((v) => v.id === a.id);
          const indexB = options.videos.findIndex((v) => v.id === b.id);
          return indexA - indexB;
        });

        // Get the video IDs for the database update
        const videoIds = videosToMove.map((video) => video.id);

        // Determine if we're moving down (to higher index)
        const movingDown = this.draggedIndex < index;

        // When moving down, we want to insert AFTER the target index
        // When moving up, we want to insert BEFORE the target index
        let targetIndex = index;
        if (movingDown) {
          targetIndex = index + 1;
        }

        // Create a new array for the local update
        const updatedVideos = [...options.videos];

        // Remove the videos that are being moved
        const remainingVideos = updatedVideos.filter(
          (video) => !videoIds.includes(video.id),
        );

        // Calculate the correct insertion index in the remaining array
        const movedVideosBefore = videosToMove.filter((video) => {
          const originalIndex = options.videos.findIndex(
            (v) => v.id === video.id,
          );
          return originalIndex < targetIndex;
        }).length;

        // Adjust the insertion index
        const insertIndex = Math.max(
          0,
          Math.min(targetIndex - movedVideosBefore, remainingVideos.length),
        );

        // Insert the moved videos at the correct position
        const finalVideos = [
          ...remainingVideos.slice(0, insertIndex),
          ...videosToMove, // Now properly ordered
          ...remainingVideos.slice(insertIndex),
        ];

        // Update the videos through the callback
        options.onVideosUpdate?.(finalVideos);

        if (!isPlaylistVideosFilter(options.contentFilter)) {
          throw new Error("Invalid content filter, expected playlist filter");
        }

        if (!options.videosCount) {
          throw new Error(
            "Could not find total video count, unable to reorder videos.",
          );
        }

        // Use the actual playlist video count, not the total videos count
        const playlistVideoCount = options.videos.length;

        // Calculate the new position for the database (1-based)
        // Ensure the position is within valid range
        let newPosition: number;
        if (options.contentFilter.sort.order === "ascending") {
          newPosition = Math.max(
            1,
            Math.min(
              insertIndex + 1,
              playlistVideoCount - videosToMove.length + 1,
            ),
          );
        } else {
          newPosition = Math.max(
            1,
            Math.min(
              playlistVideoCount - insertIndex - (videosToMove.length - 1),
              playlistVideoCount - videosToMove.length + 1,
            ),
          );
        }

        handleUpdatePlaylistVideoPosition({
          videos: videosToMove,
          position: newPosition,
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

          const existingIds = new Set(this.selectedVideos.map((v) => v.id));
          const newVideos = rangeVideos.filter((v) => !existingIds.has(v.id));
          this.selectedVideos = [...this.selectedVideos, ...newVideos];
        }
      }
    } else if (isCtrlPressed) {
      // CTRL only - toggle individual selection
      if (videoIndex === -1) {
        this.selectedVideos = [...this.selectedVideos, video];
      } else {
        this.selectedVideos = this.selectedVideos.filter(
          (v) => v.id !== video.id,
        );
      }
    } else {
      // No modifier keys - standard single selection behavior
      if (videoIndex === -1) {
        this.selectedVideos = [video];
      } else if (this.selectedVideos.length === 1) {
        this.selectedVideos = [];
      } else {
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
      this.hoverTimeoutId = null;

      // Don't clear selection if:
      // - Context menu is open
      // - User is dragging
      // - User is holding modifier keys (shift, ctrl, cmd)
      if (
        this.isContextMenuOpen ||
        this.isDropdownMenuOpen ||
        this.dragContentType ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      // Check if the click is on a dropdown or other UI element that shouldn't clear selection
      const target = event.target as HTMLElement;
      if (
        target.closest("[data-dropdown]") ||
        target.closest('[role="menu"]') ||
        target.closest("button")
      ) {
        return;
      }

      // Check if click is outside the container
      if (!containerElement.contains(event.target as Node)) {
        // Only clear if there are selected videos
        if (this.selectedVideos.length > 0) {
          this.selectedVideos = this.hoveredVideo ? [this.hoveredVideo] : [];
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

export function setContentState(pageState: PageState, key = DEFAULT_KEY) {
  const contentState = new ContentStateClass(pageState);
  return setContext(key, contentState);
}

export function getContentState(key = DEFAULT_KEY) {
  return getContext<ContentState>(key);
}
