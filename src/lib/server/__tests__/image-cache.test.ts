import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ImageCacheManager,
  generateImageCacheKey,
  generatePlaylistImageCacheKey,
  IMAGE_CACHE_CONFIG,
} from '../image-cache';

describe('Image Cache - Simplified', () => {
  let cacheManager: ImageCacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    (
      ImageCacheManager as unknown as { instance: ImageCacheManager | null }
    ).instance = null;
    cacheManager = ImageCacheManager.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for video thumbnails', () => {
      const url = 'https://example.com/video.jpg';
      const options = {
        format: 'webp' as const,
        quality: 90,
        width: 320,
        height: 180,
      };

      const key1 = generateImageCacheKey(url, options);
      const key2 = generateImageCacheKey(url, options);

      expect(key1).toBe(key2);
      expect(key1).toContain('img:example.com/video.jpg');
      expect(key1).toContain('webp-90-320-180');
    });

    it('should generate different cache keys for different options', () => {
      const url = 'https://example.com/video.jpg';
      const options1 = { format: 'webp' as const, quality: 90 };
      const options2 = { format: 'jpeg' as const, quality: 80 };

      const key1 = generateImageCacheKey(url, options1);
      const key2 = generateImageCacheKey(url, options2);

      expect(key1).not.toBe(key2);
      expect(key1).toContain('webp-90');
      expect(key2).toContain('jpeg-80');
    });

    it('should generate consistent cache keys for playlist images with crop properties', () => {
      const url = 'https://example.com/playlist.jpg';
      const cropProperties = {
        x: 10,
        y: 20,
        width: 100,
        height: 150,
      };
      const options = {
        format: 'webp' as const,
        quality: 85,
      };

      const key = generatePlaylistImageCacheKey(url, cropProperties, options);

      expect(key).toContain('playlist:example.com/playlist.jpg');
      expect(key).toContain('webp-85-crop-10-20-100-150');
    });

    it('should use default values for missing options', () => {
      const url = 'https://example.com/video.jpg';
      const options = {};

      const key = generateImageCacheKey(url, options);
      expect(key).toContain('webp-90-auto-auto');
    });
  });

  describe('ImageCacheManager - Simple Memory Cache', () => {
    it('should store and retrieve cached images', async () => {
      const originalUrl = 'https://example.com/image.jpg';
      const options = { format: 'webp' as const, quality: 70 };
      const dataUrl = 'data:image/webp;base64,mockdata';

      const cacheKey = generateImageCacheKey(originalUrl, options);

      await cacheManager.set(cacheKey, dataUrl);

      // Should find in memory cache
      const result = await cacheManager.get(cacheKey);
      expect(result).toBe(dataUrl);
    });

    it('should return null for non-existent cache entries', async () => {
      const result = await cacheManager.get('non-existent-key');
      expect(result).toBe(null);
    });

    it('should handle cache expiration', async () => {
      const originalUrl = 'https://example.com/expiring.jpg';
      const options = { format: 'webp' as const };
      const dataUrl = 'data:image/webp;base64,expiring';
      const shortTTL = 100; // 100ms

      const cacheKey = generateImageCacheKey(originalUrl, options);

      await cacheManager.set(cacheKey, dataUrl, shortTTL);

      // Should be available immediately
      let result = await cacheManager.get(cacheKey);
      expect(result).toBe(dataUrl);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be null after expiration
      result = await cacheManager.get(cacheKey);
      expect(result).toBe(null);
    });

    it('should clear all cache entries', async () => {
      const url1 = 'https://example.com/image1.jpg';
      const url2 = 'https://example.com/image2.jpg';
      const options = { format: 'webp' as const };
      const dataUrl = 'data:image/webp;base64,mockdata';

      const key1 = generateImageCacheKey(url1, options);
      const key2 = generateImageCacheKey(url2, options);

      await cacheManager.set(key1, dataUrl);
      await cacheManager.set(key2, dataUrl);

      // Both should be available
      expect(await cacheManager.get(key1)).toBe(dataUrl);
      expect(await cacheManager.get(key2)).toBe(dataUrl);

      await cacheManager.clear();

      // Both should be cleared
      expect(await cacheManager.get(key1)).toBe(null);
      expect(await cacheManager.get(key2)).toBe(null);
    });

    it('should provide accurate stats', async () => {
      const stats1 = cacheManager.getStats();
      expect(stats1.entries).toBe(0);

      const url = 'https://example.com/stats.jpg';
      const options = { format: 'webp' as const };
      const dataUrl = 'data:image/webp;base64,stats';
      const cacheKey = generateImageCacheKey(url, options);

      await cacheManager.set(cacheKey, dataUrl);

      const stats2 = cacheManager.getStats();
      expect(stats2.entries).toBe(1);
      expect(stats2.size).toBeGreaterThan(0);
    });

    it('should handle service worker cache unavailable gracefully', async () => {
      // Even without service worker cache, memory cache should work
      const originalUrl = 'https://example.com/graceful.jpg';
      const options = { format: 'webp' as const };
      const dataUrl = 'data:image/webp;base64,graceful';

      const newManager = ImageCacheManager.getInstance();
      const cacheKey = generateImageCacheKey(originalUrl, options);

      await newManager.set(cacheKey, dataUrl);
      const result = await newManager.get(cacheKey);
      expect(result).toBe(dataUrl);
    });

    it('should cleanup expired entries', async () => {
      const shortTTL = 50; // 50ms
      const dataUrl = 'data:image/webp;base64,cleanup';
      const options = { format: 'webp' as const };

      // Add entries with short TTL
      const key1 = generateImageCacheKey('https://example.com/1.jpg', options);
      const key2 = generateImageCacheKey('https://example.com/2.jpg', options);
      const key3 = generateImageCacheKey('https://example.com/3.jpg', options);

      await cacheManager.set(key1, dataUrl, shortTTL);
      await cacheManager.set(key2, dataUrl, shortTTL);
      await cacheManager.set(key3, dataUrl); // Long TTL

      // Wait for short TTL entries to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Run cleanup
      await cacheManager.cleanup();

      // Only the long TTL entry should remain
      expect(await cacheManager.get(key1)).toBe(null);
      expect(await cacheManager.get(key2)).toBe(null);
      expect(await cacheManager.get(key3)).toBe(dataUrl);
    });
  });
});
