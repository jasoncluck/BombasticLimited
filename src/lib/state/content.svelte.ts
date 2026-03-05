/* eslint-disable svelte/prefer-svelte-reactivity */

import type { Video } from '$lib/supabase/videos';
import type { Playlist } from '$lib/supabase/playlists';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
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
import { SvelteSet } from 'svelte/reactivity';

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

export interface Session {
  user: {
    id: string;
  };
}

export class ContentState {
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

  lastDropdownOpenTime = $state(0);

  // Track context menu state to prevent race conditions
  private contextMenuCloseScheduled = $state<NodeJS.Timeout | null>(null);

  pendingVideoOperations = $state<
    Set<Promise<{ error?: PostgrestError | null }>>
  >(new Set());

  // Dropdown state validation interval
  private dropdownValidationInterval: ReturnType<typeof setInterval> | null =
    null;

  // Click outside listeners cleanup functions
  private clickOutsideCleanup: (() => void) | null = null;
  private contextMenuOutsideCleanup: (() => void) | null = null;

  constructor() {
    this.startDropdownValidation();
    this.setupGlobalClickHandling(); // Use consolidated setup
  }

  // Start interval to validate dropdown state against DOM reality
  private startDropdownValidation(): void {
    if (typeof window === 'undefined') return; // Skip on server-side

    this.dropdownValidationInterval = setInterval(() => {
      this.validateDropdownState();
    }, 250); // Check every 250ms
  }

