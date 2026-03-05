import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  preloadImage,
  preloadImages,
  extractImageUrls,
  extractPlaylistImageUrls,
} from '../image-preloader';

// Mock Image constructor
global.Image = vi.fn().mockImplementation(() => ({
  src: '',
  onload: null,
  onerror: null,
})) as any;

describe('image-preloader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('preloadImage', () => {
    it('should resolve with src when image loads successfully', async () => {
      const mockImage = {
        src: '',
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };

      (global.Image as any).mockImplementation(() => {
        // Simulate immediate success
        setTimeout(() => {
          if (mockImage.onload) {
            mockImage.onload();
          }
        }, 1);
        return mockImage;
      });

      const result = await preloadImage('test-image.jpg');
      expect(result).toBe('test-image.jpg');
      expect(mockImage.src).toBe('test-image.jpg');
    });

    it('should reject when image fails to load', async () => {
      const mockImage = {
        src: '',
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };

      (global.Image as any).mockImplementation(() => {
        // Simulate immediate error
        setTimeout(() => {
          if (mockImage.onerror) {
            mockImage.onerror();
          }
        }, 1);
        return mockImage;
      });

      await expect(preloadImage('invalid-image.jpg')).rejects.toThrow(
        'Failed to load image: invalid-image.jpg'
      );
    });
  });

  describe('preloadImages', () => {
    it('should return empty arrays for empty input', async () => {
      const result = await preloadImages([]);
      expect(result.success).toBe(true);
      expect(result.failed).toEqual([]);
    });

    it('should handle timeout', async () => {
      const mockImage = {
        src: '',
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };

      (global.Image as any).mockImplementation(() => mockImage);

      const result = await preloadImages(['slow-image.jpg'], 50); // 50ms timeout

      // Don't trigger onload or onerror - let it timeout
      expect(result.success).toBe(false);
      expect(result.failed).toContain('slow-image.jpg');
    });
  });

  describe('extractImageUrls', () => {
    it('should extract image_url when available', () => {
      const videos = [
        { image_url: 'image1.jpg', thumbnail_url: 'thumb1.jpg' },
        { image_url: 'image2.jpg', thumbnail_url: 'thumb2.jpg' },
      ];

      const result = extractImageUrls(videos);
      expect(result).toEqual(['image1.jpg', 'image2.jpg']);
    });

    it('should fallback to thumbnail_url when image_url is null', () => {
      const videos = [
        { image_url: null, thumbnail_url: 'thumb1.jpg' },
        { image_url: 'image2.jpg', thumbnail_url: 'thumb2.jpg' },
      ];

      const result = extractImageUrls(videos);
      expect(result).toEqual(['thumb1.jpg', 'image2.jpg']);
    });

    it('should filter out null/undefined values', () => {
      const videos = [
        { image_url: null, thumbnail_url: null },
        { image_url: 'image2.jpg', thumbnail_url: 'thumb2.jpg' },
        { image_url: undefined, thumbnail_url: undefined },
      ];

      const result = extractImageUrls(videos);
      expect(result).toEqual(['image2.jpg']);
    });
  });

  describe('extractPlaylistImageUrls', () => {
    it('should extract playlist image URLs', () => {
      const playlists = [
        { image_url: 'playlist1.jpg' },
        { image_url: 'playlist2.jpg' },
      ];

      const result = extractPlaylistImageUrls(playlists);
      expect(result).toEqual(['playlist1.jpg', 'playlist2.jpg']);
    });

    it('should filter out null/undefined values', () => {
      const playlists = [
        { image_url: null },
        { image_url: 'playlist2.jpg' },
        { image_url: undefined },
      ];

      const result = extractPlaylistImageUrls(playlists);
      expect(result).toEqual(['playlist2.jpg']);
    });
  });
});
