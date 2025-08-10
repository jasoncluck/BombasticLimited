import { describe, it, expect } from 'vitest';
import {
  getVideoThumbnailUrl,
  getBestVideoThumbnailUrl,
  getVideoThumbnailDataUrl,
  getDirectThumbnailUrl,
  isOptimizedThumbnailUrl,
  extractOriginalUrl,
  hasMaxResThumbnail,
  getVideoThumbnailUrlWithSize,
  getVideoThumbnailProgressiveUrl,
  getResponsiveVideoThumbnailUrls,
  getVideoThumbnailCacheKey,
  DEFAULT_VIDEO_THUMBNAIL_CONFIG,
  DEFAULT_MAXRES_THUMBNAIL_CONFIG,
} from '../video-thumbnails';
import type { Video } from '$lib/supabase/videos';

// Mock video data
const createMockVideo = (
  id: string,
  thumbnailUrl?: string | null,
  thumbnailMaxResUrl?: string | null
): Video => ({
  id,
  title: `Video ${id}`,
  description: `Description for video ${id}`,
  thumbnail_url:
    thumbnailUrl === null || thumbnailUrl === ''
      ? ''
      : thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  thumbnail_maxres_url:
    thumbnailMaxResUrl === undefined ? null : thumbnailMaxResUrl,
  published_at: '2023-01-01T00:00:00Z',
  duration: null,
  source: 'giantbomb',
});

