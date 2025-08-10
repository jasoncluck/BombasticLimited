import type { ImageProcessingOptions } from './image-processing';

// Image cache configuration
export const IMAGE_CACHE_CONFIG = {
  CACHE_NAME: 'bombastic-images',
  DEFAULT_TTL: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  MAX_CACHE_SIZE: 100 * 1024 * 1024, // 100MB
  CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
  MAX_CACHE_ENTRIES: 1000,
} as const;

// Enhanced image cache entry interface
export interface ImageCacheEntry {
  dataUrl: string;
  timestamp: number;
  ttl: number;
  size: number;
  originalUrl: string;
  cacheKey: string;
  processingOptions: ImageProcessingOptions;
  authState: 'auth' | 'anon';
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
  cropProperties: { x: number; y: number; width: number; height: number } | null,
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

// Image cache manager class
export class ImageCacheManager {
  private static instance: ImageCacheManager | null = null;
  private cache: Cache | null = null;
  private memoryCache = new Map<string, ImageCacheEntry>();
  private initialized = false;

  private constructor() {}

  static getInstance(): ImageCacheManager {
    if (!ImageCacheManager.instance) {
      ImageCacheManager.instance = new ImageCacheManager();
    }
    return ImageCacheManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Only initialize cache in browser environment (service worker)
      if (typeof caches !== 'undefined') {
        this.cache = await caches.open(IMAGE_CACHE_CONFIG.CACHE_NAME);
      }
      this.initialized = true;
    } catch (error) {
      console.warn('Failed to initialize image cache:', error);
    }
  }

  async get(cacheKey: string): Promise<string | null> {
    // First check memory cache
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && this.isEntryValid(memoryEntry)) {
      return memoryEntry.dataUrl;
    }

    // Check service worker cache if available
    if (this.cache) {
      try {
        const response = await this.cache.match(cacheKey);
        if (response) {
          const data = await response.json();
          if (this.isEntryValid(data)) {
            // Update memory cache
            this.memoryCache.set(cacheKey, data);
            return data.dataUrl;
          } else {
            // Remove expired entry
            await this.cache.delete(cacheKey);
          }
        }
      } catch (error) {
        console.warn('Error reading from image cache:', error);
      }
    }

    return null;
  }

  async set(
    cacheKey: string,
    dataUrl: string,
    originalUrl: string,
    processingOptions: ImageProcessingOptions,
    authState: 'auth' | 'anon' = 'anon',
    ttl: number = IMAGE_CACHE_CONFIG.DEFAULT_TTL
  ): Promise<void> {
    const entry: ImageCacheEntry = {
      dataUrl,
      timestamp: Date.now(),
      ttl,
      size: this.calculateSize(dataUrl),
      originalUrl,
      cacheKey,
      processingOptions,
      authState,
    };

    // Store in memory cache
    this.memoryCache.set(cacheKey, entry);

    // Store in service worker cache if available
    if (this.cache) {
      try {
        const response = new Response(JSON.stringify(entry), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `max-age=${Math.floor(ttl / 1000)}`,
          },
        });
        await this.cache.put(cacheKey, response);
      } catch (error) {
        console.warn('Error storing to image cache:', error);
      }
    }

    // Cleanup if necessary
    await this.cleanup();
  }

  async delete(cacheKey: string): Promise<void> {
    this.memoryCache.delete(cacheKey);
    
    if (this.cache) {
      try {
        await this.cache.delete(cacheKey);
      } catch (error) {
        console.warn('Error deleting from image cache:', error);
      }
    }
  }

  async clear(authState?: 'auth' | 'anon'): Promise<void> {
    if (authState) {
      // Clear entries for specific auth state
      const keysToDelete: string[] = [];
      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.authState === authState) {
          keysToDelete.push(key);
        }
      }
      
      for (const key of keysToDelete) {
        await this.delete(key);
      }
    } else {
      // Clear all entries
      this.memoryCache.clear();
      
      if (this.cache) {
        try {
          const keys = await this.cache.keys();
          await Promise.all(keys.map(key => this.cache?.delete(key)));
        } catch (error) {
          console.warn('Error clearing image cache:', error);
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    const memoryKeysToDelete: string[] = [];
    const cacheKeysToDelete: string[] = [];

    // Check memory cache for expired entries
    for (const [key, entry] of this.memoryCache.entries()) {
      if (!this.isEntryValid(entry)) {
        memoryKeysToDelete.push(key);
      }
    }

    // Remove expired entries from memory
    for (const key of memoryKeysToDelete) {
      this.memoryCache.delete(key);
    }

    // Check service worker cache if available
    if (this.cache) {
      try {
        const keys = await this.cache.keys();
        
        for (const request of keys) {
          try {
            const response = await this.cache.match(request);
            if (response) {
              const data = await response.json();
              if (!this.isEntryValid(data)) {
                cacheKeysToDelete.push(request.url);
              }
            }
          } catch {
            // Invalid entry, mark for deletion
            cacheKeysToDelete.push(request.url);
          }
        }

        // Delete expired entries
        await Promise.all(cacheKeysToDelete.map(key => this.cache?.delete(key)));
      } catch (error) {
        console.warn('Error during image cache cleanup:', error);
      }
    }

    // Check cache size limits
    await this.enforceSize();
  }

  private async enforceSize(): Promise<void> {
    // Enforce memory cache size
    if (this.memoryCache.size > IMAGE_CACHE_CONFIG.MAX_CACHE_ENTRIES) {
      const entries = Array.from(this.memoryCache.entries());
      // Sort by timestamp (oldest first)
      entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);
      
      const entriesToDelete = entries.slice(0, this.memoryCache.size - IMAGE_CACHE_CONFIG.MAX_CACHE_ENTRIES);
      for (const [key] of entriesToDelete) {
        await this.delete(key);
      }
    }

    // Enforce total size limit
    let totalSize = 0;
    const entries = Array.from(this.memoryCache.entries());
    
    for (const [, entry] of entries) {
      totalSize += entry.size;
    }

    if (totalSize > IMAGE_CACHE_CONFIG.MAX_CACHE_SIZE) {
      // Sort by timestamp (oldest first)
      entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);
      
      for (const [key, entry] of entries) {
        await this.delete(key);
        totalSize -= entry.size;
        
        if (totalSize <= IMAGE_CACHE_CONFIG.MAX_CACHE_SIZE * 0.8) {
          break;
        }
      }
    }
  }

  getStats(): {
    memoryEntries: number;
    memorySize: number;
    authEntries: { auth: number; anon: number };
  } {
    let totalSize = 0;
    const authStats = { auth: 0, anon: 0 };

    for (const [, entry] of this.memoryCache.entries()) {
      totalSize += entry.size;
      authStats[entry.authState]++;
    }

    return {
      memoryEntries: this.memoryCache.size,
      memorySize: totalSize,
      authEntries: authStats,
    };
  }

  private isEntryValid(entry: ImageCacheEntry): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  private calculateSize(dataUrl: string): number {
    // Estimate size based on base64 data URL length
    // Base64 encoding increases size by ~33%, so decode length is roughly dataUrl.length * 0.75
    return dataUrl.length * 0.75;
  }
}