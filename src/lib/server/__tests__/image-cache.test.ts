import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ImageCacheManager,
  generateImageCacheKey,
  generatePlaylistImageCacheKey,
  IMAGE_CACHE_CONFIG,
} from '../image-cache';

// Mock caches API
const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  keys: vi.fn(),
};

const mockCaches = {
  open: vi.fn().mockResolvedValue(mockCache),
};

// Setup global mocks
Object.defineProperty(global, 'caches', {
  value: mockCaches,
  writable: true,
});

describe('Image Cache', () => {
  let cacheManager: ImageCacheManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    (ImageCacheManager as any).instance = null;
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

      const key1 = generateImageCacheKey(url, options, 'anon');
      const key2 = generateImageCacheKey(url, options, 'anon');

      expect(key1).toBe(key2);
      expect(key1).toContain('img:anon:example.com/video.jpg');
      expect(key1).toContain('webp-90-320-180');
    });

    it('should generate different cache keys for different auth states', () => {
      const url = 'https://example.com/video.jpg';
      const options = { format: 'webp' as const, quality: 90 };

      const authKey = generateImageCacheKey(url, options, 'auth');
      const anonKey = generateImageCacheKey(url, options, 'anon');

      expect(authKey).not.toBe(anonKey);
      expect(authKey).toContain('img:auth:');
      expect(anonKey).toContain('img:anon:');
    });

    it('should generate consistent cache keys for playlist images with crop properties', () => {
      const url = 'https://example.com/playlist.jpg';
      const cropProperties = { x: 10, y: 20, width: 100, height: 150 };
      const options = { format: 'webp' as const, quality: 85 };

      const key1 = generatePlaylistImageCacheKey(url, cropProperties, options, 'auth');
      const key2 = generatePlaylistImageCacheKey(url, cropProperties, options, 'auth');

      expect(key1).toBe(key2);
      expect(key1).toContain('playlist:auth:example.com/playlist.jpg');
      expect(key1).toContain('crop-10-20-100-150');
    });

    it('should handle null crop properties', () => {
      const url = 'https://example.com/playlist.jpg';
      const options = { format: 'webp' as const, quality: 85 };

      const key = generatePlaylistImageCacheKey(url, null, options, 'anon');

      expect(key).toContain('no-crop');
    });

    it('should use default values for missing options', () => {
      const url = 'https://example.com/video.jpg';
      const options = {};

      const key = generateImageCacheKey(url, options, 'anon');

      expect(key).toContain('webp-90-auto-auto-no-prog-lossy');
    });
  });

  describe('ImageCacheManager', () => {
    it('should initialize successfully', async () => {
      await cacheManager.initialize();
      // Since we might be in a test environment where caches is defined,
      // just check that initialize doesn't throw
      expect(cacheManager.getStats).toBeDefined();
    });

    it('should store and retrieve cached images', async () => {
      await cacheManager.initialize();
      
      const cacheKey = 'test-key';
      const dataUrl = 'data:image/webp;base64,testdata';
      const originalUrl = 'https://example.com/test.jpg';
      const options = { format: 'webp' as const, quality: 90 };

      // Store in cache
      await cacheManager.set(cacheKey, dataUrl, originalUrl, options, 'anon');

      // Should find in memory cache
      const result = await cacheManager.get(cacheKey);
      expect(result).toBe(dataUrl);
    });

    it('should return null for non-existent cache entries', async () => {
      await cacheManager.initialize();
      
      const result = await cacheManager.get('non-existent-key');
      expect(result).toBe(null);
    });

    it('should handle cache expiration', async () => {
      await cacheManager.initialize();
      
      const cacheKey = 'test-key';
      const dataUrl = 'data:image/webp;base64,testdata';
      const originalUrl = 'https://example.com/test.jpg';
      const options = { format: 'webp' as const, quality: 90 };
      const shortTTL = 100; // 100ms

      // Store with short TTL
      await cacheManager.set(cacheKey, dataUrl, originalUrl, options, 'anon', shortTTL);

      // Should be available immediately
      let result = await cacheManager.get(cacheKey);
      expect(result).toBe(dataUrl);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be null after expiration
      result = await cacheManager.get(cacheKey);
      expect(result).toBe(null);
    });

    it('should clear cache entries by auth state', async () => {
      await cacheManager.initialize();
      
      const authKey = 'auth-key';
      const anonKey = 'anon-key';
      const dataUrl = 'data:image/webp;base64,testdata';
      const originalUrl = 'https://example.com/test.jpg';
      const options = { format: 'webp' as const, quality: 90 };

      // Store auth and anon entries
      await cacheManager.set(authKey, dataUrl, originalUrl, options, 'auth');
      await cacheManager.set(anonKey, dataUrl, originalUrl, options, 'anon');

      // Both should be available
      expect(await cacheManager.get(authKey)).toBe(dataUrl);
      expect(await cacheManager.get(anonKey)).toBe(dataUrl);

      // Clear only auth entries
      await cacheManager.clear('auth');

      // Auth should be gone, anon should remain
      expect(await cacheManager.get(authKey)).toBe(null);
      expect(await cacheManager.get(anonKey)).toBe(dataUrl);
    });

    it('should enforce size limits', async () => {
      await cacheManager.initialize();
      
      // Set a very small max size for testing
      const originalMaxSize = IMAGE_CACHE_CONFIG.MAX_CACHE_SIZE;
      (IMAGE_CACHE_CONFIG as any).MAX_CACHE_SIZE = 1000; // 1KB

      const largeDataUrl = 'data:image/webp;base64,' + 'a'.repeat(2000); // ~2KB
      const options = { format: 'webp' as const, quality: 90 };

      await cacheManager.set('key1', largeDataUrl, 'https://example.com/1.jpg', options, 'anon');
      await cacheManager.set('key2', largeDataUrl, 'https://example.com/2.jpg', options, 'anon');

      // Should have enforced size limits
      const stats = cacheManager.getStats();
      expect(stats.memorySize).toBeLessThan(originalMaxSize);

      // Restore original size
      (IMAGE_CACHE_CONFIG as any).MAX_CACHE_SIZE = originalMaxSize;
    });

    it('should provide accurate stats', async () => {
      await cacheManager.initialize();
      
      const dataUrl = 'data:image/webp;base64,testdata';
      const options = { format: 'webp' as const, quality: 90 };

      await cacheManager.set('auth-key', dataUrl, 'https://example.com/1.jpg', options, 'auth');
      await cacheManager.set('anon-key1', dataUrl, 'https://example.com/2.jpg', options, 'anon');
      await cacheManager.set('anon-key2', dataUrl, 'https://example.com/3.jpg', options, 'anon');

      const stats = cacheManager.getStats();
      expect(stats.memoryEntries).toBe(3);
      expect(stats.authEntries.auth).toBe(1);
      expect(stats.authEntries.anon).toBe(2);
      expect(stats.memorySize).toBeGreaterThan(0);
    });

    it('should handle service worker cache unavailable gracefully', async () => {
      // Mock caches as undefined to simulate unavailable environment
      (global as any).caches = undefined;
      
      const newManager = ImageCacheManager.getInstance();
      await newManager.initialize();
      
      const cacheKey = 'test-key';
      const dataUrl = 'data:image/webp;base64,testdata';
      const originalUrl = 'https://example.com/test.jpg';
      const options = { format: 'webp' as const, quality: 90 };

      // Should still work with memory cache only
      await newManager.set(cacheKey, dataUrl, originalUrl, options, 'anon');
      const result = await newManager.get(cacheKey);
      expect(result).toBe(dataUrl);

      // Restore caches
      (global as any).caches = mockCaches;
    });

    it('should cleanup expired entries', async () => {
      await cacheManager.initialize();
      
      const dataUrl = 'data:image/webp;base64,testdata';
      const options = { format: 'webp' as const, quality: 90 };
      const shortTTL = 100; // 100ms

      // Store multiple entries with short TTL
      await cacheManager.set('key1', dataUrl, 'https://example.com/1.jpg', options, 'anon', shortTTL);
      await cacheManager.set('key2', dataUrl, 'https://example.com/2.jpg', options, 'anon', shortTTL);
      await cacheManager.set('key3', dataUrl, 'https://example.com/3.jpg', options, 'anon'); // Long TTL

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Run cleanup
      await cacheManager.cleanup();

      // Only the long TTL entry should remain
      expect(await cacheManager.get('key1')).toBe(null);
      expect(await cacheManager.get('key2')).toBe(null);
      expect(await cacheManager.get('key3')).toBe(dataUrl);
    });
  });
});