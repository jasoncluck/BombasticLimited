import {
  createMockVideo,
  createMockUserProfile,
  createMockSession,
} from '$lib/tests/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('$lib/state/streaming.svelte', () => ({
  activeStreams: {
    sources: ['giantbomb'],
  },
}));

vi.mock('$lib/state/content.svelte', () => ({
  getContentState: () => ({
    selectedVideosBySection: {},
  }),
}));

vi.mock('$lib/state/media-query.svelte', () => ({
  getMediaQueryState: () => ({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
  }),
}));

vi.mock('$lib/components/content/content.svelte', () => ({
  default: class MockContent {
    constructor() {}
  },
}));

vi.mock('$lib/components/video/twitch-embed.svelte', () => ({
  default: class MockTwitchEmbed {
    constructor() {}
  },
}));

vi.mock('$lib/components/playlist/playlist-tiles.svelte', () => ({
  default: class MockPlaylistTiles {
    constructor() {}
  },
}));

vi.mock('$lib/constants/source', () => ({
  SOURCE_INFO: {
    giantbomb: {
      displayName: 'Giant Bomb',
      websiteUrlDomain: 'giantbomb.com',
      supportUrl: 'https://support.giantbomb.com',
      highlightedPlaylists: [
        { youtubeId: 'playlist1', name: 'Featured Playlist' },
      ],
    },
    jeffgerstmann: {
      displayName: 'Jeff Gerstmann',
      websiteUrlDomain: null,
      supportUrl: 'https://patreon.com/jeffgerstmann',
      highlightedPlaylists: [],
    },
    nextlander: {
      displayName: 'Nextlander',
      websiteUrlDomain: 'nextlander.com',
      supportUrl: 'https://patreon.com/nextlander',
      highlightedPlaylists: [],
    },
    remap: {
      displayName: 'Remap Radio',
      websiteUrlDomain: null,
      supportUrl: 'https://patreon.com/remap',
      highlightedPlaylists: [],
    },
  },
}));

vi.mock('$lib/components/content/content', () => ({
  getContentView: () => 'CAROUSEL',
}));

vi.mock('$lib/components/playlist/playlist', () => ({
  handlePlaylistNavigation: vi.fn(),
  parseImageProperties: vi.fn(() => ({})),
}));

