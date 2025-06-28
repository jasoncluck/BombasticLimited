export interface ScrollPosition {
  scrollTop?: number;
  scrollLeft?: number;
}

export interface ScrollState {
  scrolling: boolean;
  direction: "up" | "down" | null;
  interval: number | null;
}

interface PageState {
  // Scroll position override on page before navigation
  contentScrollPosition: ScrollPosition | null;
  sidebarScrollPosition: ScrollPosition | null;
  contentScrollState: ScrollState;
  sidebarScrollState: ScrollState;
}

export let pageState = $state<PageState>({
  contentScrollPosition: null,
  sidebarScrollPosition: null,
  contentScrollState: { scrolling: false, direction: null, interval: null },
  sidebarScrollState: { scrolling: false, direction: null, interval: null },
});

// Function to create a snapshot for each viewport
export function createViewportSnapshot(
  viewportRef: HTMLElement | null,
): ScrollPosition {
  return {
    scrollTop: viewportRef?.scrollTop ?? 0,
    scrollLeft: viewportRef?.scrollLeft ?? 0,
  };
}

// Utility function for restoring position or setting defaults for a viewport
export function restoreViewportScroll(
  viewportRef: HTMLElement | null,
  position: ScrollPosition | null,
) {
  if (viewportRef && position) {
    viewportRef.scrollTop = position.scrollTop ?? 0;
    viewportRef.scrollLeft = position.scrollLeft ?? 0;
  }
}
