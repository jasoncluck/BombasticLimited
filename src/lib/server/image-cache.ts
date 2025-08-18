import type { ImageProcessingOptions } from './image-processing';
import { SimpleMemoryCache } from '../utils/simple-memory-cache';

// Simple image cache configuration
export const IMAGE_CACHE_CONFIG = {
  DEFAULT_TTL: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
} as const;

// Generate cache key from URL and processing options
export function generateImageCacheKey(
  originalUrl: string,
  options: ImageProcessingOptions
): string {
  const url = new URL(originalUrl);
  const urlPart = `${url.hostname}${url.pathname}`;

  const optionsParts = [
    options.format || 'webp',
    options.quality || 90,
    options.width || 'auto',
    options.height || 'auto',
  ];

  const optionsHash = optionsParts.join('-');
  return `img:${urlPart}:${optionsHash}`;
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
  options: ImageProcessingOptions
): string {
  const url = new URL(originalUrl);
  const urlPart = `${url.hostname}${url.pathname}`;

  const cropPart = cropProperties
    ? `crop-${cropProperties.x}-${cropProperties.y}-${cropProperties.width}-${cropProperties.height}`
    : 'no-crop';

  const optionsParts = [
    options.format || 'webp',
    options.quality || 90,
    cropPart,
  ];

  const optionsHash = optionsParts.join('-');
  return `playlist:${urlPart}:${optionsHash}`;
}

// Simple image cache manager
export class ImageCacheManager {
  private static instance: ImageCacheManager | null = null;
  private memoryCache: SimpleMemoryCache;

  private constructor() {
    this.memoryCache = new SimpleMemoryCache();
  }

  static getInstance(): ImageCacheManager {
    if (!ImageCacheManager.instance) {
      ImageCacheManager.instance = new ImageCacheManager();
    }
    return ImageCacheManager.instance;
  }

  async get(cacheKey: string): Promise<string | null> {
    return this.memoryCache.get<string>(cacheKey);
  }

  async set(
    cacheKey: string,
    dataUrl: string,
    ttl: number = IMAGE_CACHE_CONFIG.DEFAULT_TTL
  ): Promise<void> {
    this.memoryCache.set(cacheKey, dataUrl, ttl);
  }

  async delete(cacheKey: string): Promise<void> {
    this.memoryCache.delete(cacheKey);
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
  }

  async cleanup(): Promise<void> {
    this.memoryCache.cleanup();
  }

  getStats(): { entries: number; size: number } {
    return this.memoryCache.getStats();
  }
}
