import { describe, it, expect } from 'vitest';
import {
  getBestThumbnailUrl,
  isOptimizableVideoThumbnail,
  getVercelOptimizedVideoThumbnailUrl,
  getOptimizedVideoThumbnailUrl,
  getResponsiveVideoThumbnailUrls,
  isVercelOptimizedUrl,
  extractOriginalUrlFromVercel,
  getVideoThumbnailCacheKey,
  DEFAULT_VIDEO_THUMBNAIL_CONFIG,
  DEFAULT_MAXRES_THUMBNAIL_CONFIG,
} from '../vercel-video-images';
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
  thumbnail_url: thumbnailUrl === undefined ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : thumbnailUrl,
  thumbnail_maxres_url: thumbnailMaxResUrl,
  published_at: '2023-01-01T00:00:00Z',
  duration: null,
  source: 'giantbomb',
});

describe('vercel-video-images', () => {
  describe('getBestThumbnailUrl', () => {
    it('should prefer maxres URL when available', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );

      const result = getBestThumbnailUrl(video);
      expect(result).toBe('https://i.ytimg.com/vi/1/maxresdefault.jpg');
    });

    it('should fallback to thumbnail_url when maxres not available', () => {
      const video = createMockVideo('1', 'https://i.ytimg.com/vi/1/hqdefault.jpg', null);

      const result = getBestThumbnailUrl(video);
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
    });

    it('should return null when no thumbnails available', () => {
      const video = createMockVideo('1', null, null);

      const result = getBestThumbnailUrl(video);
      expect(result).toBe(null);
    });
  });

  describe('isOptimizableVideoThumbnail', () => {
    it('should return true for YouTube thumbnail domains', () => {
      const urls = [
        'https://i.ytimg.com/vi/abc/hqdefault.jpg',
        'https://img.youtube.com/vi/abc/hqdefault.jpg',
        'https://i1.ytimg.com/vi/abc/hqdefault.jpg',
        'https://i2.ytimg.com/vi/abc/hqdefault.jpg',
        'https://i3.ytimg.com/vi/abc/hqdefault.jpg',
        'https://i4.ytimg.com/vi/abc/hqdefault.jpg',
      ];

      urls.forEach(url => {
        expect(isOptimizableVideoThumbnail(url)).toBe(true);
      });
    });

    it('should return false for non-YouTube domains', () => {
      const urls = [
        'https://example.com/thumbnail.jpg',
        'https://static-cdn.jtvnw.net/thumbnail.jpg',
        'https://other-domain.com/image.png',
      ];

      urls.forEach(url => {
        expect(isOptimizableVideoThumbnail(url)).toBe(false);
      });
    });

    it('should handle invalid URLs gracefully', () => {
      expect(isOptimizableVideoThumbnail('not-a-url')).toBe(false);
      expect(isOptimizableVideoThumbnail('')).toBe(false);
    });
  });

  describe('getVercelOptimizedVideoThumbnailUrl', () => {
    it('should generate correct Vercel Image API URL with default config', () => {
      const thumbnailUrl = 'https://i.ytimg.com/vi/abc123/hqdefault.jpg';
      
      const result = getVercelOptimizedVideoThumbnailUrl(thumbnailUrl);
      
      // Use encodeURIComponent to match actual behavior
      const expectedUrl = `/_vercel/image?url=${encodeURIComponent(thumbnailUrl)}&w=480&h=360&q=90`;
      expect(result).toBe(expectedUrl);
    });

    it('should generate correct Vercel Image API URL with custom config', () => {
      const thumbnailUrl = 'https://i.ytimg.com/vi/abc123/hqdefault.jpg';
      const config = { width: 1280, height: 720, quality: 85, format: 'webp' as const };
      
      const result = getVercelOptimizedVideoThumbnailUrl(thumbnailUrl, config);
      
      const expectedUrl = `/_vercel/image?url=${encodeURIComponent(thumbnailUrl)}&w=1280&h=720&q=85&f=webp`;
      expect(result).toBe(expectedUrl);
    });

    it('should omit format parameter when set to auto', () => {
      const thumbnailUrl = 'https://i.ytimg.com/vi/abc123/hqdefault.jpg';
      const config = { width: 640, height: 360, quality: 90, format: 'auto' as const };
      
      const result = getVercelOptimizedVideoThumbnailUrl(thumbnailUrl, config);
      
      const expectedUrl = `/_vercel/image?url=${encodeURIComponent(thumbnailUrl)}&w=640&h=360&q=90`;
      expect(result).toBe(expectedUrl);
    });
  });

  describe('getOptimizedVideoThumbnailUrl', () => {
    it('should use Vercel optimization for YouTube thumbnails', () => {
      const video = createMockVideo('1', 'https://i.ytimg.com/vi/1/hqdefault.jpg', null);
      
      const result = getOptimizedVideoThumbnailUrl(video);
      
      const expectedUrl = `/_vercel/image?url=${encodeURIComponent('https://i.ytimg.com/vi/1/hqdefault.jpg')}&w=480&h=360&q=90`;
      expect(result).toBe(expectedUrl);
    });

    it('should use maxres config when maxres URL available', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );
      
      const result = getOptimizedVideoThumbnailUrl(video);
      
      const expectedUrl = `/_vercel/image?url=${encodeURIComponent('https://i.ytimg.com/vi/1/maxresdefault.jpg')}&w=1280&h=720&q=90`;
      expect(result).toBe(expectedUrl);
    });

    it('should fallback to server processing for non-YouTube thumbnails', () => {
      const video = createMockVideo('1', 'https://example.com/thumbnail.jpg', null);
      
      const result = getOptimizedVideoThumbnailUrl(video);
      
      const expectedUrl = `/api/video-thumbnail?type=image&url=${encodeURIComponent('https://example.com/thumbnail.jpg')}`;
      expect(result).toBe(expectedUrl);
    });

    it('should return null when no thumbnail URL', () => {
      const video = createMockVideo('1', null, null);
      
      const result = getOptimizedVideoThumbnailUrl(video);
      
      expect(result).toBe(null);
    });

    it('should use custom config when provided', () => {
      const video = createMockVideo('1', 'https://i.ytimg.com/vi/1/hqdefault.jpg', null);
      const customConfig = { width: 320, height: 180, quality: 75, format: 'webp' as const };
      
      const result = getOptimizedVideoThumbnailUrl(video, customConfig);
      
      const expectedUrl = `/_vercel/image?url=${encodeURIComponent('https://i.ytimg.com/vi/1/hqdefault.jpg')}&w=320&h=180&q=75&f=webp`;
      expect(result).toBe(expectedUrl);
    });
  });

  describe('getResponsiveVideoThumbnailUrls', () => {
    it('should return multiple sizes for YouTube thumbnails', () => {
      const video = createMockVideo('1', 'https://i.ytimg.com/vi/1/hqdefault.jpg', null);
      
      const result = getResponsiveVideoThumbnailUrls(video);
      
      const baseUrl = 'https://i.ytimg.com/vi/1/hqdefault.jpg';
      expect(result.default).toBe(`/_vercel/image?url=${encodeURIComponent(baseUrl)}&w=480&h=360&q=90`);
      expect(result.small).toBe(`/_vercel/image?url=${encodeURIComponent(baseUrl)}&w=320&h=180&q=85`);
      expect(result.medium).toBe(`/_vercel/image?url=${encodeURIComponent(baseUrl)}&w=640&h=360&q=90`);
      expect(result.large).toBe(`/_vercel/image?url=${encodeURIComponent(baseUrl)}&w=1280&h=720&q=90`);
    });

    it('should return server URLs for non-YouTube thumbnails', () => {
      const video = createMockVideo('1', 'https://example.com/thumbnail.jpg', null);
      
      const result = getResponsiveVideoThumbnailUrls(video);
      
      const expectedUrl = `/api/video-thumbnail?type=image&url=${encodeURIComponent('https://example.com/thumbnail.jpg')}`;
      expect(result.default).toBe(expectedUrl);
      expect(result.small).toBe(expectedUrl);
      expect(result.medium).toBe(expectedUrl);
      expect(result.large).toBe(expectedUrl);
    });

    it('should return null values when no thumbnail URL', () => {
      const video = createMockVideo('1', null, null);
      
      const result = getResponsiveVideoThumbnailUrls(video);
      
      expect(result.default).toBe(null);
      expect(result.small).toBe(null);
      expect(result.medium).toBe(null);
      expect(result.large).toBe(null);
    });
  });

  describe('isVercelOptimizedUrl', () => {
    it('should return true for Vercel Image API URLs', () => {
      const url = '/_vercel/image?url=https%3A//i.ytimg.com/vi/1/hqdefault.jpg&w=480&h=360&q=90';
      expect(isVercelOptimizedUrl(url)).toBe(true);
    });

    it('should return false for non-Vercel URLs', () => {
      const urls = [
        '/api/video-thumbnail?url=test',
        'https://example.com/image.jpg',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
      ];

      urls.forEach(url => {
        expect(isVercelOptimizedUrl(url)).toBe(false);
      });
    });
  });

  describe('extractOriginalUrlFromVercel', () => {
    it('should extract original URL from Vercel Image API URL', () => {
      const vercelUrl = '/_vercel/image?url=https%3A//i.ytimg.com/vi/1/hqdefault.jpg&w=480&h=360&q=90';
      
      const result = extractOriginalUrlFromVercel(vercelUrl);
      
      expect(result).toBe('https://i.ytimg.com/vi/1/hqdefault.jpg');
    });

    it('should handle invalid URLs gracefully', () => {
      expect(extractOriginalUrlFromVercel('not-a-url')).toBe(null);
      expect(extractOriginalUrlFromVercel('')).toBe(null);
    });
  });

  describe('getVideoThumbnailCacheKey', () => {
    it('should generate cache key with default config', () => {
      const video = createMockVideo('1', 'https://i.ytimg.com/vi/1/hqdefault.jpg', null);
      
      const result = getVideoThumbnailCacheKey(video);
      
      expect(result).toBe('video-thumb:1:https://i.ytimg.com/vi/1/hqdefault.jpg:default');
    });

    it('should generate cache key with custom config', () => {
      const video = createMockVideo('1', 'https://i.ytimg.com/vi/1/hqdefault.jpg', null);
      const config = { width: 320, height: 180, quality: 85 };
      
      const result = getVideoThumbnailCacheKey(video, config);
      
      expect(result).toBe('video-thumb:1:https://i.ytimg.com/vi/1/hqdefault.jpg:{"width":320,"height":180,"quality":85}');
    });

    it('should use maxres URL when available', () => {
      const video = createMockVideo(
        '1',
        'https://i.ytimg.com/vi/1/hqdefault.jpg',
        'https://i.ytimg.com/vi/1/maxresdefault.jpg'
      );
      
      const result = getVideoThumbnailCacheKey(video);
      
      expect(result).toBe('video-thumb:1:https://i.ytimg.com/vi/1/maxresdefault.jpg:default');
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