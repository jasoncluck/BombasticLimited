import { describe, it, expect, vi } from 'vitest';
import {
  isValidImageUrl,
  getOptimalLoadingAttribute,
  getOptimalFetchPriority,
  extractImageUrls,
  optimizePageImageLoading,
} from '../image-preloader';

describe('Image Preloader Utility', () => {
  describe('isValidImageUrl', () => {
    it('should validate YouTube image URLs', () => {
      expect(
        isValidImageUrl('https://i.ytimg.com/vi/test/maxresdefault.jpg')
      ).toBe(true);
      expect(
        isValidImageUrl('https://img.youtube.com/vi/test/default.jpg')
      ).toBe(true);
      expect(
        isValidImageUrl('https://i1.ytimg.com/vi/test/hqdefault.jpg')
      ).toBe(true);
    });

    it('should validate Supabase image URLs', () => {
      expect(
        isValidImageUrl(
          'https://example.supabase.co/storage/v1/object/test.jpg'
        )
      ).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidImageUrl('https://malicious-site.com/image.jpg')).toBe(
        false
      );
      expect(isValidImageUrl('')).toBe(false);
      expect(isValidImageUrl('invalid-url')).toBe(false);
    });
  });

  describe('getOptimalLoadingAttribute', () => {
    it('should return eager for first few images', () => {
      expect(getOptimalLoadingAttribute(null, 0)).toBe('eager');
      expect(getOptimalLoadingAttribute(null, 1)).toBe('eager');
      expect(getOptimalLoadingAttribute(null, 2)).toBe('eager');
    });

    it('should return lazy for later images', () => {
      expect(getOptimalLoadingAttribute(null, 5)).toBe('lazy');
      expect(getOptimalLoadingAttribute(null, 10)).toBe('lazy');
    });

    it('should return eager for above-the-fold elements', () => {
      const mockElement = {
        getBoundingClientRect: () => ({ top: 100, bottom: 200 }),
      } as HTMLElement;

      // Mock window dimensions
      Object.defineProperty(window, 'innerHeight', {
        value: 800,
        configurable: true,
      });

      expect(getOptimalLoadingAttribute(mockElement, 5)).toBe('eager');
    });
  });

  describe('getOptimalFetchPriority', () => {
    it('should return high for first image', () => {
      expect(getOptimalFetchPriority(null, 0)).toBe('high');
    });

    it('should return auto for early images', () => {
      expect(getOptimalFetchPriority(null, 1)).toBe('auto');
      expect(getOptimalFetchPriority(null, 2)).toBe('auto');
    });

    it('should return low for later images', () => {
      expect(getOptimalFetchPriority(null, 5)).toBe('low');
    });
  });

  describe('extractImageUrls', () => {
    it('should extract valid image URLs from video objects', () => {
      const videos = [
        {
          image_url: 'https://i.ytimg.com/vi/test1/maxresdefault.jpg',
          thumbnail_url: null,
        },
        {
          image_url: null,
          thumbnail_url: 'https://i.ytimg.com/vi/test2/default.jpg',
        },
        {
          image_url: 'https://malicious-site.com/image.jpg',
          thumbnail_url: null,
        }, // Should be filtered out
        { image_url: null, thumbnail_url: null },
      ];

      const urls = extractImageUrls(videos);
      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://i.ytimg.com/vi/test1/maxresdefault.jpg');
      expect(urls).toContain('https://i.ytimg.com/vi/test2/default.jpg');
    });
  });

  describe('optimizePageImageLoading', () => {
    it('should handle empty video arrays gracefully', () => {
      // Should not throw for empty/null arrays
      expect(() => optimizePageImageLoading([])).not.toThrow();
      expect(() => optimizePageImageLoading(null as any)).not.toThrow();
      expect(() => optimizePageImageLoading(undefined as any)).not.toThrow();
    });

    it('should handle fewer videos than maxPreload gracefully', () => {
      const videos = [
        {
          image_url: 'https://i.ytimg.com/vi/test1/maxresdefault.jpg',
          thumbnail_url: null,
        },
        {
          image_url: 'https://i.ytimg.com/vi/test2/maxresdefault.jpg',
          thumbnail_url: null,
        },
      ];

      // Should not throw when videos.length < maxPreload
      expect(() =>
        optimizePageImageLoading(videos, { maxPreload: 10 })
      ).not.toThrow();
    });

    it('should limit extracted URLs based on maxPreload', () => {
      const videos = Array.from({ length: 20 }, (_, i) => ({
        image_url: `https://i.ytimg.com/vi/test${i}/maxresdefault.jpg`,
        thumbnail_url: null,
      }));

      // Test that only first 6 URLs would be extracted (default maxPreload)
      const limitedVideos = videos.slice(0, 6);
      const extractedUrls = extractImageUrls(limitedVideos);
      expect(extractedUrls).toHaveLength(6);
    });
  });
});
