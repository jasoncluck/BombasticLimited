/**
 * Simple Page-Level Image Preloader
 * Uses a single intersection observer to track content containers and preload next batch of images
 */

import { browser } from '$app/environment';

export class SimpleImagePreloader {
  private observer: IntersectionObserver | null = null;
  private preloadedUrls = new Set<string>();
  private serviceWorkerReady = false;
  private isPreloading = false;
  private searchPreloadTimer: number | null = null;

  // Configuration
  private readonly PRELOAD_THRESHOLD = 0.5; // When 50% of container is visible
  private readonly PRELOAD_BATCH_SIZE = 10; // Preload next 10 images
  private readonly MAX_PRELOAD_DISTANCE = 1500; // Max pixels ahead to look for images
  
  // Search-specific configuration
  private readonly SEARCH_PRELOAD_DELAY = 200; // Delay before search preloading
  private readonly SEARCH_PRELOAD_BATCH_SIZE = 15; // Larger batch for search results

  constructor() {
    if (browser) {
      this.initializeServiceWorker();
      this.setupIntersectionObserver();
    }
  }

  private async initializeServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.ready;
        this.serviceWorkerReady = true;
        console.log('Simple preloader: Service worker ready');
      } catch (error) {
        console.warn('Simple preloader: Service worker not available', error);
      }
    }
  }

  private setupIntersectionObserver(): void {
    if (!browser) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.handleContainerVisible(entry.target as HTMLElement);
          }
        });
      },
      {
        threshold: this.PRELOAD_THRESHOLD,
        rootMargin: '200px', // Start preloading when container is 200px away
      }
    );
  }

  /**
   * Observe a content container for preloading
   */
  public observeContainer(container: HTMLElement): void {
    if (this.observer && container) {
      this.observer.observe(container);
    }
  }

  /**
   * Stop observing a container
   */
  public unobserveContainer(container: HTMLElement): void {
    if (this.observer && container) {
      this.observer.unobserve(container);
    }
  }

  /**
   * Handle when a container becomes visible - trigger preloading of next images
   */
  private handleContainerVisible(container: HTMLElement): void {
    if (this.isPreloading || !this.serviceWorkerReady) return;

    // Find next images that aren't loaded yet
    const nextImages = this.findNextImagesToPreload(container);
    
    if (nextImages.length > 0) {
      this.preloadImages(nextImages);
    }
  }

  /**
   * Find the next batch of images that should be preloaded
   */
  private findNextImagesToPreload(fromContainer: HTMLElement): string[] {
    const containerRect = fromContainer.getBoundingClientRect();
    const containerBottom = containerRect.bottom + window.scrollY;
    
    // Look for images below the current container
    const allImages = Array.from(document.querySelectorAll('img[data-image-index]')) as HTMLImageElement[];
    const nextImages: string[] = [];

    for (const img of allImages) {
      const imgRect = img.getBoundingClientRect();
      const imgTop = imgRect.top + window.scrollY;
      
      // Only consider images that are below the container and within preload distance
      if (
        imgTop > containerBottom && 
        imgTop < containerBottom + this.MAX_PRELOAD_DISTANCE
      ) {
        const src = img.src;
        if (src && !this.preloadedUrls.has(src)) {
          nextImages.push(src);
          
          // Stop when we have enough images for this batch
          if (nextImages.length >= this.PRELOAD_BATCH_SIZE) {
            break;
          }
        }
      }
    }

    return nextImages;
  }

  /**
   * Preload a batch of images using the service worker
   */
  private async preloadImages(urls: string[]): Promise<void> {
    if (!this.serviceWorkerReady || urls.length === 0) return;

    this.isPreloading = true;

    // Mark as preloaded to avoid duplicates
    urls.forEach(url => this.preloadedUrls.add(url));

    try {
      // Send to service worker for caching
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'PRELOAD_PREDICTIVE_IMAGES',
          urls,
          priority: 'low'
        });
      }

      console.log(`Simple preloader: Queued ${urls.length} images for preloading`);
    } catch (error) {
      console.warn('Simple preloader: Failed to preload images', error);
    } finally {
      // Reset preloading flag after a short delay
      setTimeout(() => {
        this.isPreloading = false;
      }, 500);
    }
  }

  /**
   * Manually trigger preloading for specific images
   */
  public preloadSpecificImages(urls: string[]): void {
    if (!this.serviceWorkerReady) return;

    const filteredUrls = urls.filter(url => !this.preloadedUrls.has(url));
    if (filteredUrls.length === 0) return;

    this.preloadImages(filteredUrls);
  }

  /**
   * Preload images specifically for search results during debounce period
   */
  public preloadSearchImages(searchQuery: string): void {
    if (!this.serviceWorkerReady || searchQuery.length < 2) return;

    // Clear any existing search preload timer
    if (this.searchPreloadTimer) {
      window.clearTimeout(this.searchPreloadTimer);
    }

    // Debounce search preloading to avoid excessive requests
    this.searchPreloadTimer = window.setTimeout(() => {
      this.performSearchPreload(searchQuery);
    }, this.SEARCH_PRELOAD_DELAY);
  }

  /**
   * Perform actual search preloading with smart batching
   */
  private async performSearchPreload(searchQuery: string): Promise<void> {
    if (this.isPreloading) return;

    try {
      // Look for search result containers that are likely to appear
      const searchContainers = document.querySelectorAll('[data-testid="search-results"], [data-testid="content-tiles"]');
      const visibleImages: string[] = [];

      searchContainers.forEach(container => {
        // Find images in search result containers
        const images = container.querySelectorAll('img[data-image-index], img[src*="supabase"]') as NodeListOf<HTMLImageElement>;
        
        images.forEach(img => {
          if (img.src && !this.preloadedUrls.has(img.src)) {
            visibleImages.push(img.src);
          }
        });
      });

      // Also preload images that are just below the viewport for search results
      const belowViewportImages = this.findImagesNearViewport();
      const combinedImages = [...new Set([...visibleImages, ...belowViewportImages])];

      if (combinedImages.length > 0) {
        const batchSize = Math.min(combinedImages.length, this.SEARCH_PRELOAD_BATCH_SIZE);
        await this.preloadImages(combinedImages.slice(0, batchSize));
        console.log(`Search preloader: Queued ${batchSize} images for search query: ${searchQuery}`);
      }
    } catch (error) {
      console.warn('Search preloader: Error during search preload', error);
    }
  }

  /**
   * Find images near the current viewport for search results
   */
  private findImagesNearViewport(): string[] {
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;
    const preloadZone = scrollY + viewportHeight + this.MAX_PRELOAD_DISTANCE;
    
    const nearbyImages: string[] = [];
    const allImages = document.querySelectorAll('img[data-image-index], img[src*="supabase"]') as NodeListOf<HTMLImageElement>;

    allImages.forEach(img => {
      const rect = img.getBoundingClientRect();
      const imgTop = rect.top + scrollY;
      
      if (imgTop <= preloadZone && imgTop > scrollY + viewportHeight && img.src && !this.preloadedUrls.has(img.src)) {
        nearbyImages.push(img.src);
      }
    });

    return nearbyImages;
  }

  /**
   * Observe search result containers specifically
   */
  public observeSearchContainers(): void {
    if (!this.observer) return;

    // Look for search-specific containers
    const searchSelectors = [
      '[data-testid="search-results"]',
      '[data-testid="content-tiles"]', 
      '[data-testid="playlist-tiles"]',
      '.content-carousel'
    ];

    searchSelectors.forEach(selector => {
      const containers = document.querySelectorAll(selector);
      containers.forEach(container => {
        this.observeContainer(container as HTMLElement);
      });
    });
  }

  /**
   * Clear preloaded URLs cache
   */
  public clearPreloadCache(): void {
    this.preloadedUrls.clear();
    
    // Clear search timer
    if (this.searchPreloadTimer) {
      window.clearTimeout(this.searchPreloadTimer);
      this.searchPreloadTimer = null;
    }
    
    if (this.serviceWorkerReady && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLEANUP_PREDICTIVE_CACHE'
      });
    }
  }

  /**
   * Cleanup observer and timers
   */
  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.searchPreloadTimer) {
      window.clearTimeout(this.searchPreloadTimer);
      this.searchPreloadTimer = null;
    }
  }
}

// Global instance
export const simpleImagePreloader = new SimpleImagePreloader();