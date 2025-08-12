import type { ImageProcessingOptions } from './image-processing';
import { EnhancedMemoryCache } from './enhanced-memory-cache';

// Image cache configuration
export const IMAGE_CACHE_CONFIG = {
  CACHE_NAME: 'bombastic-images',
  DEFAULT_TTL: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  MAX_CACHE_SIZE: 100 * 1024 * 1024, // 100MB
  CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
  MAX_CACHE_ENTRIES: 1000,
} as const;

// Image metadata for cache entries
export interface ImageCacheMetadata {
  originalUrl: string;
  cacheKey: string;
  processingOptions: ImageProcessingOptions;
}

// Generate cache key from URL and processing options
export function generateImageCacheKey(
  originalUrl: string,
  options: ImageProcessingOptions,
  authState: 'auth' | 'anon' = 'anon'
): string {
  // Create a stable key based on URL and processing parameters
  const url = new URL(originalUrl);
  const urlPart = `${url.hostname}${url.pathname}`;

  // Include relevant processing options in the key
  const optionsParts = [
    options.format || 'webp',
    options.quality || 90,
    options.width || 'auto',
    options.height || 'auto',
    options.progressive ? 'prog' : 'no-prog',
    options.lossless ? 'lossless' : 'lossy',
  ];

  const optionsHash = optionsParts.join('-');
  return `img:${authState}:${urlPart}:${optionsHash}`;
}

// Generate playlist image cache key with crop properties
export function generatePlaylistImageCacheKey(
  originalUrl: string,
  cropProperties: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null,
  options: ImageProcessingOptions,
  authState: 'auth' | 'anon' = 'anon'
): string {
  const url = new URL(originalUrl);
  const urlPart = `${url.hostname}${url.pathname}`;

  // Include crop properties in the key
  const cropPart = cropProperties
    ? `crop-${cropProperties.x}-${cropProperties.y}-${cropProperties.width}-${cropProperties.height}`
    : 'no-crop';

  const optionsParts = [
    options.format || 'webp',
    options.quality || 90,
    cropPart,
    options.progressive ? 'prog' : 'no-prog',
    options.lossless ? 'lossless' : 'lossy',
  ];

  const optionsHash = optionsParts.join('-');
  return `playlist:${authState}:${urlPart}:${optionsHash}`;
}

// Refactored image cache manager using enhanced memory cache
export class ImageCacheManager {
  private static instance: ImageCacheManager | null = null;
  private serviceWorkerCache: Cache | null = null;
  private memoryCache: EnhancedMemoryCache<string>;
  private initialized = false;

  private constructor() {
    this.memoryCache = new EnhancedMemoryCache<string>(
      IMAGE_CACHE_CONFIG.MAX_CACHE_SIZE
    );
  }

