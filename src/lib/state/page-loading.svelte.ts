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
  reset(pageKey?: string) {
    // If we have a page key and it's the same as current, and we've completed initial load,
    // don't reset to prevent flashing
    if (pageKey && pageKey === this.#currentPageKey && this.#hasCompletedInitialLoad) {
      return;
    }
    
    // If it's a new page, update the page key and allow reset
    if (pageKey && pageKey !== this.#currentPageKey) {
      this.#currentPageKey = pageKey;
      this.#hasCompletedInitialLoad = false;
    }
    
    this.isLoading = true;
    this.imagesReady = false;
    this.error = null;
  }
  
  /**
   * Complete loading (images ready, no error)
   */
  complete() {
    this.isLoading = false;
    this.imagesReady = true;
    this.error = null;
    this.#hasCompletedInitialLoad = true;
  }
  
  /**
   * Fail loading (set error and stop loading)
   */
  fail(error: string) {
    this.isLoading = false;
    this.imagesReady = false;
    this.error = error;
    this.#hasCompletedInitialLoad = true;
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