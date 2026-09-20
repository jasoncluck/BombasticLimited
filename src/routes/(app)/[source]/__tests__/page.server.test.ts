import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from '@sveltejs/kit';
import { load } from '../+page.server';
import { getVideos } from '$lib/supabase/videos';
import {
  getPlaylistDataByYoutubeId,
  getPlaylistsForUsername,
} from '$lib/supabase/playlists';

// Mock dependencies
vi.mock('@sveltejs/kit', () => ({
  redirect: vi.fn(() => {
    throw new Error('Redirect');
  }),
}));

vi.mock('$lib/supabase/videos', () => ({
  getVideos: vi.fn(),
  DEFAULT_NUM_VIDEOS_OVERVIEW: 10,
}));

vi.mock('$lib/supabase/playlists', () => ({
  getPlaylistDataByYoutubeId: vi.fn(),
  getPlaylistsForUsername: vi.fn(),
  DEFAULT_NUM_PLAYLISTS_OVERVIEW: 12,
}));

vi.mock('$lib/server/image-processing', () => ({
  generatePlaylistImageUrl: vi.fn(),
}));

vi.mock('$lib/constants/source', () => ({
  isSource: vi.fn((source: string) =>
    ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'].includes(source)
  ),
  SOURCE_INFO: {
    giantbomb: {
      displayName: 'Giant Bomb',
      highlightedPlaylists: [
        { youtubeId: 'playlist1', name: 'Featured Playlist 1' },
        { youtubeId: 'playlist2', name: 'Featured Playlist 2' },
      ],
    },
    jeffgerstmann: {
      displayName: 'Jeff Gerstmann',
      highlightedPlaylists: [],
    },
    nextlander: {
      displayName: 'Nextlander',
      highlightedPlaylists: [
        { youtubeId: 'playlist3', name: 'Nextlander Playlist' },
      ],
    },
    remap: {
      displayName: 'Remap Radio',
      highlightedPlaylists: [],
    },
  },
}));

vi.mock('$lib/components/content/content-filter', () => ({
  isVideoFilter: vi.fn(() => true),
}));

vi.mock('$lib/components/playlist/playlist', () => ({
  parseImageProperties: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
}));

const mockGetVideos = vi.mocked(getVideos);
const mockGetPlaylistDataByYoutubeId = vi.mocked(getPlaylistDataByYoutubeId);
const mockGetPlaylistsForUsername = vi.mocked(getPlaylistsForUsername);
const mockRedirect = vi.mocked(redirect);

// Import the mocked functions so we can control them
import { isVideoFilter } from '$lib/components/content/content-filter';
import {
  createMockSession,
  createMockUserProfile,
  createMockVideo,
  createMockPlaylist,
  createMockVideoResponse,
  createMockPlaylistDataResponse,
  createMockPlaylistsResponse,
} from '$lib/tests/test-utils';
const mockIsVideoFilter = vi.mocked(isVideoFilter);

