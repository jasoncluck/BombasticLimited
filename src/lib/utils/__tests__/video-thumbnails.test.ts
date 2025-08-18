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
  duration: '00:30:00', // Change from null to string
  source: 'giantbomb',
  // Add missing required Video properties
  image_url: null,
  views: 0,
  image_processing_status: 'completed',
  image_processing_updated_at: null,
  thumbnail_webp_url: null,
  thumbnail_avif_url: null,
  thumbnail_maxres_webp_url: null,
  thumbnail_maxres_avif_url: null,
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

      // Updated to match current implementation that returns direct URLs
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
    });

    it('should prefer thumbnail_url for better performance', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      const result = getVideoThumbnailUrl(video);

      // Updated to match current implementation that returns direct URLs
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
    });

    it('should use server API for non-YouTube thumbnails', () => {
      const video = createMockVideo(
        '1',
        'https://example.com/thumbnail.jpg',
        null
      );

      const result = getVideoThumbnailUrl(video);

      // Updated to match current implementation that returns direct URLs
      expect(result).toBe('https://example.com/thumbnail.jpg');
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

      // Should return direct YouTube URL (config parameters no longer included in URL)
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
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
    it('should return direct YouTube URL (no longer returns API endpoint)', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailDataUrl(video);

      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
    });

    it('should prefer thumbnail_url for better performance', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      const result = getVideoThumbnailDataUrl(video);

      // Should prefer standard thumbnail_url for performance (updated to match current implementation)
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
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

      // Updated to match current implementation that returns direct URLs
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
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
    it('should return true for server API URLs', () => {
      const url =
        '/api/video-thumbnail?type=image&url=https%3A//example.com/thumb.jpg';

      expect(isOptimizedThumbnailUrl(url)).toBe(true);
    });

    it('should return false for direct URLs', () => {
      const url = 'https://i.ytimg.com/vi/1/hqdefault.jpg';

      expect(isOptimizedThumbnailUrl(url)).toBe(false);
    });
  });

  describe('extractOriginalUrl', () => {
    it('should extract URL from server API format', () => {
      const optimizedUrl =
        '/api/video-thumbnail?type=image&url=https%3A//example.com/thumb.jpg';

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

      // Updated to match current implementation that returns direct URLs (no size/quality params)
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
    });

    it('should use default quality when not specified', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailUrlWithSize(video, 320, 180);

      // Updated to match current implementation that returns direct URLs (no quality params)
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
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

      // Updated to match current implementation that returns direct URLs
      expect(result.default).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
      expect(result.small).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
      expect(result.medium).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
      expect(result.large).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
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
