/**
 * Predictive Image Preloader
 * Tracks scroll behavior and preloads images that are likely to be needed next
 */

import { simpleCache } from './simple-memory-cache';
import { browser } from '$app/environment';

interface ScrollMetrics {
  direction: 'up' | 'down' | 'none';
  velocity: number;
  position: number;
  timestamp: number;
}

interface PreloadRequest {
  urls: string[];
  priority: 'high' | 'low';
  reason: string;
}

export class PredictiveImagePreloader {
  private scrollHistory: ScrollMetrics[] = [];
  private lastScrollPosition = 0;
  private lastScrollTime = 0;
  private preloadQueue = new Set<string>();
  private isPreloading = false;
  private serviceWorkerReady = false;

  // Configuration
  private readonly SCROLL_HISTORY_LIMIT = 10;
  private readonly VELOCITY_THRESHOLD = 100; // px/s for fast scrolling
  private readonly PRELOAD_AHEAD_DISTANCE = 2000; // px ahead to preload
  private readonly PRELOAD_DEBOUNCE = 150; // ms
  private readonly MAX_CONCURRENT_PRELOADS = 20;

  constructor() {
    if (browser) {
      this.initializeServiceWorker();
    }
  }

  private async initializeServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        this.serviceWorkerReady = true;
        console.log('Predictive preloader: Service worker ready');
      } catch (error) {
        console.warn('Predictive preloader: Service worker not available', error);
      }
    }
  }

  /**
   * Track scroll position and predict future image needs
   */
  public trackScroll(): void {
    if (!browser) return;

    const currentPosition = window.scrollY;
    const currentTime = performance.now();
    
    // Calculate scroll metrics
    const deltaPosition = currentPosition - this.lastScrollPosition;
    const deltaTime = currentTime - this.lastScrollTime;
    const velocity = deltaTime > 0 ? Math.abs(deltaPosition) / deltaTime : 0;
    
    const direction: 'up' | 'down' | 'none' = 
      deltaPosition > 5 ? 'down' : 
      deltaPosition < -5 ? 'up' : 'none';

    // Add to scroll history
    this.scrollHistory.push({
      direction,
      velocity,
      position: currentPosition,
      timestamp: currentTime
    });

    // Limit history size
    if (this.scrollHistory.length > this.SCROLL_HISTORY_LIMIT) {
      this.scrollHistory.shift();
    }

    // Update tracking variables
    this.lastScrollPosition = currentPosition;
    this.lastScrollTime = currentTime;

    // Trigger predictive preloading
    this.debouncePreload();
  }

  private debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  private debouncePreload(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.debounceTimeout = setTimeout(() => {
      this.triggerPredictivePreload();
    }, this.PRELOAD_DEBOUNCE);
  }

  /**
   * Analyze scroll patterns and trigger preloading
   */
  private triggerPredictivePreload(): void {
    if (!this.serviceWorkerReady || this.isPreloading) return;

    const recentScrolls = this.scrollHistory.slice(-3);
    if (recentScrolls.length < 2) return;

    // Determine if user is scrolling consistently in one direction
    const consistentDirection = recentScrolls.every(
      scroll => scroll.direction === recentScrolls[0].direction && 
                scroll.direction !== 'none'
    );

    if (!consistentDirection || recentScrolls[0].direction === 'none') return;

    // Calculate average velocity
    const avgVelocity = recentScrolls.reduce((sum, scroll) => sum + scroll.velocity, 0) / recentScrolls.length;
    
    // Determine preload distance based on velocity
    const preloadDistance = Math.min(
      this.PRELOAD_AHEAD_DISTANCE,
      avgVelocity * 2 // Preload further ahead for faster scrolling
    );

    // Get images that should be preloaded
    const imagesToPreload = this.getImagesInDirection(
      recentScrolls[0].direction as 'up' | 'down',
      preloadDistance,
      avgVelocity > this.VELOCITY_THRESHOLD ? 'high' : 'low'
    );

    if (imagesToPreload.length > 0) {
      this.preloadImages(imagesToPreload);
    }
  }

  /**
   * Get image URLs that are in the predicted scroll direction
   */
  private getImagesInDirection(
    direction: 'up' | 'down',
    distance: number,
    priority: 'high' | 'low'
  ): string[] {
    const currentViewport = {
      top: window.scrollY,
      bottom: window.scrollY + window.innerHeight
    };

    const searchArea = direction === 'down' 
      ? { top: currentViewport.bottom, bottom: currentViewport.bottom + distance }
      : { top: currentViewport.top - distance, bottom: currentViewport.top };

    // Find all images in the predicted area
    const images = Array.from(document.querySelectorAll('img[src]')) as HTMLImageElement[];
    const targetImages: string[] = [];

    images.forEach(img => {
      const rect = img.getBoundingClientRect();
      const imgTop = rect.top + window.scrollY;
      const imgBottom = imgTop + rect.height;

      // Check if image intersects with search area
      if (imgTop < searchArea.bottom && imgBottom > searchArea.top) {
        const src = img.src;
        if (src && !this.preloadQueue.has(src)) {
          targetImages.push(src);
        }
      }
    });

    return targetImages.slice(0, this.MAX_CONCURRENT_PRELOADS);
  }

  /**
   * Preload a set of images using the service worker
   */
  private async preloadImages(urls: string[]): Promise<void> {
    if (!this.serviceWorkerReady || urls.length === 0) return;

    this.isPreloading = true;

    // Add to queue to prevent duplicates
    urls.forEach(url => this.preloadQueue.add(url));

    try {
      // Cache the preload request locally
      const cacheKey = `preload_${Date.now()}`;
      simpleCache.set(cacheKey, urls, 60000); // 1 minute TTL

      // Send to service worker
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'PRELOAD_PREDICTIVE_IMAGES',
          urls,
          priority: 'low'
        });
      }

      console.log(`Predictive preloader: Queued ${urls.length} images for preloading`);
    } catch (error) {
      console.warn('Predictive preloader: Failed to preload images', error);
    } finally {
      // Clean up queue after a delay
      setTimeout(() => {
        urls.forEach(url => this.preloadQueue.delete(url));
        this.isPreloading = false;
      }, 1000);
    }
  }

  /**
   * Manually trigger preloading for specific images
   */
  public preloadSpecificImages(urls: string[], priority: 'high' | 'low' = 'low'): void {
    if (!this.serviceWorkerReady) return;

    const filteredUrls = urls.filter(url => !this.preloadQueue.has(url));
    if (filteredUrls.length === 0) return;

    this.preloadImages(filteredUrls);
  }

  /**
   * Get current scroll metrics for debugging
   */
  public getScrollMetrics(): ScrollMetrics[] {
    return [...this.scrollHistory];
  }

  /**
   * Clear preload queue and cache
   */
  public clearPreloadQueue(): void {
    this.preloadQueue.clear();
    this.scrollHistory = [];
    
    if (this.serviceWorkerReady && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLEANUP_PREDICTIVE_CACHE'
      });
    }
  }
}

// Global instance
export const predictivePreloader = new PredictiveImagePreloader();

// Auto-setup scroll tracking when in browser
if (browser) {
  let scrollTrackingActive = false;

  const startScrollTracking = () => {
    if (scrollTrackingActive) return;
    scrollTrackingActive = true;

    const handleScroll = () => {
      predictivePreloader.trackScroll();
    };

    // Use passive listeners for better performance
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      window.removeEventListener('scroll', handleScroll);
      scrollTrackingActive = false;
    });
  };

  // Start tracking after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startScrollTracking);
  } else {
    startScrollTracking();
  }
}