describe('video-thumbnails (server-side only)', () => {
  describe('getVideoThumbnailUrl', () => {
    it('should use server processing for YouTube thumbnails', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailUrl(video);

      // Should use server processing with URL as first parameter
      expect(result).toMatch(/^\/api\/video-thumbnail\?url=https%3A%2F%2Fi\.ytimg\.com%2Fvi%2F1%2Fhqdefault\.jpg&type=image$/);
    });

    it('should prefer thumbnail_url for better performance', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      const result = getVideoThumbnailUrl(video);

      // Should prefer standard thumbnail_url and use server processing
      expect(result).toMatch(/^\/api\/video-thumbnail\?url=https%3A%2F%2Fi\.ytimg\.com%2Fvi%2F1%2Fhqdefault\.jpg&type=image$/);
    });

    it('should use server API for non-YouTube thumbnails', () => {
      const video = createMockVideo(
        '1',
        'https://example.com/thumbnail.jpg',
        null
      );

      const result = getVideoThumbnailUrl(video);

      expect(result).toMatch(/^\/api\/video-thumbnail\?url=https%3A%2F%2Fexample\.com%2Fthumbnail\.jpg&type=image$/);
    });

    it('should return empty string when no thumbnail URL', () => {
      const video = createMockVideo('1', '', null);

      const result = getVideoThumbnailUrl(video);

      expect(result).toBe('');
    });

    it('should include custom config parameters', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );
      const config = {
        width: 320,
        height: 180,
        quality: 75,
        format: 'webp' as const,
      };

      const result = getVideoThumbnailUrl(video, config);

      // Should include all config parameters
      expect(result).toContain('format=webp');
      expect(result).toContain('quality=75');
      expect(result).toContain('width=320');
      expect(result).toContain('height=180');
    });
  });

  describe('getBestVideoThumbnailUrl', () => {
    it('should prefer thumbnail_url for better performance', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      const result = getBestVideoThumbnailUrl(video);

      // Should prefer standard thumbnail_url for performance
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
    });

    it('should fallback to regular thumbnail URL', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getBestVideoThumbnailUrl(video);

      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
    });

    it('should return null when no thumbnails available', () => {
      const video = createMockVideo('1', '', null);

      const result = getBestVideoThumbnailUrl(video);

      expect(result).toBe(null);
    });
  });

  describe('getVideoThumbnailDataUrl', () => {
    it('should return server API URL for data format', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailDataUrl(video);

      expect(result).toMatch(/^\/api\/video-thumbnail\?url=https%3A%2F%2Fi\.ytimg\.com%2Fvi%2F1%2Fhqdefault\.jpg&type=json$/);
    });

    it('should prefer thumbnail_url for better performance', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      const result = getVideoThumbnailDataUrl(video);

      // Should prefer standard thumbnail_url for performance
      expect(result).toMatch(/^\/api\/video-thumbnail\?url=https%3A%2F%2Fi\.ytimg\.com%2Fvi%2F1%2Fhqdefault\.jpg&type=json$/);
    });

    it('should return empty string when no thumbnail URL', () => {
      const video = createMockVideo('1', '', null);

      const result = getVideoThumbnailDataUrl(video);

      expect(result).toBe('');
    });
  });

  describe('getVideoThumbnailProgressiveUrl', () => {
    it('should return progressive API URL', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailProgressiveUrl(video);

      expect(result).toBe('/api/video-thumbnail?type=progressive&url=https%3A%2F%2Fi.ytimg.com%2Fvi%2F1%2Fhqdefault.jpg');
    });

    it('should return empty string when no thumbnail URL', () => {
      const video = createMockVideo('1', '', null);

      const result = getVideoThumbnailProgressiveUrl(video);

      expect(result).toBe('');
    });
  });

  describe('getDirectThumbnailUrl', () => {
    it('should prefer thumbnail_url for better performance', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      const result = getDirectThumbnailUrl(video);

      // Should prefer standard thumbnail_url for performance
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
    });
  });

  describe('isOptimizedThumbnailUrl', () => {
    it('should return false for non-API URLs', () => {
      const url = '/_vercel/image?url=https%3A//i.ytimg.com/vi/1/hqdefault.jpg&w=480&h=360&q=90';

      expect(isOptimizedThumbnailUrl(url)).toBe(false);
    });

    it('should return true for server API URLs', () => {
      const url = '/api/video-thumbnail?type=image&url=https%3A//example.com/thumb.jpg';

      expect(isOptimizedThumbnailUrl(url)).toBe(true);
    });

    it('should return false for direct URLs', () => {
      const url = 'https://i.ytimg.com/vi/1/hqdefault.jpg';

      expect(isOptimizedThumbnailUrl(url)).toBe(false);
    });
  });

  describe('extractOriginalUrl', () => {
    it('should extract URL from server API format', () => {
      const optimizedUrl = '/api/video-thumbnail?type=image&url=https%3A//example.com/thumb.jpg';

      const result = extractOriginalUrl(optimizedUrl);

      expect(result).toBe('https://example.com/thumb.jpg');
    });

    it('should handle invalid URLs gracefully', () => {
      expect(extractOriginalUrl('not-a-url')).toBe(null);
      expect(extractOriginalUrl('')).toBe(null);
    });
  });

  describe('hasMaxResThumbnail', () => {
    it('should return true when maxres URL exists', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      expect(hasMaxResThumbnail(video)).toBe(true);
    });

    it('should return false when maxres URL does not exist', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      expect(hasMaxResThumbnail(video)).toBe(false);
    });
  });

  describe('getVideoThumbnailUrlWithSize', () => {
    it('should include specified dimensions and quality', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailUrlWithSize(video, 640, 360, 85);

      expect(result).toContain('quality=85');
      expect(result).toContain('width=640');
      expect(result).toContain('height=360');
    });

    it('should use default quality when not specified', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailUrlWithSize(video, 320, 180);

      expect(result).toContain('quality=90');
      expect(result).toContain('width=320');
      expect(result).toContain('height=180');
    });
  });

  describe('getResponsiveVideoThumbnailUrls', () => {
    it('should return server URLs for all sizes', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getResponsiveVideoThumbnailUrls(video);

      // All should be server URLs
      expect(result.default).toMatch(/^\/api\/video-thumbnail/);
      expect(result.small).toMatch(/^\/api\/video-thumbnail/);
      expect(result.medium).toMatch(/^\/api\/video-thumbnail/);
      expect(result.large).toMatch(/^\/api\/video-thumbnail/);
    });

    it('should return null values when no thumbnail URL', () => {
      const video = createMockVideo('1', '', null);

      const result = getResponsiveVideoThumbnailUrls(video);

      expect(result.default).toBe(null);
      expect(result.small).toBe(null);
      expect(result.medium).toBe(null);
      expect(result.large).toBe(null);
    });
  });

  describe('getVideoThumbnailCacheKey', () => {
    it('should generate cache key with default config', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailCacheKey(video);

      expect(result).toBe(
        'video-thumb:1:https://i.ytimg.com/vi/1/hqdefault.jpg:default'
      );
    });

    it('should generate cache key with custom config', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );
      const config = { width: 320, height: 180, quality: 85 };

      const result = getVideoThumbnailCacheKey(video, config);

      expect(result).toBe(
        'video-thumb:1:https://i.ytimg.com/vi/1/hqdefault.jpg:{"width":320,"height":180,"quality":85}'
      );
    });

    it('should use thumbnail_url when both URLs available', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      const result = getVideoThumbnailCacheKey(video);

      // Should prefer thumbnail_url for performance
      expect(result).toBe(
        'video-thumb:1:https://i.ytimg.com/vi/1/hqdefault.jpg:default'
      );
    });
  });

  describe('configuration constants', () => {
    it('should have correct default video thumbnail config', () => {
      expect(DEFAULT_VIDEO_THUMBNAIL_CONFIG).toEqual({
        width: 480,
        height: 360,
        quality: 90,
        format: 'auto',
      });
    });

    it('should have correct default maxres thumbnail config', () => {
      expect(DEFAULT_MAXRES_THUMBNAIL_CONFIG).toEqual({
        width: 1280,
        height: 720,
        quality: 90,
        format: 'auto',
      });
    });
  });
});
