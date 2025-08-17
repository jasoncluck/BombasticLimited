import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processVideoThumbnail,
  processVideoThumbnails,
  getVideoThumbnailUrl,
  clearThumbnailCache,
  getThumbnailCacheStats,
  type VideoWithProcessedThumbnail,
} from '../video-thumbnail-service';
import type { Video } from '$lib/supabase/videos';

// Mock browser environment
vi.mock('$app/environment', () => ({
  browser: true,
}));

// Mock fetch globally for all tests
const mockFetch = vi.fn();

// Mock video data
const createMockVideo = (id: string, thumbnailUrl?: string): Video => ({
  id,
  title: `Video ${id}`,
  description: `Description for video ${id}`,
  thumbnail_url: thumbnailUrl || `https://example.com/thumb-${id}.jpg`,
  published_at: '2023-01-01T00:00:00Z',
  duration: '00:30:00', // duration should be string in the Video type
  source: 'giantbomb', // Use valid source enum value
  thumbnail_maxres_url: null,
  image_url: null, // Add required image_url field
  views: 0, // Add required views field
  image_processing_status: 'completed', // Add required image_processing_status field
  image_processing_updated_at: null, // Add required image_processing_updated_at field
  thumbnail_webp_url: null, // Add required thumbnail_webp_url field
  thumbnail_avif_url: null, // Add required thumbnail_avif_url field
  thumbnail_maxres_webp_url: null, // Add required thumbnail_maxres_webp_url field
  thumbnail_maxres_avif_url: null, // Add required thumbnail_maxres_avif_url field
});

