/**
 * Simplified Image Cache Manager
 * Works with lazy loading and service worker to provide intelligent image caching
 */

interface ImageCacheConfig {
  priorityThreshold: number;
  maxPreloadBatch: number;
  preloadDistance: number;
}

export class ImageCacheManager {
  private config: ImageCacheConfig = {
    priorityThreshold: 10, // Images with index < 10 are high priority
    maxPreloadBatch: 5, // Reduced from previous implementation
    preloadDistance: 800, // Reduced viewport distance
  };

  private serviceWorkerReady = false;
  private observedImages = new Set<string>();

  constructor() {
    this.initServiceWorker();
  }

  private async initServiceWorker(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      await navigator.serviceWorker.ready;
      this.serviceWorkerReady = true;
      console.log('Image cache manager: Service worker ready');
    } catch (error) {
      console.warn('Image cache manager: Service worker not available', error);
    }
  }

  /**
   * Preload critical images immediately (for above-fold content)
   */
  async preloadCritical(imageUrls: string[]): Promise<void> {
    if (!this.serviceWorkerReady || imageUrls.length === 0) return;

    // Only preload first few critical images to avoid overwhelming
    const criticalUrls = imageUrls
      .slice(0, this.config.maxPreloadBatch)
      .filter((url) => !this.observedImages.has(url));

    if (criticalUrls.length === 0) return;

    try {
      navigator.serviceWorker.controller?.postMessage({
        type: 'PRELOAD_CRITICAL_IMAGES',
        data: { urls: criticalUrls },
      });

      // Mark as observed
      criticalUrls.forEach((url) => this.observedImages.add(url));

      console.log(
        `Image cache manager: Preloaded ${criticalUrls.length} critical images`
      );
    } catch (error) {
      console.warn(
        'Image cache manager: Failed to preload critical images',
        error
      );
    }
  }

  /**
   * Smart preload based on user behavior patterns
   */
  async preloadByPattern(
    pattern: 'search' | 'navigation' | 'playlist',
    context?: any
  ): Promise<void> {
    if (!this.serviceWorkerReady) return;

    let imagesToPreload: string[] = [];

    switch (pattern) {
      case 'search':
        // When user starts typing, preload common result thumbnails
        imagesToPreload = this.findSearchResultImages();
        break;

      case 'navigation':
        // When navigating to a new page, preload visible images
        imagesToPreload = this.findViewportImages();
        break;

      case 'playlist':
        // When viewing a playlist, preload next few video thumbnails
        imagesToPreload = this.findPlaylistImages(context?.currentIndex || 0);
        break;
    }

    if (imagesToPreload.length > 0) {
      await this.preloadCritical(imagesToPreload);
    }
  }

  private findSearchResultImages(): string[] {
    const searchContainers = document.querySelectorAll(
      '[data-testid="search-results"], [data-testid="content-tiles"]'
    );

    const images: string[] = [];
    searchContainers.forEach((container) => {
      const imgs = container.querySelectorAll(
        'img[src]'
      ) as NodeListOf<HTMLImageElement>;
      imgs.forEach((img) => {
        if (img.src && !this.observedImages.has(img.src)) {
          images.push(img.src);
        }
      });
    });

    return images.slice(0, this.config.maxPreloadBatch);
  }

  private findViewportImages(): string[] {
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;
    const preloadZone = scrollY + viewportHeight + this.config.preloadDistance;

    const images: string[] = [];
    const allImages = document.querySelectorAll(
      'img[data-image-index]'
    ) as NodeListOf<HTMLImageElement>;

    allImages.forEach((img) => {
      const rect = img.getBoundingClientRect();
      const imgTop = rect.top + scrollY;

      if (
        imgTop <= preloadZone &&
        imgTop > scrollY + viewportHeight &&
        img.src
      ) {
        if (!this.observedImages.has(img.src)) {
          images.push(img.src);
        }
      }
    });

    return images.slice(0, this.config.maxPreloadBatch);
  }

  private findPlaylistImages(currentIndex: number): string[] {
    const playlistImages = document.querySelectorAll(
      `img[data-image-index]`
    ) as NodeListOf<HTMLImageElement>;

    const nextImages: string[] = [];
    playlistImages.forEach((img) => {
      const index = parseInt(img.getAttribute('data-image-index') || '0');
      if (
        index > currentIndex &&
        index <= currentIndex + this.config.maxPreloadBatch &&
        img.src
      ) {
        if (!this.observedImages.has(img.src)) {
          nextImages.push(img.src);
        }
      }
    });

    return nextImages;
  }

  /**
   * Get cache performance stats
   */
  async getStats(): Promise<{
    observedImages: number;
    serviceWorkerReady: boolean;
  }> {
    return {
      observedImages: this.observedImages.size,
      serviceWorkerReady: this.serviceWorkerReady,
    };
  }

  /**
   * Clear tracked images
   */
  clear(): void {
    this.observedImages.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ImageCacheConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Global instance
export const imageCacheManager = new ImageCacheManager();