  // Check if dropdown/context menu elements are actually visible in the DOM
  private checkForActiveDropdowns(): boolean {
    if (typeof document === 'undefined') return false;

    try {
      // Check for visible dropdown menus (Radix UI patterns)
      const dropdownMenus = document.querySelectorAll(
        '[role="menu"][data-state="open"]'
      );
      const contextMenus = document.querySelectorAll(
        '[role="menu"][data-radix-context-menu-content]'
      );
      const dropdownContents = document.querySelectorAll(
        '[data-testid="content-dropdown-content"]'
      );
      const contextMenuContents = document.querySelectorAll(
        '[data-testid="content-context-menu-content"]'
      );

      const allMenuElements = [
        ...Array.from(dropdownMenus),
        ...Array.from(contextMenus),
        ...Array.from(dropdownContents),
        ...Array.from(contextMenuContents),
      ];

      const visibleMenus = allMenuElements.filter((el) => {
        const style = window.getComputedStyle(el);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          el.getBoundingClientRect().width > 0 &&
          el.getBoundingClientRect().height > 0
        );
      });

      return visibleMenus.length > 0;
    } catch (error) {
      console.warn('Error checking for active dropdowns:', error);
      return false;
    }
  }

  // Validate dropdown state against DOM reality and fix mismatches
  private validateDropdownState(): void {
    try {
      const hasActiveDropdowns = this.checkForActiveDropdowns();
      const stateThingsOpen =
        this.isDropdownMenuOpen || this.openContextMenuSection !== null;

      // Safety fallback, if state says dropdowns are open but none are actually visible, reset the state
      if (stateThingsOpen && !hasActiveDropdowns) {
        // Reset the content state to close dropdowns
        this.isDropdownMenuOpen = false;
        this.openDropdownId = null;
        this.openContextMenuSection = null;
      }
    } catch (error) {
      console.warn('Error validating dropdown state:', error);
    }
  }

  // Public method to force dropdown validation (can be called externally if needed)
  public forceDropdownValidation(): void {
    this.validateDropdownState();
  }

  // Single consolidated click handler
  private globalClickHandler = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;

    // Handle context menu closing first
    if (this.openContextMenuSection && this.shouldCloseContextMenu(target)) {
      this.openContextMenuSection = null;
      if (this.contextMenuCloseScheduled) {
        clearTimeout(this.contextMenuCloseScheduled);
        this.contextMenuCloseScheduled = null;
      }
      return;
    }

    // Handle dropdown interactions - but not if a dropdown was just opened
    // if (
    //   this.isDropdownMenuOpen &&
    //   Date.now() - this.lastDropdownOpenTime > 250 && // grace period
    //   this.shouldCloseDropdowns(target)
    // ) {
    //   this.closeAllDropdowns();
    //   return;
    // }

    // Handle selection clearing last
    if (this.shouldClearSelections(event, target)) {
      this.clearSelectionsOnOutsideClick();
    }
  };

  private shouldCloseContextMenu(target: HTMLElement): boolean {
    const isClickingOnContextMenu =
      target.closest('[data-slot="context-menu-item"]') ||
      target.closest('[role="menu"][data-radix-context-menu-content]') ||
      target.closest('[data-radix-context-menu-content]') ||
      // Add these selectors to catch SubTrigger and SubContent interactions
      target.closest('[data-radix-context-menu-sub-trigger]') ||
      target.closest('[data-radix-context-menu-sub-content]');

    return !isClickingOnContextMenu;
  }

  private shouldCloseDropdowns(target: HTMLElement): boolean {
    const isClickingOnDropdown =
      target.closest('[data-radix-dropdown-menu-trigger]') ||
      target.closest('[data-radix-dropdown-menu-content]') ||
      target.closest('[role="menu"]');

    return !isClickingOnDropdown;
  }

  private shouldClearSelections(
    event: MouseEvent,
    target: HTMLElement
  ): boolean {
    // Don't clear selections if any of these conditions are true:
    return !(
      this.dragContentType || // User is dragging
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey || // Modifier keys held
      this.isDropdownMenuOpen || // Dropdown is open
      this.openContextMenuSection || // Context menu is open
      this.isDrawerOpenForAnySection() || // Drawer is open
      // Clicking on dropdown/menu elements
      target.closest('[data-radix-dropdown-menu-trigger]') ||
      target.closest('[data-radix-dropdown-menu-content]') ||
      target.closest('[role="menu"]') ||
      // Add context menu selectors to prevent clearing selections
      target.closest('[data-radix-context-menu-sub-trigger]') ||
      target.closest('[data-radix-context-menu-sub-content]') ||
      target.closest('[data-radix-context-menu-content]')
    );
  }

  private clearSelectionsOnOutsideClick(): void {
    // Clear selections from all sections
    for (const sectionId in this.selectedVideosBySection) {
      const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];
      const hoveredVideo = this.hoveredVideosBySection[sectionId];

      if (selectedVideos.length > 0) {
        this.selectedVideosBySection[sectionId] = hoveredVideo
          ? [hoveredVideo]
          : [];
      }
    }
  }

  // Consolidated setup method - replaces both old setup methods
  public setupGlobalClickHandling(): () => void {
    if (typeof document === 'undefined') return () => {};

    // Remove old listeners if they exist
    if (this.clickOutsideCleanup) {
      this.clickOutsideCleanup();
    }
    if (this.contextMenuOutsideCleanup) {
      this.contextMenuOutsideCleanup();
    }

    // Use bubble phase (default) instead of capture phase to allow event.stopPropagation() to work
    document.addEventListener('click', this.globalClickHandler);
    document.addEventListener('contextmenu', this.handleGlobalContextMenu, {
      capture: true,
    });

    // Store cleanup function
    const cleanup = (): void => {
      document.removeEventListener('click', this.globalClickHandler);
      document.removeEventListener(
        'contextmenu',
        this.handleGlobalContextMenu,
        { capture: true }
      );
    };

    this.clickOutsideCleanup = cleanup;
    return cleanup;
  }

  private handleGlobalContextMenu = (event: MouseEvent): void => {
    // Only handle if a context menu is already open
    if (!this.openContextMenuSection) return;

    const target = event.target as HTMLElement;

    // Check if the right-click is inside a context menu
    const isClickingOnContextMenu =
      target.closest('[data-slot="context-menu-item"]') ||
      target.closest('[role="menu"][data-radix-context-menu-content]') ||
      target.closest('[data-radix-context-menu-content]') ||
      target.closest('[data-radix-context-menu-sub-trigger]') ||
      target.closest('[data-radix-context-menu-sub-content]');

    // Check if clicking on a video element (which should open a new context menu)
    const isClickingOnVideo =
      target.closest('[data-video-id]') ||
      target.closest('[data-testid="content-item"]') ||
      target.closest('[data-testid*="video"]');

    // If clicking outside both context menu and videos, close the context menu
    if (!isClickingOnContextMenu && !isClickingOnVideo) {
      event.preventDefault();
      this.openContextMenuSection = null;
      if (this.contextMenuCloseScheduled) {
        clearTimeout(this.contextMenuCloseScheduled);
        this.contextMenuCloseScheduled = null;
      }
    }
    // If clicking on a video element, let the video's context menu handler take over
    // (don't prevent the event, let it bubble to the video's oncontextmenu handler)
  };

  // Clean up interval when instance is destroyed
  public destroy(): void {
    if (this.dropdownValidationInterval) {
      clearInterval(this.dropdownValidationInterval);
      this.dropdownValidationInterval = null;
    }

    // Clean up click outside listeners
    if (this.clickOutsideCleanup) {
      this.clickOutsideCleanup();
      this.clickOutsideCleanup = null;
    }
  }

  // Helper methods for tracking pending video operations
  addPendingVideoOperation(
    operation: Promise<{ error?: PostgrestError | null }>
  ): void {
    this.pendingVideoOperations.add(operation);
    operation.finally(() => {
      this.pendingVideoOperations.delete(operation);
    });
  }

  async waitForPendingVideoOperations(): Promise<void> {
    if (this.pendingVideoOperations.size > 0) {
      try {
        await Promise.allSettled(Array.from(this.pendingVideoOperations));
      } catch (error) {
        console.error('Error waiting for pending video operations:', error);
      }
    }
  }

  hasPendingVideoOperations(): boolean {
    return this.pendingVideoOperations.size > 0;
  }

  // Helper methods for section-specific context menu tracking
  isContextMenuOpenForSection(sectionId: string = DEFAULT_SECTION_ID): boolean {
    return this.openContextMenuSection === sectionId;
  }

  isContextMenuOpenForAnySection(): boolean {
    return this.openContextMenuSection !== null;
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

  resetState(): void {
    // Destroy any running intervals first
    this.destroy();

    // Reset carousel state
    this.carouselState = { lastViewedIndex: 0 };

    // Reset selections
    this.selectedVideosBySection = {};

    // Reset hover states
    this.hoveredVideosBySection = {};

    // Reset dropdown states
    this.isDropdownMenuOpen = false;
    this.openDropdownId = null;

    // Reset context menu states
    this.openContextMenuSection = null;

    // Reset drawer states
    this.openDrawerSection = null;
    this.drawerVariant = null;

    // Reset drag and drop states
    this.dragContentType = null;
    this.draggedIndex = null;
    this.targetIndex = null;
    this.draggedFromSectionId = null;

    // Reset click tracking for double-click detection
    this.lastClickTime = 0;
    this.lastClickedVideo = null;

    // Clear any pending hover timeout
    if (this.hoverTimeoutId) {
      clearTimeout(this.hoverTimeoutId);
      this.hoverTimeoutId = null;
    }

    // Clear any pending context menu close
    if (this.contextMenuCloseScheduled) {
      clearTimeout(this.contextMenuCloseScheduled);
      this.contextMenuCloseScheduled = null;
    }

    // Reset menu states
    this.isMenuOpen = false;
    this.isMouseOverMenu = false;

    // Clear pending video operations
    this.pendingVideoOperations.clear();

    // Clear any global CSS classes that might persist
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('dragging');
    }

    // Restart dropdown validation and global listeners after reset
    this.startDropdownValidation();
    this.setupGlobalClickHandling();
  }

  // Reset state for a specific section
  resetSectionState(sectionId: string = DEFAULT_SECTION_ID): void {
    // Reset selections for this section
    this.selectedVideosBySection[sectionId] = [];

    // Reset hover states for this section
    this.hoveredVideosBySection[sectionId] = null;

    // If this section has an open context menu, close it
    if (this.openContextMenuSection === sectionId) {
      this.openContextMenuSection = null;
    }

    // If this section has an open drawer, close it
    if (this.openDrawerSection === sectionId) {
      this.openDrawerSection = null;
      this.drawerVariant = null;
    }

    // Reset click tracking for double-click detection
    this.lastClickTime = 0;
    this.lastClickedVideo = null;

    // Clear any pending hover timeout
    if (this.hoverTimeoutId) {
      clearTimeout(this.hoverTimeoutId);
      this.hoverTimeoutId = null;
    }
  }

  private clearOtherSections(currentSectionId: string): void {
    for (const sectionId in this.selectedVideosBySection) {
      if (sectionId !== currentSectionId) {
        this.selectedVideosBySection[sectionId] = [];
        // Also clear hovered videos from other sections
        this.hoveredVideosBySection[sectionId] = null;
      }
    }
  }

  private clearAllSections(): void {
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
  getVideoDropzoneClasses(
    playlist: Playlist,
    session: Session | null
  ): string[] {
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
  clearHoverStatesDuringDrag(): void {
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
  enableHoverStatesAfterDrag(): void {
    // Remove global dragging class to re-enable CSS hover effects
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('dragging');
    }
  }

  // Mouse hover methods
  handleMouseEnter({
    video,
    sectionId = DEFAULT_SECTION_ID,
  }: MouseHoverOptions): void {
    // Don't update hoveredVideo if we're dragging
    if (!this.dragContentType) {
      // Clear any existing timeout when entering a new element
      if (this.hoverTimeoutId) {
        clearTimeout(this.hoverTimeoutId);
        this.hoverTimeoutId = null;
      }

      this.hoveredVideosBySection[sectionId] = video;
    }
  }

  handleMouseLeave({
    sectionId = DEFAULT_SECTION_ID,
    removeSelectedOnHover,
  }: {
    sectionId?: string;
    removeSelectedOnHover?: boolean;
  }): void {
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
  }): void {
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
    const handleDragOver = (event: DragEvent, index: number): void => {
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

    const handleDragEnd = (): void => {
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
    ): void => {
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
    ): void => {
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

        // Default behavior - manage selection state
        // Use nullish coalescing to get selected videos for this section
        const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];

        // Check if the dragged video is in the selected videos
        const isDraggedVideoSelected = selectedVideos.some(
          (video) => video.id === draggedVideo.id
        );

        // If the dragged video is not in selectedVideos, use just the dragged video
        // Otherwise, use the selected videos
        const videosForDrag =
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
    ): void => {
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
  }): void {
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

          const existingIds = new SvelteSet(selectedVideos.map((v) => v.id));
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

  closeAllDropdowns(): void {
    this.isDropdownMenuOpen = false;
    this.openDropdownId = null;
  }

  handleContextMenu({
    video,
    sectionId = DEFAULT_SECTION_ID,
  }: {
    video: Video;
    sectionId?: string;
  }): void {
    // Clear any scheduled context menu close to prevent race conditions
    if (this.contextMenuCloseScheduled) {
      clearTimeout(this.contextMenuCloseScheduled);
      this.contextMenuCloseScheduled = null;
    }

    // Clear selections from all other sections first
    this.clearOtherSections(sectionId);

    // Close any open dropdowns when context menu is opened
    this.closeAllDropdowns();

    // If there's already a context menu open (same or different section)
    if (this.isAnyContextMenuOpen) {
      // Force close the existing context menu first
      this.openContextMenuSection = null;

      // Use a small timeout to ensure the previous context menu closes before opening new one
      // This gives Radix time to properly clean up the DOM
      this.contextMenuCloseScheduled = setTimeout(() => {
        // Open the new context menu
        this.openContextMenuSection = sectionId;

        // Set up the selection for the new video
        const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];
        const isVideoSelected = selectedVideos.some((v) => v.id === video.id);

        if (!isVideoSelected) {
          // If the video isn't already selected, make it the only selected video
          this.selectedVideosBySection[sectionId] = [video];
        }

        // Clear the scheduled timeout reference
        this.contextMenuCloseScheduled = null;
      }, 50); // Small delay to allow DOM cleanup
    } else {
      // No existing context menu, open directly
      this.openContextMenuSection = sectionId;

      // Set up the selection
      const selectedVideos = this.selectedVideosBySection[sectionId] ?? [];
      const isVideoSelected = selectedVideos.some((v) => v.id === video.id);

      if (!isVideoSelected) {
        // If the video isn't already selected, make it the only selected video
        this.selectedVideosBySection[sectionId] = [video];
      }
    }
  }

  handleDrawer({
    video,
    sectionId = DEFAULT_SECTION_ID,
    variant,
  }: {
    video?: Video;
    sectionId?: string;
    variant: ContentSelectVariant;
  }): void {
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
}

const DEFAULT_KEY = '$_content_state';

export function setContentState(key = DEFAULT_KEY): ContentState {
  const contentState = new ContentState();
  return setContext(key, contentState);
}

export function getContentState(key = DEFAULT_KEY): ContentState {
  return getContext<ContentState>(key);
}
