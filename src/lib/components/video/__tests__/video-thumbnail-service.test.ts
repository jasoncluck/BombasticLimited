import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  processVideoThumbnail, 
  processVideoThumbnails, 
  getVideoThumbnailUrl, 
  clearThumbnailCache,
  getThumbnailCacheStats,
  type VideoWithProcessedThumbnail 
} from '../video-thumbnail-service';
import type { Video } from '$lib/supabase/videos';

// Mock the playlist-service functions
vi.mock('../../playlist/playlist-service', () => ({
  getVideoThumbnailWebpUrl: vi.fn(),
  getVideoThumbnailWebpUrlsBatch: vi.fn(),
}));

const mockGetVideoThumbnailWebpUrl = vi.mocked(
  await import('../../playlist/playlist-service')
).getVideoThumbnailWebpUrl;

const mockGetVideoThumbnailWebpUrlsBatch = vi.mocked(
  await import('../../playlist/playlist-service')
).getVideoThumbnailWebpUrlsBatch;

// Mock video data
const createMockVideo = (id: string, thumbnailUrl?: string): Video => ({
  id,
  title: `Video ${id}`,
  description: `Description for video ${id}`,
  thumbnail_url: thumbnailUrl || `https://example.com/thumb-${id}.jpg`,
  published_at: '2023-01-01T00:00:00Z',
  duration: null, // duration is string | null in the database
  source: 'giantbomb', // Use valid source enum value
  thumbnail_maxres_url: null,
});

describe('video-thumbnail-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearThumbnailCache();
  });

  describe('processVideoThumbnail', () => {
    it('should process video thumbnail and return processed URL', async () => {
      const video = createMockVideo('1');
      const processedUrl = 'data:image/webp;base64,processed-data';

      mockGetVideoThumbnailWebpUrl.mockResolvedValue(processedUrl);

      const result = await processVideoThumbnail(video);

      expect(mockGetVideoThumbnailWebpUrl).toHaveBeenCalledWith({
        thumbnailUrl: video.thumbnail_url,
      });
      expect(result).toEqual({
        ...video,
        processedThumbnailUrl: processedUrl,
      });
    });

    it('should return null processed URL when no thumbnail URL', async () => {
      const video = createMockVideo('1', '');
      video.thumbnail_url = null as any;

      const result = await processVideoThumbnail(video);

      expect(mockGetVideoThumbnailWebpUrl).not.toHaveBeenCalled();
      expect(result).toEqual({
        ...video,
        processedThumbnailUrl: null,
      });
    });

    it('should cache processed thumbnails', async () => {
      const video = createMockVideo('1');
      const processedUrl = 'data:image/webp;base64,processed-data';

      mockGetVideoThumbnailWebpUrl.mockResolvedValue(processedUrl);

      // First call
      await processVideoThumbnail(video);
      expect(mockGetVideoThumbnailWebpUrl).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result = await processVideoThumbnail(video);
      expect(mockGetVideoThumbnailWebpUrl).toHaveBeenCalledTimes(1);
      expect(result.processedThumbnailUrl).toBe(processedUrl);
    });

    it('should handle processing errors gracefully', async () => {
      const video = createMockVideo('1');
      
      mockGetVideoThumbnailWebpUrl.mockRejectedValue(new Error('Processing failed'));

      const result = await processVideoThumbnail(video);

      expect(result).toEqual({
        ...video,
        processedThumbnailUrl: null,
      });
    });

    it('should cache failures to avoid retrying', async () => {
      const video = createMockVideo('1');
      
      mockGetVideoThumbnailWebpUrl.mockRejectedValue(new Error('Processing failed'));

      // First call
      await processVideoThumbnail(video);
      expect(mockGetVideoThumbnailWebpUrl).toHaveBeenCalledTimes(1);

      // Second call should use cached failure
      const result = await processVideoThumbnail(video);
      expect(mockGetVideoThumbnailWebpUrl).toHaveBeenCalledTimes(1);
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

      mockGetVideoThumbnailWebpUrlsBatch.mockResolvedValue(processedUrls);

      const results = await processVideoThumbnails(videos);

      expect(mockGetVideoThumbnailWebpUrlsBatch).toHaveBeenCalledWith([
        videos[0].thumbnail_url,
        videos[1].thumbnail_url,
        videos[2].thumbnail_url,
      ]);

      expect(results).toEqual([
        { ...videos[0], processedThumbnailUrl: processedUrls[0] },
        { ...videos[1], processedThumbnailUrl: processedUrls[1] },
        { ...videos[2], processedThumbnailUrl: processedUrls[2] },
      ]);
    });

    it('should handle empty video array', async () => {
      const results = await processVideoThumbnails([]);
      expect(results).toEqual([]);
      expect(mockGetVideoThumbnailWebpUrlsBatch).not.toHaveBeenCalled();
    });

    it('should use cached results and only process uncached videos', async () => {
      const videos = [
        createMockVideo('1'),
        createMockVideo('2'),
        createMockVideo('3'),
      ];

      // Pre-cache one video
      mockGetVideoThumbnailWebpUrl.mockResolvedValue('cached-processed-1');
      await processVideoThumbnail(videos[0]);
      vi.clearAllMocks();

      mockGetVideoThumbnailWebpUrlsBatch.mockResolvedValue([
        'data:image/webp;base64,processed-2',
        'data:image/webp;base64,processed-3',
      ]);

      const results = await processVideoThumbnails(videos);

      // Should only process uncached videos
      expect(mockGetVideoThumbnailWebpUrlsBatch).toHaveBeenCalledWith([
        videos[1].thumbnail_url,
        videos[2].thumbnail_url,
      ]);

      expect(results[0].processedThumbnailUrl).toBe('cached-processed-1');
      expect(results[1].processedThumbnailUrl).toBe('data:image/webp;base64,processed-2');
      expect(results[2].processedThumbnailUrl).toBe('data:image/webp;base64,processed-3');
    });

    it('should handle videos without thumbnail URLs', async () => {
      const videos = [
        createMockVideo('1'),
        createMockVideo('2', ''),
        createMockVideo('3'),
      ];
      videos[1].thumbnail_url = null as any;

      mockGetVideoThumbnailWebpUrlsBatch.mockResolvedValue([
        'data:image/webp;base64,processed-1',
        'data:image/webp;base64,processed-3',
      ]);

      const results = await processVideoThumbnails(videos);

      expect(mockGetVideoThumbnailWebpUrlsBatch).toHaveBeenCalledWith([
        videos[0].thumbnail_url,
        videos[2].thumbnail_url,
      ]);

      expect(results[0].processedThumbnailUrl).toBe('data:image/webp;base64,processed-1');
      expect(results[1].processedThumbnailUrl).toBe(null);
      expect(results[2].processedThumbnailUrl).toBe('data:image/webp;base64,processed-3');
    });

    it('should handle batch processing errors gracefully', async () => {
      const videos = [createMockVideo('1'), createMockVideo('2')];

      mockGetVideoThumbnailWebpUrlsBatch.mockRejectedValue(new Error('Batch processing failed'));

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
      mockGetVideoThumbnailWebpUrl.mockResolvedValue('processed');

      await processVideoThumbnail(video);
      expect(getThumbnailCacheStats().size).toBe(1);

      clearThumbnailCache();
      expect(getThumbnailCacheStats().size).toBe(0);
    });

    it('should provide cache statistics', async () => {
      const videos = [createMockVideo('1'), createMockVideo('2')];
      mockGetVideoThumbnailWebpUrl.mockResolvedValue('processed');

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