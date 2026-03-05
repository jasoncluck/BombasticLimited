import { getContext, setContext } from 'svelte';
import type { DragContentType } from './content.svelte';

export interface ScrollPosition {
  scrollTop?: number;
  scrollLeft?: number;
}

export interface ScrollState {
  scrolling: boolean;
  direction: 'up' | 'down' | null;
  interval: number | null;
}

export interface ViewportRefs {
  sidebarViewportRef: HTMLElement | null;
  contentViewportRef: HTMLElement | null;
}

export interface AutoScrollConfig {
  scrollSpeed: number; // pixels per frame
  scrollZoneSize: number; // height of invisible areas in pixels
}

export interface PageState {
  // Scroll position override on page before navigation
  contentScrollPosition: ScrollPosition | null;
  sidebarScrollPosition: ScrollPosition | null;
  contentScrollState: ScrollState;
  sidebarScrollState: ScrollState;

  // Auto-scroll functionality
  autoScrollConfig: AutoScrollConfig;

  // Viewport references
  viewportRefs: ViewportRefs;

  // Auto-scroll methods
  startAutoScroll: (
    viewportRef: HTMLElement | null,
    scrollState: ScrollState
  ) => void;
  stopAutoScroll: (scrollState: ScrollState) => void;
  handleViewportDragOver: (
    e: DragEvent,
    viewportRef: HTMLElement,
    scrollState: ScrollState
  ) => void;
  handleDragOver: (e: DragEvent, dragContentType: DragContentType) => void;
  handleDragEnd: () => void;
  handleDrop: () => void;

  // Viewport snapshot utilities
  createViewportSnapshot: (viewportRef: HTMLElement | null) => ScrollPosition;
  restoreViewportScroll: (
    viewportRef: HTMLElement | null,
    position: ScrollPosition | null
  ) => void;

  // Viewport reference setters
  setSidebarViewportRef: (ref: HTMLElement | null) => void;
  setContentViewportRef: (ref: HTMLElement | null) => void;

  // Cleanup method
  cleanup: () => void;
}

export class PageStateClass implements PageState {
  contentScrollPosition = $state<ScrollPosition | null>(null);
  sidebarScrollPosition = $state<ScrollPosition | null>(null);
  contentScrollState = $state<ScrollState>({
    scrolling: false,
    direction: null,
    interval: null,
  });
  sidebarScrollState = $state<ScrollState>({
    scrolling: false,
    direction: null,
    interval: null,
  });

  autoScrollConfig = $state<AutoScrollConfig>({
    scrollSpeed: 10, // pixels per frame
    scrollZoneSize: 50, // height of invisible areas in pixels
  });

  viewportRefs = $state<ViewportRefs>({
    sidebarViewportRef: null,
    contentViewportRef: null,
  });

  // Viewport reference setters
  setSidebarViewportRef(ref: HTMLElement | null) {
    this.viewportRefs.sidebarViewportRef = ref;
  }

  setContentViewportRef(ref: HTMLElement | null) {
    this.viewportRefs.contentViewportRef = ref;
  }

  // Function to start auto-scrolling for a specific viewport
  startAutoScroll(viewportRef: HTMLElement | null, scrollState: ScrollState) {
    // Clear any existing interval first
    if (scrollState.interval !== null) {
      window.clearInterval(scrollState.interval);
    }

    if (viewportRef && scrollState.direction) {
      scrollState.scrolling = true;
      scrollState.interval = window.setInterval(() => {
        if (viewportRef && scrollState.direction) {
          if (scrollState.direction === 'up') {
            viewportRef.scrollTop = Math.max(
              0,
              viewportRef.scrollTop - this.autoScrollConfig.scrollSpeed
            );
          } else if (scrollState.direction === 'down') {
            viewportRef.scrollTop += this.autoScrollConfig.scrollSpeed;
          }

          // If this is the content viewport, update scroll position
          if (viewportRef === this.viewportRefs.contentViewportRef) {
            this.contentScrollPosition = {
              scrollTop: viewportRef.scrollTop,
              scrollLeft: viewportRef.scrollLeft,
            };
          }
        }
      }, 16); // ~60fps
    }
  }

