import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getVideos,
  getVideo,
  getInProgressVideos,
  incrementVideoView,
  isVideoWithTimestamp,
  isVideoWithPlaylistTimestamp,
  DEFAULT_NUM_VIDEOS_PAGINATION,
  DEFAULT_NUM_VIDEOS_OVERVIEW,
  type Video,
  type VideoWithTimestamp,
} from '../videos';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

// Mock the content filter module
vi.mock('$lib/components/content/content-filter', () => ({
  SORT_OPTIONS_VIDEO: {
    published: { tableColumn: 'published_at' },
    views: { tableColumn: 'views' },
    title: { tableColumn: 'title' },
  },
  SORT_OPTIONS_TIMESTAMPS: {
    lastWatched: { tableColumn: 'watched_at' },
    recentlyUpdated: { tableColumn: 'updated_at' },
    dateTimestamp: { tableColumn: 'updated_at' },
  },
}));

// Mock the playlists module
vi.mock('../playlists', () => ({
  getFullImageUrl: vi.fn((url, supabase) =>
    url ? `https://supabase.co/storage/v1/object/public/${url}` : null
  ),
}));

describe('videos module', () => {
  let mockSupabase: SupabaseClient<Database>;

  const createMockSupabaseClient = () => {
    const mockRpc = vi.fn();
    const mockLimit = vi.fn();
    const mockOrder = vi.fn();
    const mockGte = vi.fn();
    const mockLte = vi.fn();
    const mockRange = vi.fn();
    const mockEq = vi.fn();

    // Setup default chain
    mockRpc.mockReturnValue({
      limit: mockLimit.mockReturnThis(),
      order: mockOrder.mockReturnThis(),
      gte: mockGte.mockReturnThis(),
      lte: mockLte.mockReturnThis(),
      range: mockRange.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      single: vi.fn(),
    });

    return {
      rpc: mockRpc,
      mockLimit,
      mockOrder,
      mockGte,
      mockLte,
      mockRange,
      mockEq,
    } as any;
  };

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient();
  });

  describe('getVideos', () => {
    it('should fetch videos successfully without search', async () => {
      const mockVideoData = [
        {
          id: 'video1',
          source: 'youtube',
          title: 'Test Video 1',
          description: 'Test description',
          thumbnail_url: 'https://youtube.com/thumb1.jpg',
          image_url: 'path/to/image1.webp',
          published_at: '2023-01-01T00:00:00.000Z',
          duration: '00:10:30',
          views: 1000,
          video_start_seconds: null,
          updated_at: null,
          watched_at: null,
          playlist_name: null,
          playlist_short_id: null,
          playlist_sorted_by: null,
          playlist_sort_order: null,
        },
      ];

      // Create a proper thenable mock
      const mockQuery = Object.assign(
        Promise.resolve({
          data: mockVideoData,
          count: 1,
          error: null,
        }),
        {
          limit: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      );

      (mockSupabase.rpc as any).mockReturnValue(mockQuery);

      const result = await getVideos({
        source: 'giantbomb',
        contentFilter: {
          type: 'video',
          sort: { key: 'datePublished', order: 'descending' },
        },
        currentPage: 1,
        limit: 15,
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'get_videos_with_timestamps',
        { p_preferred_image_format: 'webp' },
        { count: 'exact' }
      );
      expect(result.error).toBeNull();
      expect(result.videos).toHaveLength(1);
      expect(result.videos[0]).toMatchObject({
        id: 'video1',
        source: 'youtube',
        title: 'Test Video 1',
      });
    });

    it('should fetch videos with search term', async () => {
      const mockSearchData = [
        {
          id: 'search1',
          source: 'giantbomb',
          title: 'Search Result',
          description: 'Found video',
          thumbnail_url: 'https://youtube.com/search1.jpg',
          image_url: 'path/to/search1.webp',
          published_at: '2023-01-01T00:00:00.000Z',
          duration: '00:05:15',
          views: 500,
          video_start_seconds: 10,
          updated_at: '2023-01-02T00:00:00.000Z',
          watched_at: '2023-01-02T00:00:00.000Z',
          playlist_name: 'Search Playlist',
          playlist_short_id: 'sp123',
          playlist_sorted_by: 'datePublished',
          playlist_sort_order: 'ascending',
        },
      ];

      const mockQuery = Object.assign(
        Promise.resolve({
          data: mockSearchData,
          count: 1,
          error: null,
        }),
        {
          limit: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      );

      (mockSupabase.rpc as any).mockReturnValue(mockQuery);

      const result = await getVideos({
        searchString: 'test search',
        contentFilter: {
          type: 'video',
          sort: { key: 'searchRelevance', order: 'ascending' },
        },
        supabase: mockSupabase,
        preferredImageFormat: 'avif',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'search_videos',
        {
          search_term: 'test search',
          p_preferred_image_format: 'avif',
        },
        { count: 'exact' }
      );
      expect(result.videos[0]).toMatchObject({
        id: 'search1',
        playlist_name: 'Search Playlist',
        video_start_seconds: 10,
      });
    });

    it('should handle pagination correctly', async () => {
      const mockQuery = Object.assign(
        Promise.resolve({
          data: [],
          count: 0,
          error: null,
        }),
        {
          limit: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      );

      (mockSupabase.rpc as any).mockReturnValue(mockQuery);

      await getVideos({
        contentFilter: {
          type: 'video',
          sort: { key: 'datePublished', order: 'descending' },
        },
        currentPage: 3,
        limit: 20,
        supabase: mockSupabase,
        preferredImageFormat: 'jpeg',
      });

      const mockReturnValue = (mockSupabase.rpc as any).mock.results[0].value;
      expect(mockReturnValue.range).toHaveBeenCalledWith(40, 59); // (3-1) * 20 = 40, 40 + 20 - 1 = 59
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'Database error', code: '500' };

      const mockQuery = Object.assign(
        Promise.resolve({
          data: null,
          count: null,
          error: mockError,
        }),
        {
          limit: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      );

      (mockSupabase.rpc as any).mockReturnValue(mockQuery);

      const result = await getVideos({
        contentFilter: {
          type: 'video',
          sort: { key: 'datePublished', order: 'descending' },
        },
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(result.error).toEqual(mockError);
      expect(result.videos).toEqual([]);
    });

    it('should apply source filter when provided', async () => {
      (mockSupabase.rpc as any).mockReturnValue({
        limit: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          count: 0,
          error: null,
        }),
      });

      await getVideos({
        source: 'nextlander',
        contentFilter: {
          type: 'video',
          sort: { key: 'datePublished', order: 'descending' },
        },
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      const mockReturnValue = (mockSupabase.rpc as any).mock.results[0].value;
      expect(mockReturnValue.eq).toHaveBeenCalledWith('source', 'nextlander');
    });
  });

  describe('getVideo', () => {
    it('should fetch single video successfully', async () => {
      const mockVideoData = {
        id: 'single-video',
        source: 'youtube',
        title: 'Single Video',
        description: 'Single video description',
        thumbnail_url: 'https://youtube.com/single.jpg',
        image_url: 'path/to/single.avif',
        published_at: '2023-01-01T00:00:00.000Z',
        duration: '00:15:45',
        views: 2000,
        video_start_seconds: 30,
        updated_at: '2023-01-03T00:00:00.000Z',
        watched_at: '2023-01-03T00:00:00.000Z',
        playlist_name: 'My Playlist',
        playlist_short_id: 'mp456',
        playlist_sorted_by: 'views',
        playlist_sort_order: 'descending',
      };

      (mockSupabase.rpc as any).mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockVideoData,
          error: null,
        }),
      });

      const result = await getVideo({
        videoId: 'single-video',
        supabase: mockSupabase,
        preferredImageFormat: 'avif',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'get_videos_with_timestamps',
        {
          p_preferred_image_format: 'avif',
        }
      );
      expect(result.error).toBeNull();
      expect(result.video).toMatchObject({
        id: 'single-video',
        title: 'Single Video',
        video_start_seconds: 30,
      });
    });

    it('should handle video not found', async () => {
      const mockError = { message: 'Not found', code: '404' };
      (mockSupabase.rpc as any).mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      });

      const result = await getVideo({
        videoId: 'nonexistent',
        supabase: mockSupabase,
      });

      expect(result.error).toEqual(mockError);
      expect(result.video).toBeNull();
    });

    it('should use default image format when not provided', async () => {
      (mockSupabase.rpc as any).mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });

      await getVideo({
        videoId: 'test-video',
        supabase: mockSupabase,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'get_videos_with_timestamps',
        {
          p_preferred_image_format: 'avif',
        }
      );
    });
  });

  describe('getInProgressVideos', () => {
    it.skip('should fetch in-progress videos successfully', async () => {
      const mockInProgressData = [
        {
          id: 'progress1',
          source: 'youtube',
          title: 'In Progress Video',
          description: 'Video in progress',
          thumbnail_url: 'https://youtube.com/progress1.jpg',
          image_url: 'path/to/progress1.webp',
          published_at: '2023-01-01T00:00:00.000Z',
          duration: '01:00:00',
          views: 5000,
          video_start_seconds: 1800, // 30 minutes in
          updated_at: '2023-01-05T00:00:00.000Z',
          watched_at: '2023-01-05T00:00:00.000Z',
          playlist_name: 'Watch Later',
          playlist_short_id: 'wl789',
          playlist_sorted_by: 'lastWatched',
          playlist_sort_order: 'descending',
        },
      ];

      // Create a proper mock query chain
      const mockQuery = {
        limit: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          data: mockInProgressData,
          count: 1,
          error: null,
        }),
      };

      (mockSupabase.rpc as any).mockReturnValue(mockQuery);

      const result = await getInProgressVideos({
        limit: 10,
        contentFilter: {
          type: 'timestamp',
          sort: { key: 'dateTimestamp', order: 'descending' },
          startDate: '2023-01-01',
          endDate: '2023-01-31',
        },
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'get_in_progress_videos_with_timestamps',
        { p_preferred_image_format: 'webp' },
        { count: 'exact' }
      );
      expect(result.error).toBeUndefined();
      expect(result.videos).toHaveLength(1);
      expect(result.videos[0]).toMatchObject({
        id: 'progress1',
        video_start_seconds: 1800,
        playlist_name: 'Watch Later',
      });
    });

    it('should apply date filters correctly', async () => {
      (mockSupabase.rpc as any).mockReturnValue({
        limit: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          data: [],
          count: 0,
          error: null,
        }),
      });

      await getInProgressVideos({
        contentFilter: {
          type: 'timestamp',
          sort: { key: 'dateTimestamp', order: 'ascending' },
          startDate: '2023-06-01',
          endDate: '2023-06-30',
        },
        supabase: mockSupabase,
      });

      const mockReturnValue = (mockSupabase.rpc as any).mock.results[0].value;
      expect(mockReturnValue.gte).toHaveBeenCalledWith(
        'published_at',
        '2023-06-01T07:00:00.000Z'
      );
      expect(mockReturnValue.lte).toHaveBeenCalledWith(
        'published_at',

        '2023-07-01T06:59:59.999Z'
      );
    });

    it('should handle invalid date filters gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (mockSupabase.rpc as any).mockReturnValue({
        limit: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          data: [],
          count: 0,
          error: null,
        }),
      });

      await getInProgressVideos({
        contentFilter: {
          type: 'timestamp',
          sort: { key: 'dateTimestamp', order: 'ascending' },
          startDate: 'invalid-date',
          endDate: 'also-invalid',
        },
        supabase: mockSupabase,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unable to parse start date, ignoring.'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Unable to parse end date, ignoring.'
      );

      consoleSpy.mockRestore();
    });

    it.skip('should handle RPC errors', async () => {
      const mockError = { message: 'Permission denied', code: '403' };

      // Create a proper mock query chain
      const mockQuery = {
        limit: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          count: null,
          error: mockError,
        }),
      };

      (mockSupabase.rpc as any).mockReturnValue(mockQuery);

      const result = await getInProgressVideos({
        contentFilter: {
          type: 'timestamp',
          sort: { key: 'dateTimestamp', order: 'ascending' },
        },
        supabase: mockSupabase,
      });

      expect(result.error).toEqual(mockError);
      expect(result.videos).toEqual([]);
    });
  });

  describe('incrementVideoView', () => {
    it('should call RPC to increment video views', () => {
      (mockSupabase.rpc as any).mockImplementation(() => {});

      incrementVideoView({
        videoId: 'test-video-id',
        supabase: mockSupabase,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_video_views', {
        video_id: 'test-video-id',
      });
    });
  });

  describe('type guards', () => {
    describe('isVideoWithTimestamp', () => {
      it('should return true for video with watched_at', () => {
        const video: VideoWithTimestamp = {
          id: 'test',
          source: 'giantbomb',
          title: 'Test',
          description: 'Test',
          thumbnail_url: 'test.jpg',
          image_url: null,
          published_at: '2023-01-01T00:00:00.000Z',
          duration: '00:10:00',
          views: 100,
          video_start_seconds: null,
          updated_at: null,
          watched_at: '2023-01-01T00:00:00.000Z',
        };

        expect(isVideoWithTimestamp(video)).toBe(true);
      });

      it('should return true for video with video_start_seconds', () => {
        const video: VideoWithTimestamp = {
          id: 'test',
          source: 'jeffgerstmann',
          title: 'Test',
          description: 'Test',
          thumbnail_url: 'test.jpg',
          image_url: null,
          published_at: '2023-01-01T00:00:00.000Z',
          duration: '00:10:00',
          views: 100,
          video_start_seconds: 300,
          updated_at: null,
          watched_at: null,
        };

        expect(isVideoWithTimestamp(video)).toBe(true);
      });

      it('should return false for video without timestamp data', () => {
        const video: Video = {
          id: 'test',
          source: 'nextlander',
          title: 'Test',
          description: 'Test',
          thumbnail_url: 'test.jpg',
          image_url: null,
          published_at: '2023-01-01T00:00:00.000Z',
          duration: '00:10:00',
          views: 100,
        };

        expect(isVideoWithTimestamp(video)).toBe(false);
      });

      it('should return false for undefined video', () => {
        expect(isVideoWithTimestamp(undefined)).toBe(false);
      });
    });

    describe('isVideoWithPlaylistTimestamp', () => {
      it('should return true for video with complete playlist timestamp data', () => {
        const video: VideoWithTimestamp = {
          id: 'test',
          source: 'remap',
          title: 'Test',
          description: 'Test',
          thumbnail_url: 'test.jpg',
          image_url: null,
          published_at: '2023-01-01T00:00:00.000Z',
          duration: '00:10:00',
          views: 100,
          video_start_seconds: 300,
          updated_at: null,
          watched_at: '2023-01-01T00:00:00.000Z',
          playlist_short_id: 'pl123',
          playlist_sorted_by: 'datePublished',
          playlist_sort_order: 'ascending',
        };

        expect(isVideoWithPlaylistTimestamp(video)).toBe(true);
      });

      it('should return false for video missing playlist data', () => {
        const video: VideoWithTimestamp = {
          id: 'test',
          source: 'giantbomb',
          title: 'Test',
          description: 'Test',
          thumbnail_url: 'test.jpg',
          image_url: null,
          published_at: '2023-01-01T00:00:00.000Z',
          duration: '00:10:00',
          views: 100,
          video_start_seconds: 300,
          updated_at: null,
          watched_at: '2023-01-01T00:00:00.000Z',
          playlist_short_id: null,
          playlist_sorted_by: null,
          playlist_sort_order: null,
        };

        expect(isVideoWithPlaylistTimestamp(video)).toBe(false);
      });

      it('should return false for video without timestamp data', () => {
        const video: Video = {
          id: 'test',
          source: 'remap',
          title: 'Test',
          description: 'Test',
          thumbnail_url: 'test.jpg',
          image_url: null,
          published_at: '2023-01-01T00:00:00.000Z',
          duration: '00:10:00',
          views: 100,
        };

        expect(isVideoWithPlaylistTimestamp(video)).toBe(false);
      });
    });
  });

  describe('constants', () => {
    it('should export correct default values', () => {
      expect(DEFAULT_NUM_VIDEOS_PAGINATION).toBe(100);
      expect(DEFAULT_NUM_VIDEOS_OVERVIEW).toBe(15);
    });
  });
});