describe('video-thumbnail-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearThumbnailCache();

    // Setup global fetch mock
    global.fetch = mockFetch;

    // Set up default fetch mock behavior to return server failure
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      } as Response)
    );
  });

  describe('processVideoThumbnail', () => {
    it('should process video thumbnail and return processed URL', async () => {
      const video = createMockVideo('1');
      const processedUrl = 'data:image/webp;base64,processed-data';

      // Mock successful server-side processing
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ webpUrl: processedUrl }),
        } as Response)
      );

      const result = await processVideoThumbnail(video);

      expect(result).toEqual({
        ...video,
        processedThumbnailUrl: processedUrl,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/video-thumbnail?url=${encodeURIComponent(video.thumbnail_url!)}`,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: expect.objectContaining({
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should return null processed URL when no thumbnail URL', async () => {
      const video = createMockVideo('1', '');
      video.thumbnail_url = null as any;

      const result = await processVideoThumbnail(video);

      expect(result).toEqual({
        ...video,
        processedThumbnailUrl: null,
      });
    });

    it('should cache processed thumbnails', async () => {
      const video = createMockVideo('1');
      const processedUrl = 'data:image/webp;base64,processed-data';

      // Mock successful server-side processing
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ webpUrl: processedUrl }),
        } as Response)
      );

      // First call
      await processVideoThumbnail(video);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result = await processVideoThumbnail(video);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.processedThumbnailUrl).toBe(processedUrl);
    });

    it('should return null when server-side processing fails', async () => {
      const video = createMockVideo('1');

      // Mock server-side failure (default behavior from beforeEach)

      const result = await processVideoThumbnail(video);

      expect(result).toEqual({
        ...video,
        processedThumbnailUrl: null,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/video-thumbnail?url=${encodeURIComponent(video.thumbnail_url!)}`,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: expect.objectContaining({
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle processing errors gracefully', async () => {
      const video = createMockVideo('1');

      // Mock server-side failure (default from beforeEach)

      const result = await processVideoThumbnail(video);

      expect(result).toEqual({
        ...video,
        processedThumbnailUrl: null,
      });
    });

    it('should cache failures to avoid retrying', async () => {
      const video = createMockVideo('1');

      // Mock server-side failure (default from beforeEach)

      // First call
      await processVideoThumbnail(video);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cached failure (no additional calls)
      const result = await processVideoThumbnail(video);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.processedThumbnailUrl).toBe(null);
    });
  });

  describe('processVideoThumbnails', () => {
    it('should process multiple videos in batch', async () => {
      const videos = [
        createMockVideo('1'),
        createMockVideo('2'),
        createMockVideo('3'),
      ];
      const processedUrls = [
        'data:image/webp;base64,processed-1',
        'data:image/webp;base64,processed-2',
        'data:image/webp;base64,processed-3',
      ];

      // Mock successful server-side batch processing
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ webpUrls: processedUrls }),
        } as Response)
      );

      const results = await processVideoThumbnails(videos);

      expect(mockFetch).toHaveBeenCalledWith('/api/video-thumbnail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          thumbnailUrls: [
            videos[0].thumbnail_url,
            videos[1].thumbnail_url,
            videos[2].thumbnail_url,
          ],
        }),
        signal: expect.any(AbortSignal),
      });

      expect(results).toEqual([
        { ...videos[0], processedThumbnailUrl: processedUrls[0] },
        { ...videos[1], processedThumbnailUrl: processedUrls[1] },
        { ...videos[2], processedThumbnailUrl: processedUrls[2] },
      ]);
    });

    it('should handle empty video array', async () => {
      const results = await processVideoThumbnails([]);
      expect(results).toEqual([]);
    });

    it('should use cached results and only process uncached videos', async () => {
      const videos = [
        createMockVideo('1'),
        createMockVideo('2'),
        createMockVideo('3'),
      ];

      // Pre-cache one video
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ webpUrl: 'cached-processed-1' }),
        } as Response)
      );
      await processVideoThumbnail(videos[0]);
      vi.clearAllMocks();

      // Mock batch processing for uncached videos
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              webpUrls: [
                'data:image/webp;base64,processed-2',
                'data:image/webp;base64,processed-3',
              ],
            }),
        } as Response)
      );

      const results = await processVideoThumbnails(videos);

      // Should only process uncached videos
      expect(mockFetch).toHaveBeenCalledWith('/api/video-thumbnail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          thumbnailUrls: [videos[1].thumbnail_url, videos[2].thumbnail_url],
        }),
        signal: expect.any(AbortSignal),
      });

      expect(results[0].processedThumbnailUrl).toBe('cached-processed-1');
      expect(results[1].processedThumbnailUrl).toBe(
        'data:image/webp;base64,processed-2'
      );
      expect(results[2].processedThumbnailUrl).toBe(
        'data:image/webp;base64,processed-3'
      );
    });

    it('should handle videos without thumbnail URLs', async () => {
      const videos = [
        createMockVideo('1'),
        createMockVideo('2', ''),
        createMockVideo('3'),
      ];
      videos[1].thumbnail_url = null as any;

      // Mock batch processing for videos with thumbnail URLs
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              webpUrls: [
                'data:image/webp;base64,processed-1',
                'data:image/webp;base64,processed-3',
              ],
            }),
        } as Response)
      );

      const results = await processVideoThumbnails(videos);

      expect(mockFetch).toHaveBeenCalledWith('/api/video-thumbnail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          thumbnailUrls: [videos[0].thumbnail_url, videos[2].thumbnail_url],
        }),
        signal: expect.any(AbortSignal),
      });

      expect(results[0].processedThumbnailUrl).toBe(
        'data:image/webp;base64,processed-1'
      );
      expect(results[1].processedThumbnailUrl).toBe(null);
      expect(results[2].processedThumbnailUrl).toBe(
        'data:image/webp;base64,processed-3'
      );
    });

    it('should handle batch processing errors gracefully', async () => {
      const videos = [createMockVideo('1'), createMockVideo('2')];

      // Mock server-side failure (default behavior from beforeEach)

      const results = await processVideoThumbnails(videos);

      expect(results).toEqual([
        { ...videos[0], processedThumbnailUrl: null },
        { ...videos[1], processedThumbnailUrl: null },
      ]);
    });
  });

  describe('getVideoThumbnailUrl', () => {
    it('should return processed URL when available', () => {
      const video: VideoWithProcessedThumbnail = {
        ...createMockVideo('1'),
        processedThumbnailUrl: 'data:image/webp;base64,processed',
      };

      const result = getVideoThumbnailUrl(video);
      expect(result).toBe('data:image/webp;base64,processed');
    });

    it('should fallback to original thumbnail URL', () => {
      const video: VideoWithProcessedThumbnail = {
        ...createMockVideo('1'),
        processedThumbnailUrl: null,
      };

      const result = getVideoThumbnailUrl(video);
      expect(result).toBe(video.thumbnail_url);
    });

    it('should return empty string when no URLs available', () => {
      const video: VideoWithProcessedThumbnail = {
        ...createMockVideo('1', ''),
        processedThumbnailUrl: null,
      };
      video.thumbnail_url = null as any;

      const result = getVideoThumbnailUrl(video);
      expect(result).toBe('');
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      const video = createMockVideo('1');

      // Mock successful server-side processing
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ webpUrl: 'processed' }),
        } as Response)
      );

      await processVideoThumbnail(video);
      expect(getThumbnailCacheStats().size).toBe(1);

      clearThumbnailCache();
      expect(getThumbnailCacheStats().size).toBe(0);
    });

    it('should provide cache statistics', async () => {
      const videos = [createMockVideo('1'), createMockVideo('2')];

      // Mock successful server-side processing for both calls
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ webpUrl: 'processed' }),
        } as Response)
      );

      await processVideoThumbnail(videos[0]);
      await processVideoThumbnail(videos[1]);

      const stats = getThumbnailCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries).toContain(videos[0].thumbnail_url);
      expect(stats.entries).toContain(videos[1].thumbnail_url);
    });
  });
});