  static getInstance(): ImageCacheManager {
    if (!ImageCacheManager.instance) {
      ImageCacheManager.instance = new ImageCacheManager();
    }
    return ImageCacheManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Only initialize service worker cache in browser environment
      if (typeof caches !== 'undefined') {
        this.serviceWorkerCache = await caches.open(
          IMAGE_CACHE_CONFIG.CACHE_NAME
        );
      }
      this.initialized = true;
    } catch (error) {
      console.warn('Failed to initialize image cache:', error);
    }
  }

  async get(
    cacheKey: string,
    userId: string | null = null,
    authState: 'auth' | 'anon' = 'anon'
  ): Promise<string | null> {
    // First check memory cache
    const memoryResult = this.memoryCache.get(cacheKey, userId, authState);
    if (memoryResult) {
      return memoryResult;
    }

    // Check service worker cache if available
    if (this.serviceWorkerCache) {
      try {
        const response = await this.serviceWorkerCache.match(cacheKey);
        if (response) {
          const data = await response.json();
          if (this.isValidCacheData(data)) {
            // Update memory cache
            this.memoryCache.set(
              cacheKey,
              data.dataUrl,
              data.ttl,
              userId,
              authState,
              data.metadata
            );
            return data.dataUrl;
          } else {
            // Remove expired entry
            await this.serviceWorkerCache.delete(cacheKey);
          }
        }
      } catch (error) {
        console.warn('Error reading from service worker image cache:', error);
      }
    }

    return null;
  }

  async set(
    cacheKey: string,
    dataUrl: string,
    originalUrl: string,
    processingOptions: ImageProcessingOptions,
    userId: string | null = null,
    authState: 'auth' | 'anon' = 'anon',
    ttl: number = IMAGE_CACHE_CONFIG.DEFAULT_TTL
  ): Promise<void> {
    const metadata: ImageCacheMetadata = {
      originalUrl,
      cacheKey,
      processingOptions,
    };

    // Store in memory cache
    this.memoryCache.set(cacheKey, dataUrl, ttl, userId, authState, metadata);

    // Store in service worker cache if available
    if (this.serviceWorkerCache) {
      try {
        const cacheData = {
          dataUrl,
          timestamp: Date.now(),
          ttl,
          metadata,
          authState,
          userId,
        };

        const response = new Response(JSON.stringify(cacheData), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `max-age=${Math.floor(ttl / 1000)}`,
          },
        });
        await this.serviceWorkerCache.put(cacheKey, response);
      } catch (error) {
        console.warn('Error storing to service worker image cache:', error);
      }
    }

    // Send message to service worker about cache update
    this.notifyServiceWorkerOfCacheUpdate(cacheKey, authState);
  }

  async delete(cacheKey: string): Promise<void> {
    this.memoryCache.delete(cacheKey);

    if (this.serviceWorkerCache) {
      try {
        await this.serviceWorkerCache.delete(cacheKey);
      } catch (error) {
        console.warn('Error deleting from service worker image cache:', error);
      }
    }
  }

  async clear(authState?: 'auth' | 'anon'): Promise<void> {
    if (authState) {
      // Clear entries for specific auth state
      this.memoryCache.clearForAuthState(authState);

      if (this.serviceWorkerCache) {
        try {
          const keys = await this.serviceWorkerCache.keys();
          const keysToDelete = keys.filter((request) => {
            const url = new URL(request.url);
            return url.pathname.includes(`${authState}:`);
          });

          await Promise.all(
            keysToDelete.map((key) => this.serviceWorkerCache?.delete(key))
          );
        } catch (error) {
          console.warn('Error clearing auth-specific image cache:', error);
        }
      }
    } else {
      // Clear all entries
      this.memoryCache.clear();

      if (this.serviceWorkerCache) {
        try {
          const keys = await this.serviceWorkerCache.keys();
          await Promise.all(
            keys.map((key) => this.serviceWorkerCache?.delete(key))
          );
        } catch (error) {
          console.warn('Error clearing all image cache:', error);
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    // Cleanup memory cache
    this.memoryCache.cleanup();

    // Cleanup service worker cache if available
    if (this.serviceWorkerCache) {
      try {
        const keys = await this.serviceWorkerCache.keys();
        const keysToDelete: string[] = [];

        for (const request of keys) {
          try {
            const response = await this.serviceWorkerCache.match(request);
            if (response) {
              const data = await response.json();
              if (!this.isValidCacheData(data)) {
                keysToDelete.push(request.url);
              }
            }
          } catch {
            // Invalid entry, mark for deletion
            keysToDelete.push(request.url);
          }
        }

        // Delete expired entries
        await Promise.all(
          keysToDelete.map((key) => this.serviceWorkerCache?.delete(key))
        );
      } catch (error) {
        console.warn('Error during service worker image cache cleanup:', error);
      }
    }
  }

  getStats(): {
    memoryEntries: number;
    memorySize: number;
    authEntries: { auth: number; anon: number };
  } {
    const stats = this.memoryCache.getStats();
    return {
      memoryEntries: stats.entries,
      memorySize: stats.size,
      authEntries: stats.authEntries,
    };
  }

  // Follow the existing pattern of notifying service worker
  private notifyServiceWorkerOfCacheUpdate(
    cacheKey: string,
    authState: 'auth' | 'anon'
  ): void {
    if (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      navigator.serviceWorker.controller
    ) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'IMAGE_CACHED',
          cacheKey,
          authState,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.warn(
          'Failed to notify service worker of image cache update:',
          error
        );
      }
    }
  }

  private isValidCacheData(data: any): boolean {
    return (
      data &&
      typeof data.dataUrl === 'string' &&
      typeof data.timestamp === 'number' &&
      typeof data.ttl === 'number' &&
      Date.now() - data.timestamp < data.ttl
    );
  }
}
