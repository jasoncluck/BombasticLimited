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
import type { ContentDisplay } from "$lib/components/content/content";

export type DragContentType = "video" | "playlist" | null;

export type PlaylistImageInfo = Record<string, string | undefined>;

// Default section ID for single-section pages
export const DEFAULT_SECTION_ID = "defaultSection";

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
  setDraggedAsSelected?: boolean;
  clearSelection?: boolean;
}

export interface DragDropHandlers {
  handleDragOver: (event: DragEvent, index: number) => void;
  handleDragEnd: () => void;
  handleDragLeave: (
    e: DragEvent & { currentTarget: EventTarget & HTMLElement },
  ) => void;
  handleDrop: (event: DragEvent, index: number, sectionId?: string) => void;
  handleDragStart: (
    event: DragEvent & { currentTarget: HTMLElement },
    index: number,
    sectionId?: string,
  ) => void;
}

export interface MouseHoverOptions {
  video: Video;
  sectionId?: string; // Made optional with default
  isHoveringElement?: boolean;
}

export class ContentState {
  // Page state dependency
  pageState: PageState;

  // Carousel state for snapshots
  carouselState = $state<CarouselState>({ lastViewedIndex: 0 });

  // Selected and hovered video by "section" where section is a carousel, a group of tiles, tables, etc.
  selectedVideosBySection = $state<Record<string, Video[]>>({});
  hoveredVideosBySection = $state<Record<string, Video | null>>({});

  // If a playlist or video is being currently dragged
  dragContentType = $state<DragContentType>(null);
  isMenuOpen = $state(false);
  isMouseOverMenu = $state(false);
  openContextMenuSection = $state<string | null>(null);
  isDropdownMenuOpen = $state(false);
  // ID of setTimeout event when hovering over a video
  hoverTimeoutId = $state<ReturnType<typeof setTimeout> | null>(null);

  // Drag and drop state
  draggedIndex = $state<number | null>(null);
  targetIndex = $state<number | null>(null);

  // Track dragged section
  draggedFromSectionId = $state<string | null>(null);

  // Click tracking for double-click detection
  lastClickTime = $state(0);
  lastClickedVideo = $state<Video | null>(null);

  constructor(pageState: PageState) {
    this.pageState = pageState;
  }

  // Helper methods for section-specific context menu tracking
  isContextMenuOpenForSection(sectionId: string = DEFAULT_SECTION_ID): boolean {
    return this.openContextMenuSection === sectionId;
  }

  isContextMenuOpenForAnySection(): boolean {
    for (const sectionId in this.selectedVideosBySection) {
      if (
        this.openContextMenuSection &&
        this.isContextMenuOpenForSection(sectionId)
      ) {
        return true;
      }
    }
    return false;
  }

  private clearOtherSections(currentSectionId: string) {
    for (const sectionId in this.selectedVideosBySection) {
      if (sectionId !== currentSectionId) {
        this.selectedVideosBySection[sectionId] = [];
        // Also clear hovered videos from other sections
        this.hoveredVideosBySection[sectionId] = null;
      }
    }
  }

  private clearAllSections() {
    for (const sectionId in this.selectedVideosBySection) {
      this.selectedVideosBySection[sectionId] = [];
      // Also clear hovered videos from other sections
      this.hoveredVideosBySection[sectionId] = null;
    }
  }