  // Function to stop auto-scrolling for a specific viewport
  stopAutoScroll(scrollState: ScrollState) {
    if (scrollState.interval !== null) {
      window.clearInterval(scrollState.interval);
      scrollState.interval = null;
      scrollState.direction = null;
      scrollState.scrolling = false;
    }
  }

  // Generic handler for viewport drag over
  handleViewportDragOver(
    e: DragEvent,
    viewportRef: HTMLElement,
    scrollState: ScrollState
  ) {
    // Get the bounding rect of the scroll container
    const rect = viewportRef.getBoundingClientRect();
    const mouseY = e.clientY;

    // Check if mouse is in top scroll zone
    if (mouseY - rect.top < this.autoScrollConfig.scrollZoneSize) {
      if (scrollState.direction !== 'up') {
        scrollState.direction = 'up';
        this.startAutoScroll(viewportRef, scrollState);
      }
    }
    // Check if mouse is in bottom scroll zone
    else if (rect.bottom - mouseY < this.autoScrollConfig.scrollZoneSize) {
      if (scrollState.direction !== 'down') {
        scrollState.direction = 'down';
        this.startAutoScroll(viewportRef, scrollState);
      }
    }
    // Mouse is not in a scroll zone
    else if (scrollState.direction !== null) {
      this.stopAutoScroll(scrollState);
    }
  }

  // Handle dragover for auto-scrolling - specific to each viewport
  handleDragOver(e: DragEvent, dragContentType: DragContentType) {
    if (!dragContentType) return;
    e.preventDefault(); // Allow drop

    // Check if we're over the sidebar viewport
    if (
      this.viewportRefs.sidebarViewportRef &&
      this.viewportRefs.sidebarViewportRef.contains(e.target as Node)
    ) {
      this.handleViewportDragOver(
        e,
        this.viewportRefs.sidebarViewportRef,
        this.sidebarScrollState
      );
    }

    if (
      this.viewportRefs.contentViewportRef &&
      this.viewportRefs.contentViewportRef.contains(e.target as Node)
    ) {
      this.handleViewportDragOver(
        e,
        this.viewportRefs.contentViewportRef,
        this.contentScrollState
      );
    }
  }

  // Handle drag end - clean up all scrolling
  handleDragEnd() {
    this.stopAutoScroll(this.sidebarScrollState);
    this.stopAutoScroll(this.contentScrollState);
  }

  handleDrop() {
    this.stopAutoScroll(this.sidebarScrollState);
    this.stopAutoScroll(this.contentScrollState);
  }

  // Function to create a snapshot for each viewport
  createViewportSnapshot(viewportRef: HTMLElement | null): ScrollPosition {
    return {
      scrollTop: viewportRef?.scrollTop ?? 0,
      scrollLeft: viewportRef?.scrollLeft ?? 0,
    };
  }

  // Utility function for restoring position or setting defaults for a viewport
  restoreViewportScroll(
    viewportRef: HTMLElement | null,
    position: ScrollPosition | null
  ) {
    if (viewportRef && position) {
      viewportRef.scrollTop = position.scrollTop ?? 0;
      viewportRef.scrollLeft = position.scrollLeft ?? 0;
    }
  }

  // Cleanup method for intervals
  cleanup() {
    if (this.sidebarScrollState.interval !== null) {
      window.clearInterval(this.sidebarScrollState.interval);
    }
    if (this.contentScrollState.interval !== null) {
      window.clearInterval(this.contentScrollState.interval);
    }
  }
}

const DEFAULT_KEY = '$_page_state';

export function setPageState(key = DEFAULT_KEY) {
  const pageState = new PageStateClass();
  return setContext(key, pageState);
}

export function getPageState(key = DEFAULT_KEY) {
  return getContext<PageState>(key);
}

// Legacy exports for backward compatibility (can be removed once all references are updated)
export function createViewportSnapshot(
  viewportRef: HTMLElement | null
): ScrollPosition {
  return {
    scrollTop: viewportRef?.scrollTop ?? 0,
    scrollLeft: viewportRef?.scrollLeft ?? 0,
  };
}

export function restoreViewportScroll(
  viewportRef: HTMLElement | null,
  position: ScrollPosition | null
) {
  if (viewportRef && position) {
    viewportRef.scrollTop = position.scrollTop ?? 0;
    viewportRef.scrollLeft = position.scrollLeft ?? 0;
  }
}
