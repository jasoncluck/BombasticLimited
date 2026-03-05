/**
 * Page loading state management for image preloading
 * Provides reactive state for showing loading UI until images are ready
 */

import { browser } from '$app/environment';

export interface PageLoadingState {
  isLoading: boolean;
  imagesReady: boolean;
  error: string | null;
}

class PageLoadingStateClass {
  isLoading = $state(true);
  imagesReady = $state(false);
  error = $state<string | null>(null);

  // Track if we've completed loading for the current page to prevent resets
  #hasCompletedInitialLoad = false;
  #currentPageKey: string | null = null;

  // Delayed loading overlay state for search
  #showLoadingOverlay = $state(false);
  #loadingDelayTimeout: ReturnType<typeof setTimeout> | null = null;
  #searchString: string | null = null;
  #searchTimestamp: number = 0;

  /**
   * Set loading state
   */
  setLoading(loading: boolean) {
    this.isLoading = loading;
  }

  /**
   * Set images ready state
   */
  setImagesReady(ready: boolean) {
    this.imagesReady = ready;
    // If images are ready and no error, we're not loading anymore
    if (ready && !this.error) {
      this.isLoading = false;
    }
  }

  /**
   * Set error state
   */
  setError(error: string | null) {
    this.error = error;
    // If there's an error, stop loading (show content anyway)
    if (error) {
      this.isLoading = false;
    }
  }

  /**
   * Reset all states only if we haven't completed initial load for this page
   */
  reset(pageKey?: string, searchString?: string, delayMs?: number) {
    // If we have a page key and it's the same as current, and we've completed initial load,
    // don't reset to prevent flashing
    if (
      pageKey &&
      pageKey === this.#currentPageKey &&
      this.#hasCompletedInitialLoad
    ) {
      return;
    }

    // If it's a new page, update the page key and allow reset
    if (pageKey && pageKey !== this.#currentPageKey) {
      this.#currentPageKey = pageKey;
      this.#hasCompletedInitialLoad = false;
    }

    // Clear any existing delay timeout
    if (this.#loadingDelayTimeout) {
      clearTimeout(this.#loadingDelayTimeout);
      this.#loadingDelayTimeout = null;
    }

    this.isLoading = true;
    this.imagesReady = false;
    this.error = null;
    this.#showLoadingOverlay = false;

    // If this is a search and we have a delay, set up delayed overlay
    if (searchString && delayMs && delayMs > 0) {
      const currentSearchTimestamp = Date.now();
      this.#searchString = searchString;
      this.#searchTimestamp = currentSearchTimestamp;

      this.#loadingDelayTimeout = setTimeout(() => {
        // Only show overlay if search string hasn't changed and we're still loading
        if (
          this.#searchString === searchString &&
          this.#searchTimestamp === currentSearchTimestamp &&
          this.isLoading &&
          !this.imagesReady
        ) {
          this.#showLoadingOverlay = true;
        }
      }, delayMs);
    } else {
      // For non-search pages, show overlay immediately
      this.#showLoadingOverlay = true;
    }
  }

  /**
   * Get whether to show loading overlay (with potential delay for search)
   */
  get shouldShowLoadingOverlay(): boolean {
    return this.isLoading && !this.imagesReady && this.#showLoadingOverlay;
  }

  /**
   * Complete loading (images ready, no error)
   */
  complete() {
    this.isLoading = false;
    this.imagesReady = true;
    this.error = null;
    this.#hasCompletedInitialLoad = true;
    this.#showLoadingOverlay = false;

    // Clear any pending delay timeout
    if (this.#loadingDelayTimeout) {
      clearTimeout(this.#loadingDelayTimeout);
      this.#loadingDelayTimeout = null;
    }
  }

  /**
   * Fail loading (set error and stop loading)
   */
  fail(error: string) {
    this.isLoading = false;
    this.imagesReady = false;
    this.error = error;
    this.#hasCompletedInitialLoad = true;
    this.#showLoadingOverlay = false;

    // Clear any pending delay timeout
    if (this.#loadingDelayTimeout) {
      clearTimeout(this.#loadingDelayTimeout);
      this.#loadingDelayTimeout = null;
    }
  }
}

// Global instance for page loading state
let pageLoadingState: PageLoadingStateClass | null = null;

/**
 * Get or create the page loading state instance
 */
export function getPageLoadingState(): PageLoadingStateClass {
  if (!browser) {
    // Return a mock state for SSR
    return {
      isLoading: false,
      imagesReady: true,
      error: null,
      shouldShowLoadingOverlay: false,
      setLoading: () => {},
      setImagesReady: () => {},
      setError: () => {},
      reset: () => {},
      complete: () => {},
      fail: () => {},
    } as unknown as PageLoadingStateClass;
  }

  if (!pageLoadingState) {
    pageLoadingState = new PageLoadingStateClass();
  }

  return pageLoadingState;
}