describe('[source]/+page.server.ts load function', () => {
  const mockSupabase = {} as any;
  const mockSession = createMockSession();
  const mockUserProfile = createMockUserProfile();

  const mockVideos = [
    createMockVideo({ id: 'v1', title: 'Video 1', source: 'giantbomb' }),
    createMockVideo({ id: 'v2', title: 'Video 2', source: 'giantbomb' }),
  ];

  const mockPlaylist = createMockPlaylist({
    id: 'p1',
    short_id: 'abc123',
    name: 'Test Playlist',
    youtube_id: 'playlist1',
    thumbnail_url: 'https://example.com/thumb.jpg',
    image_properties: '{"x": 0, "y": 0, "width": 100, "height": 100}',
    type: 'Public' as const,
    created_by: mockSession.user.id,
    description: 'Test playlist description',
  });

  const mockSourcePlaylists = [
    createMockPlaylist({
      id: 'sp1',
      short_id: 'def456',
      name: 'Source Playlist 1',
      thumbnail_url: 'https://example.com/thumb1.jpg',
      image_properties: '{"x": 0, "y": 0, "width": 100, "height": 100}',
      type: 'Public' as const,
      created_by: mockSession.user.id,
      description: 'Source playlist description',
      youtube_id: 'source_playlist_1',
    }),
  ];

  const mockLoadEvent: any = {
    params: { source: 'giantbomb' },
    parent: vi.fn(),
    depends: vi.fn(),
    locals: {
      supabase: mockSupabase,
      session: mockSession,
    },
    setHeaders: vi.fn(),
    isDataRequest: false,
    request: {
      headers: new Map(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock to its default behavior
    mockIsVideoFilter.mockReturnValue(true);

    mockLoadEvent.parent.mockResolvedValue({
      contentFilter: {
        sort: { key: 'datePublished', order: 'descending' },
        type: 'video',
      },
      preferredImageFormat: 'webp',
    });

    // Mock headers.get method
    mockLoadEvent.request.headers = {
      get: vi.fn(() => null),
    };
  });

  describe('source validation', () => {
    it('should load data for valid source', async () => {
      mockGetVideos.mockResolvedValue(createMockVideoResponse(mockVideos));
      mockGetPlaylistDataByYoutubeId.mockResolvedValue(
        createMockPlaylistDataResponse(mockPlaylist, [mockVideos[0]], 1)
      );
      mockGetPlaylistsForUsername.mockResolvedValue(
        createMockPlaylistsResponse(mockSourcePlaylists, 1)
      );

      const result = await load(mockLoadEvent);

      expect(mockLoadEvent.depends).toHaveBeenCalledWith('supabase:db:videos');
      expect((result as any).source).toBe('giantbomb');
      expect((result as any).videos).toEqual(mockVideos);
    });

    it('should redirect for invalid source', async () => {
      const invalidLoadEvent = {
        ...mockLoadEvent,
        params: { source: 'invalid-source' },
      };

      await expect(load(invalidLoadEvent)).rejects.toThrow('Redirect');
      expect(mockRedirect).toHaveBeenCalledWith(303, '/');
    });

    it('should validate known sources', async () => {
      const validSources = [
        'giantbomb',
        'jeffgerstmann',
        'nextlander',
        'remap',
      ];

      for (const source of validSources) {
        const loadEvent = {
          ...mockLoadEvent,
          params: { source },
        };

        mockGetVideos.mockResolvedValue(createMockVideoResponse([]));
        mockGetPlaylistDataByYoutubeId.mockResolvedValue(
          createMockPlaylistDataResponse(null, [], 0)
        );
        mockGetPlaylistsForUsername.mockResolvedValue(
          createMockPlaylistsResponse([], 0)
        );

        const result = await load(loadEvent);
        expect((result as any).source).toBe(source);
      }
    });
  });

  describe('data fetching', () => {
    beforeEach(() => {
      mockGetVideos.mockResolvedValue(createMockVideoResponse(mockVideos));
      mockGetPlaylistDataByYoutubeId.mockResolvedValue(
        createMockPlaylistDataResponse(mockPlaylist, [mockVideos[0]], 1)
      );
      mockGetPlaylistsForUsername.mockResolvedValue(
        createMockPlaylistsResponse(mockSourcePlaylists, 1)
      );
    });

    it('should fetch videos for the source', async () => {
      await load(mockLoadEvent);

      expect(mockGetVideos).toHaveBeenCalledWith({
        source: 'giantbomb',
        limit: 10,
        preferredImageFormat: 'webp',
        contentFilter: {
          sort: { key: 'datePublished', order: 'descending' },
          type: 'video',
        },
        supabase: mockSupabase,
      });
    });

    it('should fetch highlighted playlists', async () => {
      await load(mockLoadEvent);

      expect(mockGetPlaylistDataByYoutubeId).toHaveBeenCalledWith({
        youtubeId: 'playlist1',
        contentFilter: {
          sort: { key: 'playlistOrder', order: 'ascending' },
          type: 'playlist',
        },
        limit: 12,
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(mockGetPlaylistDataByYoutubeId).toHaveBeenCalledWith({
        youtubeId: 'playlist2',
        contentFilter: {
          sort: { key: 'playlistOrder', order: 'ascending' },
          type: 'playlist',
        },
        limit: 12,
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });
    });

    it('should fetch source playlists', async () => {
      await load(mockLoadEvent);

      expect(mockGetPlaylistsForUsername).toHaveBeenCalledWith({
        username: 'giantbomb',
        limit: 12,
        preferredImageFormat: 'webp',
        supabase: mockSupabase,
      });
    });

    it('should handle data fetching correctly', async () => {
      await load(mockLoadEvent);

      // Verify all main data sources are fetched
      expect(mockGetVideos).toHaveBeenCalledWith({
        source: 'giantbomb',
        limit: 10,
        preferredImageFormat: 'webp',
        contentFilter: {
          sort: { key: 'datePublished', order: 'descending' },
          type: 'video',
        },
        supabase: mockSupabase,
      });

      expect(mockGetPlaylistDataByYoutubeId).toHaveBeenCalledWith({
        youtubeId: 'playlist2',
        contentFilter: {
          sort: { key: 'playlistOrder', order: 'ascending' },
          type: 'playlist',
        },
        limit: 12,
        supabase: mockSupabase,
        preferredImageFormat: 'webp',
      });

      expect(mockGetPlaylistsForUsername).toHaveBeenCalledWith({
        username: 'giantbomb',
        limit: 12,
        preferredImageFormat: 'webp',
        supabase: mockSupabase,
      });
    });
  });

  describe('highlighted playlists handling', () => {
    it('should handle sources with no highlighted playlists', async () => {
      const jeffGerstmannEvent = {
        ...mockLoadEvent,
        params: { source: 'jeffgerstmann' },
      };

      mockGetVideos.mockResolvedValue(createMockVideoResponse(mockVideos));
      mockGetPlaylistsForUsername.mockResolvedValue(
        createMockPlaylistsResponse([], 0)
      );

      const result = await load(jeffGerstmannEvent);

      // Should not call getPlaylistDataByYoutubeId for sources with no highlighted playlists
      expect(mockGetPlaylistDataByYoutubeId).not.toHaveBeenCalled();
      expect((result as any).highlightPlaylists).toEqual([]);
    });

    it('should filter out null playlist results', async () => {
      mockGetVideos.mockResolvedValue(createMockVideoResponse(mockVideos));
      mockGetPlaylistDataByYoutubeId
        .mockResolvedValueOnce(
          createMockPlaylistDataResponse(mockPlaylist, [mockVideos[0]], 1)
        )
        .mockResolvedValueOnce(createMockPlaylistDataResponse(null, [], 0));
      mockGetPlaylistsForUsername.mockResolvedValue(
        createMockPlaylistsResponse([], 0)
      );

      const result = await load(mockLoadEvent);

      expect((result as any).highlightPlaylists).toHaveLength(1);
      expect((result as any).highlightPlaylists[0].playlist).toEqual(
        mockPlaylist
      );
    });

    it('should override playlist names from SOURCE_INFO', async () => {
      mockGetVideos.mockResolvedValue(createMockVideoResponse(mockVideos));
      mockGetPlaylistDataByYoutubeId.mockResolvedValue(
        createMockPlaylistDataResponse(
          { ...mockPlaylist, name: 'Original Name' },
          [mockVideos[0]],
          1
        )
      );
      mockGetPlaylistsForUsername.mockResolvedValue(
        createMockPlaylistsResponse([], 0)
      );

      const result = await load(mockLoadEvent);

      expect((result as any).highlightPlaylists[0].playlist.name).toBe(
        'Featured Playlist 2'
      );
    });
  });

  describe('error handling', () => {
    it('should handle video fetch errors gracefully', async () => {
      mockGetVideos.mockRejectedValue(new Error('Database error'));
      mockGetPlaylistsForUsername.mockResolvedValue(
        createMockPlaylistsResponse([], 0)
      );

      await expect(load(mockLoadEvent)).rejects.toThrow('Database error');
    });

    it('should handle playlist fetch errors gracefully', async () => {
      mockGetVideos.mockResolvedValue(createMockVideoResponse(mockVideos));
      mockGetPlaylistDataByYoutubeId.mockRejectedValue(
        new Error('Playlist error')
      );
      mockGetPlaylistsForUsername.mockResolvedValue(
        createMockPlaylistsResponse([], 0)
      );

      await expect(load(mockLoadEvent)).rejects.toThrow('Playlist error');
    });

    it('should handle invalid content filter error', async () => {
      const { isVideoFilter } = await import(
        '$lib/components/content/content-filter'
      );
      vi.mocked(isVideoFilter).mockReturnValue(false);

      await expect(load(mockLoadEvent)).rejects.toThrow(
        'Invalid content filter'
      );
    });

    it('should handle setHeaders errors gracefully', async () => {
      mockLoadEvent.setHeaders.mockImplementation(() => {
        throw new Error('Headers already set');
      });

      mockGetVideos.mockResolvedValue(createMockVideoResponse([]));
      mockGetPlaylistDataByYoutubeId.mockResolvedValue({
        playlist: null,
        videos: [],
        videosCount: 0,
        playlistDuration: { hours: 0, minutes: 0, seconds: 0 },
        error: null,
      });
      mockGetPlaylistsForUsername.mockResolvedValue({
        playlists: [],
        count: 0,
        error: null,
      });

      // Should not throw despite setHeaders error
      const result = await load(mockLoadEvent);
      expect(result).toBeDefined();
    });
  });

  describe('parallel execution', () => {
    it('should execute major operations in parallel', async () => {
      let getVideosTime: number | null = null;
      let getPlaylistsTime: number | null = null;

      mockGetVideos.mockImplementation(async () => {
        getVideosTime = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createMockVideoResponse(mockVideos);
      });

      mockGetPlaylistsForUsername.mockImplementation(async () => {
        getPlaylistsTime = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createMockPlaylistsResponse([], 0);
      });

      mockGetPlaylistDataByYoutubeId.mockResolvedValue(
        createMockPlaylistDataResponse(mockPlaylist, [mockVideos[0]], 1)
      );

      await load(mockLoadEvent);

      expect(getVideosTime).not.toBeNull();
      expect(getPlaylistsTime).not.toBeNull();

      if (getVideosTime && getPlaylistsTime) {
        const timeDifference = Math.abs(getVideosTime - getPlaylistsTime);
        // Should be called within 5ms of each other (concurrent)
        expect(timeDifference).toBeLessThan(5);
      }
    });
  });

  describe('result structure', () => {
    it('should return complete result structure', async () => {
      mockGetVideos.mockResolvedValue(createMockVideoResponse(mockVideos));
      mockGetPlaylistDataByYoutubeId.mockResolvedValue(
        createMockPlaylistDataResponse(mockPlaylist, [mockVideos[0]], 1)
      );
      mockGetPlaylistsForUsername.mockResolvedValue(
        createMockPlaylistsResponse(mockSourcePlaylists, 1)
      );

      const result = await load(mockLoadEvent);

      expect(result).toEqual({
        videos: mockVideos,
        highlightPlaylists: [
          {
            playlist: { ...mockPlaylist, name: 'Featured Playlist 2' },
            videos: [mockVideos[0]],
          },
          {
            playlist: { ...mockPlaylist, name: 'Featured Playlist 2' },
            videos: [mockVideos[0]],
          },
        ],
        playlistContentFilter: {
          sort: { key: 'playlistOrder', order: 'ascending' },
          type: 'playlist',
        },
        sourcePlaylists: [
          {
            ...mockSourcePlaylists[0],
          },
        ],
        source: 'giantbomb',
        contentFilter: {
          sort: { key: 'datePublished', order: 'descending' },
          type: 'video',
        },
      });
    });

    it('should handle empty results gracefully', async () => {
      mockGetVideos.mockResolvedValue(createMockVideoResponse([]));
      mockGetPlaylistDataByYoutubeId.mockResolvedValue({
        playlist: null,
        videos: [],
        videosCount: 0,
        playlistDuration: { hours: 0, minutes: 0, seconds: 0 },
        error: null,
      });
      mockGetPlaylistsForUsername.mockResolvedValue({
        playlists: [],
        count: 0,
        error: null,
      });

      const result = await load(mockLoadEvent);

      expect((result as any).videos).toEqual([]);
      expect((result as any).highlightPlaylists).toEqual([]);
      expect((result as any).sourcePlaylists).toEqual([]);
    });
  });
});
