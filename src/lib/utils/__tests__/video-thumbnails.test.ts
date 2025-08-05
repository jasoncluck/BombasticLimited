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

describe('video-thumbnails (updated for Vercel)', () => {
  describe('getVideoThumbnailUrl', () => {
    it('should return Vercel-optimized URL for YouTube thumbnails', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailUrl(video);

      const expectedUrl = `/_vercel/image?url=${encodeURIComponent('https://i.ytimg.com/vi/1/hqdefault.jpg')}&w=480&h=360&q=90`;
      expect(result).toBe(expectedUrl);
    });

    it('should prefer thumbnail_url for better performance', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      const result = getVideoThumbnailUrl(video);

      // Should prefer standard thumbnail_url for performance
      const expectedUrl = `/_vercel/image?url=${encodeURIComponent('https://i.ytimg.com/vi/1/hqdefault.jpg')}&w=480&h=360&q=90`;
      expect(result).toBe(expectedUrl);
    });

    it('should fallback to server API for non-YouTube thumbnails', () => {
      const video = createMockVideo(
        '1',
        'https://example.com/thumbnail.jpg',
        null
      );

      const result = getVideoThumbnailUrl(video);

      const expectedUrl = `/api/video-thumbnail?type=image&url=${encodeURIComponent('https://example.com/thumbnail.jpg')}`;
      expect(result).toBe(expectedUrl);
    });

    it('should return empty string when no thumbnail URL', () => {
      const video = createMockVideo('1', '', null);

      const result = getVideoThumbnailUrl(video);

      expect(result).toBe('');
    });

    it('should accept custom config', () => {
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

      const expectedUrl = `/_vercel/image?url=${encodeURIComponent('https://i.ytimg.com/vi/1/hqdefault.jpg')}&w=320&h=180&q=75&f=webp`;
      expect(result).toBe(expectedUrl);
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

      const expectedUrl = `/api/video-thumbnail?type=json&url=${encodeURIComponent('https://i.ytimg.com/vi/1/hqdefault.jpg')}`;
      expect(result).toBe(expectedUrl);
    });

    it('should prefer thumbnail_url for better performance', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      const result = getVideoThumbnailDataUrl(video);

      // Should prefer standard thumbnail_url for performance
      const expectedUrl = `/api/video-thumbnail?type=json&url=${encodeURIComponent('https://i.ytimg.com/vi/1/hqdefault.jpg')}`;
      expect(result).toBe(expectedUrl);
    });

    it('should return empty string when no thumbnail URL', () => {
      const video = createMockVideo('1', '', null);

      const result = getVideoThumbnailDataUrl(video);

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
    it('should return true for Vercel-optimized URLs', () => {
      const url =
        '/_vercel/image?url=https%3A//i.ytimg.com/vi/1/hqdefault.jpg&w=480&h=360&q=90';

      expect(isOptimizedThumbnailUrl(url)).toBe(true);
    });

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
    it('should extract URL from Vercel-optimized format', () => {
      const optimizedUrl =
        '/_vercel/image?url=https%3A//i.ytimg.com/vi/1/hqdefault.jpg&w=480&h=360&q=90';

      const result = extractOriginalUrl(optimizedUrl);

      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
    });

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
    it('should return URL with specified dimensions', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailUrlWithSize(video, 640, 360, 85);

      const expectedUrl = `/_vercel/image?url=${encodeURIComponent('https://i.ytimg.com/vi/1/hqdefault.jpg')}&w=640&h=360&q=85`;
      expect(result).toBe(expectedUrl);
    });

    it('should use default quality when not specified', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        null
      );

      const result = getVideoThumbnailUrlWithSize(video, 320, 180);

      const expectedUrl = `/_vercel/image?url=${encodeURIComponent('https://i.ytimg.com/vi/1/hqdefault.jpg')}&w=320&h=180&q=90`;
      expect(result).toBe(expectedUrl);
    });
  });
});