  get isAnyContextMenuOpen(): boolean {
    return this.openContextMenuSection !== null;
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
  handleMouseEnter({
    video,
    sectionId = DEFAULT_SECTION_ID,
  }: MouseHoverOptions) {
    // if (this.isContextMenuOpenForSection(sectionId)) {
    //   return;
    // }

    // Don't update hoveredVideo if we're dragging
    if (!this.dragContentType) {
      // Clear any existing timeout when entering a new element
      if (this.hoverTimeoutId) {
        clearTimeout(this.hoverTimeoutId);
        this.hoverTimeoutId = null;
      }

      // If this is a different section and we're starting to hover,
      // clear selections from other sections
      // if (this.hoveredVideosBySection[sectionId] === null) {
      //   this.clearOtherSections(sectionId);
      // }

      this.hoveredVideosBySection[sectionId] = video;
    }
  }

  handleMouseLeave({
    sectionId = DEFAULT_SECTION_ID,
    removeSelectedOnHover,
  }: {
    sectionId?: string;
    removeSelectedOnHover?: boolean;
  }) {
    // If context menu is open for this section, don't clear hover state
    // if (this.isContextMenuOpenForSection(sectionId)) {
    //   return;
    // }

    // Only delay clearing hover if dropdown menu is not open
    if (!this.isDropdownMenuOpen) {
      // Store the timeout ID so it can be cleared if needed
      const timeoutId = setTimeout(() => {
        if (
          !this.dragContentType &&
          !this.isContextMenuOpenForSection(sectionId)
        ) {
          this.hoveredVideosBySection[sectionId] = null;
          if (removeSelectedOnHover) {
            this.selectedVideosBySection[sectionId] = [];
          }
        }
        this.hoverTimeoutId = null;
      }, 50);
      this.hoverTimeoutId = timeoutId;
    }
  }

  getVideoDragClasses(index: number, contentDisplay: ContentDisplay): string {
    let classes = "relative";

    if (this.draggedIndex === index) {
      classes += " ";
    }

    if (this.targetIndex === index) {
      classes += " relative";

      if (contentDisplay === "TABLE") {
        if (
          this.draggedIndex === null ||
          this.draggedIndex < this.targetIndex
        ) {
          // Show indicator at the bottom
          classes +=
            " after:absolute after:left-0 after:bottom-0 after:w-full after:h-[2px] after:bg-primary after:z-10";
        } else {
          // Show indicator at the top (using after with negative margin)
          classes +=
            " after:absolute after:left-0 after:top-0 after:-mt-px after:w-full after:h-[2px] after:bg-primary after:z-10";
        }
      } else {
        if (
          this.draggedIndex === null ||
          this.draggedIndex < this.targetIndex
        ) {
          // Show indicator at the right (vertical line)
          classes +=
            " after:absolute after:right-0 after:top-0 after:w-[2px] after:h-full after:bg-primary after:z-10";
        } else {
          // Show indicator at the left (vertical line)
          classes +=
            " after:absolute after:left-0 after:top-0 after:w-[2px] after:h-full after:bg-primary after:z-10";
        }
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
    sectionId = DEFAULT_SECTION_ID,
    onNavigate,
    enableDoubleClick = true,
  }: {
    event: MouseEvent | KeyboardEvent;
    video: Video;
    videos: Video[];
    sectionId?: string;
    playlist?: Playlist;
    onNavigate?: (video: Video, playlist?: Playlist) => void;
    enableDoubleClick?: boolean;
  }) {
    // Check if context menu is open in any sectionId
    if (this.isAnyContextMenuOpen) {
      // Close the context menu by clearing the open section
      this.openContextMenuSection = null;

      if (this.hoveredVideosBySection[sectionId]) {
        this.selectedVideosBySection[sectionId] = [];
      } else {
        this.selectedVideosBySection[sectionId] = [];
        this.hoveredVideosBySection[sectionId] = null;
      }
      return;
    }

    const now = Date.now();
    const doubleClickDelay = 300; // milliseconds

    if (enableDoubleClick) {
      // Double-click behavior (existing logic)
      this.handleSelectVideos({
        event,
        video,
        videos,
        sectionId,
      });
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
    } else {
      // Single-click behavior - no selection, just navigate immediately
      // Only navigate for non-modifier clicks
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
        onNavigate?.(video, playlist);
      }

      // Reset double-click tracking since we're not using it
      this.lastClickTime = 0;
      this.lastClickedVideo = null;
    }
  }

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
      // Clear drag visual state
      this.draggedIndex = null;
      this.targetIndex = null;

      // Clear selected videos from the section that was being dragged
      // This ensures selections are cleared regardless of where the drag ended
      if (this.draggedFromSectionId && options.clearSelection) {
        this.selectedVideosBySection[this.draggedFromSectionId] = [];
      }

      // Reset drag state
      this.dragContentType = null;
      this.draggedFromSectionId = null;
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
      sectionId: string = DEFAULT_SECTION_ID,
    ) => {
      // Clear selections from all other sections first
      if (options.clearSelection) {
        this.clearAllSections();
      }

      // Track which section this drag started from
      this.draggedFromSectionId = sectionId;

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

        let videosForDrag: Video[];

        // Default behavior - manage selection state
        // Use nullish coalescing to get selected videos for this section
        const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];

        // Check if the dragged video is in the selected videos
        const isDraggedVideoSelected = selectedVideos.some(
          (video) => video.id === draggedVideo.id,
        );

        // If the dragged video is not in selectedVideos, use just the dragged video
        // Otherwise, use the selected videos
        videosForDrag =
          isDraggedVideoSelected && selectedVideos.length > 0
            ? selectedVideos
            : [draggedVideo];

        this.selectedVideosBySection[sectionId] = videosForDrag;

