import type { Video } from '$lib/supabase/videos';
import type { Playlist } from '$lib/supabase/playlists';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import { getContext, setContext } from 'svelte';
import { createDragImage } from '$lib/utils/dragdrop';
import {
  isPlaylistVideosFilter,
  type CombinedContentFilter,
} from '$lib/components/content/content-filter';
import { handleUpdatePlaylistVideoPosition } from '$lib/components/playlist/playlist-service';
import type { PageState } from './page.svelte';
import type {
  ContentDisplay,
  ContentSelectVariant,
} from '$lib/components/content/content';

export type DragContentType = 'video' | 'playlist' | null;

export type PlaylistImageInfo = Record<string, string | undefined>;

// Default section ID for single-section pages
export const DEFAULT_SECTION_ID = 'defaultSection';

export interface CarouselState {
  lastViewedIndex: number;
}

// Video drag and drop CSS classes
export const VIDEO_DROPZONE_CLASSES = [
  'border-solid',
  'border-primary',
  'bg-primary/40',
];

export const END_DROPZONE_CLASSES = ['border-transparent'];

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
    e: DragEvent & { currentTarget: EventTarget & HTMLElement }
  ) => void;
  handleDrop: (event: DragEvent, index: number, sectionId?: string) => void;
  handleDragStart: (
    event: DragEvent & { currentTarget: HTMLElement },
    index: number,
    sectionId?: string
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
  openDrawerSection = $state<string | null>(null);

  drawerVariant = $state<ContentSelectVariant | null>(null);

  isDropdownMenuOpen = $state(false);
  openDropdownId = $state<string | null>(null);

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

  isDrawerOpenForSection(sectionId: string = DEFAULT_SECTION_ID): boolean {
    return this.openDrawerSection === sectionId;
  }

  isDrawerOpenForAnySection(): boolean {
    for (const sectionId in this.selectedVideosBySection) {
      if (this.openDrawerSection && this.isDrawerOpenForSection(sectionId)) {
        return true;
      }
    }
    return false;
  }
  resetState() {
    // Reset selections
    this.selectedVideosBySection = {};

    // Reset hover states
    this.hoveredVideosBySection = {};

    // Reset dropdown states
    this.isDropdownMenuOpen = false;
    this.openDropdownId = null;

    // Reset context menu states
    this.openContextMenuSection = null;

    // Reset any other state that should be cleared when switching views
    this.dragContentType = null;
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
      this.dragContentType === 'video' &&
      playlist.created_by === session?.user.id
    ) {
      return VIDEO_DROPZONE_CLASSES;
    }
    return [];
  }

  getEndDropzoneClasses(): string[] {
    return END_DROPZONE_CLASSES;
  }

  // Helper method to clear hover states during drag operations
  clearHoverStatesDuringDrag() {
    // Clear all hover states when drag starts to prevent CSS conflicts
    for (const sectionId in this.hoveredVideosBySection) {
      this.hoveredVideosBySection[sectionId] = null;
    }

    // Clear any pending hover timeout
    if (this.hoverTimeoutId) {
      clearTimeout(this.hoverTimeoutId);
      this.hoverTimeoutId = null;
    }

    // Add global dragging class to disable all CSS hover effects
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('dragging');
    }
  }

  // Helper method to restore hover states after drag operations
  enableHoverStatesAfterDrag() {
    // Remove global dragging class to re-enable CSS hover effects
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('dragging');
    }
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

  getVideoDragClasses(index: number, contentDisplay: ContentDisplay): string {
    let classes = 'relative';

    if (this.draggedIndex === index) {
      classes += ' ';
    }

    if (this.targetIndex === index) {
      classes += ' relative';

      if (contentDisplay === 'TABLE') {
        if (
          this.draggedIndex === null ||
          this.draggedIndex < this.targetIndex
        ) {
          // Show indicator at the bottom
          classes +=
            ' after:absolute after:left-0 after:bottom-0 after:w-full after:h-[2px] after:bg-primary after:z-10';
        } else {
          // Show indicator at the top (using after with negative margin)
          classes +=
            ' after:absolute after:left-0 after:top-0 after:-mt-px after:w-full after:h-[2px] after:bg-primary after:z-10';
        }
      } else {
        if (
          this.draggedIndex === null ||
          this.draggedIndex < this.targetIndex
        ) {
          // Show indicator at the right (vertical line)
          classes +=
            ' after:absolute after:right-0 after:top-0 after:w-[2px] after:h-full after:bg-primary after:z-10';
        } else {
          // Show indicator at the left (vertical line)
          classes +=
            ' after:absolute after:left-0 after:top-0 after:w-[2px] after:h-full after:bg-primary after:z-10';
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

      // Re-enable hover states after drag operation completes
      this.enableHoverStatesAfterDrag();
    };

    const handleDragLeave = (
      e: DragEvent & { currentTarget: EventTarget & HTMLElement }
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
      sectionId: string = DEFAULT_SECTION_ID
    ) => {
      // Clear hover states to prevent CSS conflicts during drag
      this.clearHoverStatesDuringDrag();

      // Clear selections from all other sections first
      if (options.clearSelection) {
        this.clearAllSections();
      }

      // Track which section this drag started from
      this.draggedFromSectionId = sectionId;

      // Set the drag index for visual feedback
      this.draggedIndex = index;

      // Set drag content type
      this.dragContentType = 'video';

      // Handle drag data transfer and drag image
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', index.toString());

        // Get the video being dragged
        const draggedVideo = options.videos[index];

        let videosForDrag: Video[];

        // Default behavior - manage selection state
        // Use nullish coalescing to get selected videos for this section
        const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];

        // Check if the dragged video is in the selected videos
        const isDraggedVideoSelected = selectedVideos.some(
          (video) => video.id === draggedVideo.id
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
      sectionId: string = DEFAULT_SECTION_ID
    ) => {
      if (!options.allowVideoReorder || !options.supabase) return;
      if (
        !options.playlist ||
        options.contentFilter?.sort.key !== 'playlistOrder'
      ) {
        return;
      }

      event.preventDefault();
      if (this.draggedIndex !== null && this.draggedIndex !== index) {
        const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];
        const videosToMove =
          selectedVideos.length > 0
            ? selectedVideos
            : [options.videos[this.draggedIndex]];

        const sortedVideosToMove = videosToMove.sort((a, b) => {
          const indexA = options.videos.findIndex((v) => v.id === a.id);
          const indexB = options.videos.findIndex((v) => v.id === b.id);
          return indexA - indexB;
        });

        const videoIds = sortedVideosToMove.map((video) => video.id);
        const movingDown = this.draggedIndex < index;

        // Create the final array
        const updatedVideos = [...options.videos];
        const remainingVideos = updatedVideos.filter(
          (video) => !videoIds.includes(video.id)
        );

        const targetIndex = movingDown ? index + 1 : index;
        const movedVideosBefore = sortedVideosToMove.filter((video) => {
          const originalIndex = options.videos.findIndex(
            (v) => v.id === video.id
          );
          return originalIndex < targetIndex;
        }).length;

        const insertIndex = Math.max(
          0,
          Math.min(targetIndex - movedVideosBefore, remainingVideos.length)
        );

        const finalVideos = [
          ...remainingVideos.slice(0, insertIndex),
          ...sortedVideosToMove,
          ...remainingVideos.slice(insertIndex),
        ];

        // Update local state
        options.onVideosUpdate?.(finalVideos);

        // Calculate database position based on where the video ended up in the final array
        const firstMovedVideoNewIndex = finalVideos.findIndex(
          (v) => v.id === sortedVideosToMove[0].id
        );

        let newPosition: number;
        if (options.contentFilter.sort.order === 'ascending') {
          // Position 1, 2, 3, 4... (1-based)
          newPosition = firstMovedVideoNewIndex + 1;
        } else {
          // Position from the end (1-based from bottom)
          newPosition = finalVideos.length - firstMovedVideoNewIndex;
        }

        if (!isPlaylistVideosFilter(options.contentFilter)) {
          throw new Error('Invalid content filter, expected playlist filter');
        }

        handleUpdatePlaylistVideoPosition({
          videos: sortedVideosToMove,
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
          (v) => v.id === lastSelectedVideo.id
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

  closeAllDropdowns() {
    this.isDropdownMenuOpen = false;
    this.openDropdownId = null;
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

    // Close any open dropdowns when context menu is opened
    this.closeAllDropdowns();

    this.openContextMenuSection = sectionId;

    // Use nullish coalescing to get selected videos for this section
    const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];
    const isVideoSelected = selectedVideos.some((v) => v.id === video.id);

    if (!isVideoSelected) {
      // If the video isn't already selected, make it the only selected video
      this.selectedVideosBySection[sectionId] = [video];
    }

    // Remove the hovered video setting since we're using selected state
    // this.hoveredVideosBySection[sectionId] = video;
  }

  handleDrawer({
    video,
    sectionId = DEFAULT_SECTION_ID,
    variant,
  }: {
    video?: Video;
    sectionId?: string;
    variant: ContentSelectVariant;
  }) {
    // Clear selections from all other sections first
    this.clearOtherSections(sectionId);

    // Close any existing drawer from other sections
    if (this.openDrawerSection && this.openDrawerSection !== sectionId) {
      this.openDrawerSection = null;
    }

    this.openDrawerSection = sectionId;
    this.drawerVariant = variant;

    if (video) {
      // For drawer operations, we should always set the video as selected
      // This ensures it persists even if hover state gets cleared
      this.selectedVideosBySection[sectionId] = [video];

      // Also set as hovered for consistency
      this.hoveredVideosBySection[sectionId] = video;
    }
  }

  // Helper method to get drawer variant for a section
  getDrawerVariant(
    sectionId: string = DEFAULT_SECTION_ID
  ): ContentSelectVariant | null {
    return this.isDrawerOpenForSection(sectionId) ? this.drawerVariant : null;
  }

  setupClickOutsideListener(
    containerElement: HTMLElement,
    sectionId: string = DEFAULT_SECTION_ID
  ) {
    const handleClickOutside = (event: MouseEvent) => {
      this.hoverTimeoutId = null;

      // Check if click is outside the container
      if (!containerElement.contains(event.target as Node)) {
        // Check if the click is on a context menu or dropdown menu
        const target = event.target as HTMLElement;
        const isClickingOnContextMenu =
          target.closest('[role="menu"]') ||
          target.closest('[data-radix-popper-content-wrapper]');
        const isClickingOnDropdown =
          target.closest('[data-dropdown]') ||
          target.closest('[role="listbox"]') ||
          target.closest('[role="combobox"]');

        // If clicking on context menu items, don't clear anything
        if (isClickingOnContextMenu) {
          return;
        }

        // If clicking on drawer elements, don't clear anything
        if (this.isDrawerOpenForAnySection()) {
          return;
        }

        // If context menu is open and we're clicking elsewhere (like dropdown),
        // close the context menu but preserve selection temporarily
        if (this.isContextMenuOpenForAnySection()) {
          this.openContextMenuSection = null;
          // Don't clear selection immediately - let the dropdown action complete
          // The selection will be cleared by other mechanisms or timeout
          return;
        }

        // Don't clear selection if:
        // - User is dragging
        // - User is holding modifier keys (shift, ctrl, cmd)
        // - Dropdown menu is open
        // - Clicking on dropdown elements
        if (
          this.isDropdownMenuOpen ||
          this.dragContentType ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          isClickingOnDropdown
        ) {
          return;
        }

        // Normal click outside behavior - clear selection
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

    // Use capture phase to ensure our listener runs first
    document.addEventListener('click', handleClickOutside, { capture: true });

    return () => {
      document.removeEventListener('click', handleClickOutside, {
        capture: true,
      });
    };
  }
}

const DEFAULT_KEY = '$_content_state';

export function setContentState(pageState: PageState, key = DEFAULT_KEY) {
  const contentState = new ContentState(pageState);
  return setContext(key, contentState);
}

export function getContentState(key = DEFAULT_KEY) {
  return getContext<ContentState>(key);
}
