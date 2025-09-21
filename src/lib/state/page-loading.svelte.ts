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
   * Reset all states
   */
  reset() {
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
  }
  
  /**
   * Fail loading (set error and stop loading)
   */
  fail(error: string) {
    this.isLoading = false;
    this.imagesReady = false;
    this.error = error;
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
    } as PageLoadingStateClass;
  }
  
  if (!pageLoadingState) {
    pageLoadingState = new PageLoadingStateClass();
  }
  
  return pageLoadingState;
}