        const dragImageText =
          videosForDrag.length === 1
            ? videosForDrag[0].title
            : `${videosForDrag.length} videos`;
        createDragImage(event, dragImageText);
      }
    };

    const handleDrop = (
      event: DragEvent,
      index: number,
      sectionId: string = DEFAULT_SECTION_ID,
    ) => {
      if (!options.allowVideoReorder || !options.supabase) return;
      if (
        !options.playlist ||
        options.contentFilter?.sort.key !== "playlistOrder"
      ) {
        return;
      }

      event.preventDefault();
      if (this.draggedIndex !== null && this.draggedIndex !== index) {
        // Use nullish coalescing to get selected videos for this section
        const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];

        // Check if we have selected videos to move multiple, otherwise move single video
        const videosToMove =
          selectedVideos.length > 0
            ? selectedVideos
            : [options.videos[this.draggedIndex]];

        // IMPORTANT: Sort the selected videos by their current position in the array
        // to maintain the correct order regardless of selection order
        const sortedVideosToMove = videosToMove.sort((a, b) => {
          const indexA = options.videos.findIndex((v) => v.id === a.id);
          const indexB = options.videos.findIndex((v) => v.id === b.id);
          return indexA - indexB;
        });

        // Get the video IDs for the database update
        const videoIds = sortedVideosToMove.map((video) => video.id);

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
        const movedVideosBefore = sortedVideosToMove.filter((video) => {
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
          ...sortedVideosToMove, // Now properly ordered
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
              playlistVideoCount - sortedVideosToMove.length + 1,
            ),
          );
        } else {
          newPosition = Math.max(
            1,
            Math.min(
              playlistVideoCount -
                insertIndex -
                (sortedVideosToMove.length - 1),
              playlistVideoCount - sortedVideosToMove.length + 1,
            ),
          );
        }

        handleUpdatePlaylistVideoPosition({
          videos: sortedVideosToMove,
          position: newPosition,
          playlist: options.playlist,
          supabase: options.supabase,
        });
      }

      // Note: Don't reset draggedFromSectionId here, let handleDragEnd handle it
      // since handleDragEnd always runs after handleDrop
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
    sectionId = DEFAULT_SECTION_ID,
  }: {
    event: MouseEvent | KeyboardEvent;
    video: Video;
    videos: Video[];
    sectionId?: string;
  }) {
    const isShiftPressed = event.shiftKey;
    const isCtrlPressed = event.ctrlKey || event.metaKey;

    // Use nullish coalescing to get selected videos for this section
    let selectedVideos = this.selectedVideosBySection[sectionId] ?? [];
    const videoIndex = selectedVideos.findIndex((v) => v.id === video.id);

    if (isShiftPressed) {
      // SHIFT key - range selection
      if (selectedVideos.length === 0) {
        // No previous selection, just select this video
        selectedVideos = [video];
      } else {
        // Find the last selected video's position for range selection
        const lastSelectedVideo = selectedVideos[selectedVideos.length - 1];
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

          const existingIds = new Set(selectedVideos.map((v) => v.id));
          const newVideos = rangeVideos.filter((v) => !existingIds.has(v.id));
          selectedVideos = [...selectedVideos, ...newVideos];
        }
      }
    } else if (isCtrlPressed) {
      // CTRL only - toggle individual selection
      if (videoIndex === -1) {
        selectedVideos = [...selectedVideos, video];
      } else {
        selectedVideos = selectedVideos.filter((v) => v.id !== video.id);
      }
    } else {
      // No modifier keys - standard single selection behavior
      selectedVideos = [video];
    }

    // Update the selected videos for this section
    this.selectedVideosBySection[sectionId] = selectedVideos;
  }

  handleContextMenu({
    video,
    sectionId = DEFAULT_SECTION_ID,
  }: {
    video: Video;
    sectionId?: string;
  }) {
    // Clear selections from all other sections first
    this.clearOtherSections(sectionId);

    // Close any existing context menu from other sections
    if (
      this.openContextMenuSection &&
      this.openContextMenuSection !== sectionId
    ) {
      this.openContextMenuSection = null;
    }

    this.openContextMenuSection = sectionId;

    // Use nullish coalescing to get selected videos for this section
    const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];
    const isVideoSelected = selectedVideos.some((v) => v.id === video.id);

    if (!isVideoSelected) {
      this.selectedVideosBySection[sectionId] = [video];
    }

    // Always update hovered video for this section when context menu is triggered
    this.hoveredVideosBySection[sectionId] = video;
  }

  setupClickOutsideListener(
    containerElement: HTMLElement,
    sectionId: string = DEFAULT_SECTION_ID,
  ) {
    const handleClickOutside = (event: MouseEvent) => {
      this.hoverTimeoutId = null;

      // Don't clear selection if:
      // - Context menu is open for this section
      // - User is dragging
      // - User is holding modifier keys (shift, ctrl, cmd)
      if (
        this.isContextMenuOpenForSection(sectionId) ||
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
        // Use nullish coalescing to get selected videos for this section
        const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];
        const hoveredVideo = this.hoveredVideosBySection[sectionId];

        // Only clear if there are selected videos
        if (selectedVideos.length > 0) {
          this.selectedVideosBySection[sectionId] = hoveredVideo
            ? [hoveredVideo]
            : [];
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
  const contentState = new ContentState(pageState);
  return setContext(key, contentState);
}

export function getContentState(key = DEFAULT_KEY) {
  return getContext<ContentState>(key);
}