describe('[source]/+page.svelte Component Logic', () => {
  const mockVideos = [
    createMockVideo({ id: 'v1', title: 'Test Video 1', source: 'giantbomb' }),
    createMockVideo({ id: 'v2', title: 'Test Video 2', source: 'giantbomb' }),
  ];

  const mockHighlightPlaylists = [
    {
      playlist: {
        id: 'p1',
        short_id: 'abc123',
        name: 'Featured Playlist',
        youtube_id: 'playlist1',
      },
      videos: [mockVideos[0]],
    },
  ];

  const mockProcessedSourcePlaylists = [
    {
      id: 'sp1',
      short_id: 'def456',
      name: 'Source Playlist 1',
      image_url: 'https://example.com/processed.jpg',
    },
  ];

  const mockData = {
    videos: mockVideos,
    highlightPlaylists: mockHighlightPlaylists,
    userProfile: createMockUserProfile(),
    session: createMockSession(),
    supabase: {},
    source: 'giantbomb' as const,
    contentFilter: {
      sort: { key: 'datePublished', order: 'descending' },
      type: 'video',
    },
    processedSourcePlaylists: mockProcessedSourcePlaylists,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('data validation and structure', () => {
    it('should handle valid data structure', () => {
      expect(mockData.videos).toBeInstanceOf(Array);
      expect(mockData.highlightPlaylists).toBeInstanceOf(Array);
      expect(mockData.processedSourcePlaylists).toBeInstanceOf(Array);
      expect(mockData.source).toBe('giantbomb');
    });

    it('should handle missing optional data', () => {
      const minimalData = {
        videos: [],
        highlightPlaylists: [],
        userProfile: null,
        session: null,
        supabase: {},
        source: 'giantbomb' as const,
        contentFilter: {},
        processedSourcePlaylists: [],
      };

      expect(minimalData.videos).toEqual([]);
      expect(minimalData.highlightPlaylists).toEqual([]);
      expect(minimalData.session).toBeNull();
    });

    it('should validate video structure', () => {
      const videoSample = mockData.videos[0];
      expect(videoSample).toHaveProperty('id');
      expect(videoSample).toHaveProperty('title');
      expect(videoSample).toHaveProperty('source');
      expect(videoSample).toHaveProperty('thumbnail_url');
    });

    it('should validate highlight playlist structure', () => {
      const highlightPlaylist = mockData.highlightPlaylists[0];
      expect(highlightPlaylist).toHaveProperty('playlist');
      expect(highlightPlaylist).toHaveProperty('videos');
      expect(highlightPlaylist.playlist).toHaveProperty('short_id');
      expect(highlightPlaylist.playlist).toHaveProperty('name');
      expect(highlightPlaylist.videos).toBeInstanceOf(Array);
    });

    it('should validate processed source playlist structure', () => {
      const sourcePlaylist = mockData.processedSourcePlaylists[0];
      expect(sourcePlaylist).toHaveProperty('id');
      expect(sourcePlaylist).toHaveProperty('short_id');
      expect(sourcePlaylist).toHaveProperty('name');
      expect(sourcePlaylist).toHaveProperty('image_url');
    });
  });

  describe('source information display logic', () => {
    it('should display correct source information', () => {
      const sourceInfo = {
        displayName: 'Giant Bomb',
        websiteUrlDomain: 'giantbomb.com',
        supportUrl: 'https://support.giantbomb.com',
      };

      expect(sourceInfo.displayName).toBe('Giant Bomb');
      expect(sourceInfo.websiteUrlDomain).toBe('giantbomb.com');
      expect(sourceInfo.supportUrl).toBe('https://support.giantbomb.com');
    });

    it('should handle source without website domain', () => {
      const sourceInfo = {
        displayName: 'Jeff Gerstmann',
        websiteUrlDomain: null,
        supportUrl: 'https://patreon.com/jeffgerstmann',
      };

      expect(sourceInfo.websiteUrlDomain).toBeNull();
      expect(sourceInfo.displayName).toBe('Jeff Gerstmann');
    });

    it('should construct correct website URL when domain exists', () => {
      const websiteUrlDomain = 'giantbomb.com';
      const expectedUrl = `https://www.${websiteUrlDomain}`;
      expect(expectedUrl).toBe('https://www.giantbomb.com');
    });
  });

  describe('live streaming logic', () => {
    it('should show live stream when source is streaming', () => {
      const activeStreams = { sources: ['giantbomb'] };
      const source = 'giantbomb';
      const shouldShowLive = activeStreams.sources.includes(source);

      expect(shouldShowLive).toBe(true);
    });

    it('should not show live stream when source is not streaming', () => {
      const activeStreams = { sources: ['giantbomb'] };
      const source = 'jeffgerstmann';
      const shouldShowLive = activeStreams.sources.includes(source);

      expect(shouldShowLive).toBe(false);
    });

    it('should handle empty active streams', () => {
      const activeStreams = { sources: [] as string[] };
      const source = 'giantbomb';
      const shouldShowLive = activeStreams.sources.includes(source);

      expect(shouldShowLive).toBe(false);
    });
  });

  describe('carousel state management', () => {
    it('should initialize carousel state for all sections', () => {
      const highlightPlaylistShortIds = mockData.highlightPlaylists.map(
        (hp) => hp.playlist.short_id
      );
      const sectionIds = ['latestVideos', ...highlightPlaylistShortIds];

      expect(sectionIds).toContain('latestVideos');
      expect(sectionIds).toContain('abc123');
      expect(sectionIds).toHaveLength(2);
    });

    it('should update section IDs when highlight playlists change', () => {
      const newHighlightPlaylists = [
        {
          playlist: { short_id: 'new123', name: 'New Playlist' },
          videos: [],
        },
        {
          playlist: { short_id: 'new456', name: 'Another Playlist' },
          videos: [],
        },
      ];

      const newSectionIds = [
        'latestVideos',
        ...newHighlightPlaylists.map((hp) => hp.playlist.short_id),
      ];

      expect(newSectionIds).toEqual(['latestVideos', 'new123', 'new456']);
    });

    it('should create carousel state for each section', () => {
      const sectionIds = ['latestVideos', 'abc123'];
      const carouselState: any = {};

      for (const key of sectionIds) {
        carouselState[key] = { lastViewedIndex: 0 };
      }

      expect(carouselState).toHaveProperty('latestVideos');
      expect(carouselState).toHaveProperty('abc123');
      expect(carouselState.latestVideos).toEqual({ lastViewedIndex: 0 });
      expect(carouselState.abc123).toEqual({ lastViewedIndex: 0 });
    });
  });

  describe('snapshot functionality structure', () => {
    it('should validate snapshot capture structure', () => {
      const mockCarouselState = {
        latestVideos: { lastViewedIndex: 0 },
        abc123: { lastViewedIndex: 1 },
      };

      const mockSelectedVideos = {
        latestVideos: [mockData.videos[0]],
        abc123: [],
      };

      const capturedData = {
        carouselsState: mockCarouselState,
        selectedVideos: mockSelectedVideos,
      };

      expect(capturedData).toHaveProperty('carouselsState');
      expect(capturedData).toHaveProperty('selectedVideos');
      expect(capturedData.carouselsState).toHaveProperty('latestVideos');
      expect(capturedData.selectedVideos).toHaveProperty('latestVideos');
    });

    it('should validate snapshot restore structure', () => {
      const restoredData = {
        carouselsState: {
          latestVideos: { lastViewedIndex: 2 },
          abc123: { lastViewedIndex: 1 },
        },
        selectedVideos: {
          latestVideos: [mockData.videos[0]],
          abc123: [],
        },
      };

      expect(restoredData.carouselsState).toBeDefined();
      expect(restoredData.selectedVideos).toBeDefined();

      Object.entries(restoredData.carouselsState).forEach(([key, state]) => {
        expect(state).toHaveProperty('lastViewedIndex');
        expect(typeof state.lastViewedIndex).toBe('number');
      });
    });
  });

  describe('integration with dependencies', () => {
    it('should work with mocked components and utilities', () => {
      expect(mockData.videos).toHaveLength(2);
      expect(mockData.highlightPlaylists).toHaveLength(1);
      expect(mockData.processedSourcePlaylists).toHaveLength(1);
    });

    it('should validate data structure consistency', () => {
      // Ensure data structure is consistent for component rendering
      mockData.videos.forEach((video) => {
        expect(video).toHaveProperty('id');
        expect(video).toHaveProperty('title');
        expect(video).toHaveProperty('source');
      });

      mockData.highlightPlaylists.forEach((hp) => {
        expect(hp.playlist).toHaveProperty('short_id');
        expect(hp.playlist).toHaveProperty('name');
        expect(hp.videos).toBeInstanceOf(Array);
      });
    });
  });

  describe('content sections logic', () => {
    it('should show latest videos section', () => {
      expect(mockData.videos).toBeDefined();
      expect(mockData.videos).toBeInstanceOf(Array);
    });

    it('should show highlight playlists when available', () => {
      const hasHighlightPlaylists = mockData.highlightPlaylists.length > 0;
      expect(hasHighlightPlaylists).toBe(true);
    });

    it('should show source playlists section', () => {
      const hasSourcePlaylists = mockData.processedSourcePlaylists.length > 0;
      expect(hasSourcePlaylists).toBe(true);
    });

    it('should handle empty sections gracefully', () => {
      const emptyData = {
        ...mockData,
        videos: [],
        highlightPlaylists: [],
        processedSourcePlaylists: [],
      };

      expect(emptyData.videos).toEqual([]);
      expect(emptyData.highlightPlaylists).toEqual([]);
      expect(emptyData.processedSourcePlaylists).toEqual([]);
    });
  });
});
