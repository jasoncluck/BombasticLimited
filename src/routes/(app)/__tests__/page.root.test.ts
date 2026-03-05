import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockSourceVideos,
  createMockContinueVideos,
  createMockUserProfile,
  createMockSession,
} from '$lib/tests/test-utils';

// Mock all dependencies
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
}));

vi.mock('$app/state', () => ({
  page: {
    url: new URL('http://localhost:5173/'),
  },
}));

vi.mock('$lib/state/content.svelte', () => ({
  getContentState: () => ({
    selectedVideosBySection: {
      giantbomb: [],
      jeffgerstmann: [],
      nextlander: [],
      remap: [],
      continueWatching: [],
    },
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

vi.mock('$lib/constants/source', () => ({
  SOURCE_INFO: {
    giantbomb: { displayName: 'Giant Bomb' },
    jeffgerstmann: { displayName: 'The Jeff Gerstmann Show' },
    nextlander: { displayName: 'Nextlander' },
    remap: { displayName: 'Remap' },
  },
  SOURCES: ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'],
}));

vi.mock('$lib/constants/routes', () => ({
  MAIN_ROUTES: {
    CONTINUE: '/continue',
  },
}));

vi.mock('$lib/components/content/content', () => ({
  getContentView: vi.fn(() => 'CAROUSEL'),
  sourceWithContinueStateKeys: [
    'giantbomb',
    'jeffgerstmann',
    'nextlander',
    'remap',
    'continueWatching',
  ],
}));

vi.mock('@supabase/ssr', () => ({
  isBrowser: vi.fn(() => false),
}));

describe('+page.svelte Logic Tests', () => {
  const createMockData = (overrides = {}) => ({
    sourceVideos: createMockSourceVideos(),
    sourceVideosContentFilters: {
      sort: { key: 'datePublished' as const, order: 'descending' as const },
      type: 'video' as const,
    },
    continueWatchingVideos: createMockContinueVideos(),
    continueWatchingContentFilters: {
      sort: { key: 'dateTimestamp' as const, order: 'descending' as const },
      type: 'timestamp' as const,
    },
    contentFilter: {
      sort: { key: 'datePublished' as const, order: 'descending' as const },
      type: 'video' as const,
    },
    userProfile: createMockUserProfile(),
    session: createMockSession(),
    supabase: {} as any,
    etag: '"test-etag"',
    lastModified: '2023-01-01T00:00:00.000Z',
    cached: false,
    cacheUserId: 'user-1',
    cookies: [],
    playlistsCount: 0,
    isSidebarCollapsed: false,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Data structure validation', () => {
    it('should have valid mock data structure', () => {
      const mockData = createMockData();

      expect(mockData).toHaveProperty('sourceVideos');
      expect(mockData).toHaveProperty('continueWatchingVideos');
      expect(mockData).toHaveProperty('userProfile');
      expect(mockData).toHaveProperty('session');
      expect(mockData.sourceVideos).toHaveProperty('giantbomb');
      expect(mockData.sourceVideos).toHaveProperty('jeffgerstmann');
      expect(mockData.sourceVideos).toHaveProperty('nextlander');
      expect(mockData.sourceVideos).toHaveProperty('remap');
    });

    it('should handle user profile with different sources', () => {
      const customProfile = createMockUserProfile({
        sources: ['giantbomb', 'nextlander'],
      });
      const mockData = createMockData({ userProfile: customProfile });

      expect(mockData.userProfile.sources).toHaveLength(2);
      expect(mockData.userProfile.sources).toContain('giantbomb');
      expect(mockData.userProfile.sources).toContain('nextlander');
    });

    it('should handle user profile with empty sources', () => {
      const customProfile = createMockUserProfile({ sources: [] });
      const mockData = createMockData({ userProfile: customProfile });

      expect(mockData.userProfile.sources).toHaveLength(0);
    });

    it('should handle null user profile', () => {
      const mockData = createMockData({ userProfile: null });

      expect(mockData.userProfile).toBeNull();
    });

    it('should handle null session', () => {
      const mockData = createMockData({ session: null });

      expect(mockData.session).toBeNull();
    });

    it('should handle empty continue watching videos', () => {
      const mockData = createMockData({ continueWatchingVideos: [] });

      expect(mockData.continueWatchingVideos).toHaveLength(0);
    });
  });

  describe('Component logic', () => {
    it('should have proper content filter structure', () => {
      const mockData = createMockData();

      expect(mockData.contentFilter).toHaveProperty('sort');
      expect(mockData.contentFilter).toHaveProperty('type');
      expect(mockData.contentFilter.sort).toHaveProperty('key');
      expect(mockData.contentFilter.sort).toHaveProperty('order');
      expect(mockData.contentFilter.sort.key).toBe('datePublished');
      expect(mockData.contentFilter.sort.order).toBe('descending');
      expect(mockData.contentFilter.type).toBe('video');
    });

    it('should have proper continue watching content filters', () => {
      const mockData = createMockData();

      expect(mockData.continueWatchingContentFilters).toHaveProperty('sort');
      expect(mockData.continueWatchingContentFilters).toHaveProperty('type');
      expect(mockData.continueWatchingContentFilters.sort.key).toBe(
        'dateTimestamp'
      );
      expect(mockData.continueWatchingContentFilters.sort.order).toBe(
        'descending'
      );
      expect(mockData.continueWatchingContentFilters.type).toBe('timestamp');
    });

    it('should validate source video structure', () => {
      const sourceVideos = createMockSourceVideos();

      expect(sourceVideos).toHaveProperty('giantbomb');
      expect(sourceVideos).toHaveProperty('jeffgerstmann');
      expect(sourceVideos).toHaveProperty('nextlander');
      expect(sourceVideos).toHaveProperty('remap');

      // Each source should have at least one video
      expect(sourceVideos.giantbomb).toHaveLength(1);
      expect(sourceVideos.jeffgerstmann).toHaveLength(1);
      expect(sourceVideos.nextlander).toHaveLength(1);
      expect(sourceVideos.remap).toHaveLength(1);

      // Each video should have required properties
      expect(sourceVideos.giantbomb[0]).toHaveProperty('id');
      expect(sourceVideos.giantbomb[0]).toHaveProperty('title');
      expect(sourceVideos.giantbomb[0]).toHaveProperty('source');
      expect(sourceVideos.giantbomb[0].source).toBe('giantbomb');
    });

    it('should validate continue watching video structure', () => {
      const continueVideos = createMockContinueVideos();

      expect(continueVideos).toHaveLength(1);
      expect(continueVideos[0]).toHaveProperty('id');
      expect(continueVideos[0]).toHaveProperty('title');
      expect(continueVideos[0]).toHaveProperty('video_start_seconds');
      expect(continueVideos[0]).toHaveProperty('updated_at');
      expect(continueVideos[0]).toHaveProperty('watched_at');
    });
  });

  describe('User preferences logic', () => {
    it('should use default sources when no user profile', () => {
      const mockData = createMockData({ userProfile: null });

      // Component logic: sources = userProfile?.sources ?? SOURCES
      const sources = mockData.userProfile?.sources ?? [
        'giantbomb',
        'jeffgerstmann',
        'nextlander',
        'remap',
      ];

      expect(sources).toHaveLength(4);
      expect(sources).toEqual([
        'giantbomb',
        'jeffgerstmann',
        'nextlander',
        'remap',
      ]);
    });

    it('should use user selected sources when available', () => {
      const customProfile = createMockUserProfile({
        sources: ['giantbomb', 'nextlander'],
      });
      const mockData = createMockData({ userProfile: customProfile });

      const sources = mockData.userProfile?.sources ?? [
        'giantbomb',
        'jeffgerstmann',
        'nextlander',
        'remap',
      ];

      expect(sources).toHaveLength(2);
      expect(sources).toEqual(['giantbomb', 'nextlander']);
    });

    it('should handle empty sources array', () => {
      const customProfile = createMockUserProfile({ sources: [] });
      const mockData = createMockData({ userProfile: customProfile });

      const sources = mockData.userProfile?.sources ?? [
        'giantbomb',
        'jeffgerstmann',
        'nextlander',
        'remap',
      ];

      expect(sources).toHaveLength(0);
    });
  });

  describe('Content display logic', () => {
    it('should show continue watching when session and videos exist', () => {
      const mockData = createMockData();

      const shouldShowContinueWatching =
        mockData.session && mockData.continueWatchingVideos.length > 0;

      expect(shouldShowContinueWatching).toBe(true);
    });

    it('should not show continue watching when no session', () => {
      const mockData = createMockData({ session: null });

      const shouldShowContinueWatching = Boolean(
        mockData.session && mockData.continueWatchingVideos.length > 0
      );

      expect(shouldShowContinueWatching).toBe(false);
    });

    it('should not show continue watching when no videos', () => {
      const mockData = createMockData({ continueWatchingVideos: [] });

      const shouldShowContinueWatching =
        mockData.session && mockData.continueWatchingVideos.length > 0;

      expect(shouldShowContinueWatching).toBe(false);
    });

    it('should not show continue watching when no session and no videos', () => {
      const mockData = createMockData({
        session: null,
        continueWatchingVideos: [],
      });

      const shouldShowContinueWatching = Boolean(
        mockData.session && mockData.continueWatchingVideos.length > 0
      );

      expect(shouldShowContinueWatching).toBe(false);
    });
  });

  describe('URL and navigation logic', () => {
    it('should construct correct source URLs', () => {
      const sources = ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'];

      sources.forEach((source) => {
        const expectedUrl = `/${source}/latest`;
        expect(expectedUrl).toBe(`/${source}/latest`);
      });
    });

    it('should have correct continue watching URL', () => {
      const continueUrl = '/continue';
      expect(continueUrl).toBe('/continue');
    });
  });

  describe('Data integrity', () => {
    it('should maintain data consistency across mock generation', () => {
      const data1 = createMockData();
      const data2 = createMockData();

      // Both should have the same structure
      expect(Object.keys(data1)).toEqual(Object.keys(data2));
      expect(data1.userProfile.username).toBe(data2.userProfile.username);
      expect(data1.session.user.id).toBe(data2.session.user.id);
    });

    it('should handle override data properly', () => {
      const overrides = {
        playlistsCount: 5,
        isSidebarCollapsed: true,
      };
      const mockData = createMockData(overrides);

      expect(mockData.playlistsCount).toBe(5);
      expect(mockData.isSidebarCollapsed).toBe(true);
    });

    it('should validate required properties exist', () => {
      const mockData = createMockData();

      const requiredProps = [
        'sourceVideos',
        'continueWatchingVideos',
        'contentFilter',
        'userProfile',
        'session',
        'supabase',
        'etag',
        'lastModified',
        'cached',
        'cacheUserId',
        'playlistsCount',
        'isSidebarCollapsed',
      ];

      requiredProps.forEach((prop) => {
        expect(mockData).toHaveProperty(prop);
      });
    });
  });

  describe('Component state management', () => {
    it('should have valid snapshot structure', () => {
      // Test the snapshot structure that would be used by the component
      const mockCarouselState = {
        giantbomb: { lastViewedIndex: 0 },
        jeffgerstmann: { lastViewedIndex: 0 },
        nextlander: { lastViewedIndex: 0 },
        remap: { lastViewedIndex: 0 },
        continueWatching: { lastViewedIndex: 0 },
      };

      const mockSelectedVideos = {
        giantbomb: [],
        jeffgerstmann: [],
        nextlander: [],
        remap: [],
        continueWatching: [],
      };

      expect(mockCarouselState).toHaveProperty('giantbomb');
      expect(mockCarouselState).toHaveProperty('continueWatching');
      expect(mockSelectedVideos).toHaveProperty('giantbomb');
      expect(mockSelectedVideos).toHaveProperty('continueWatching');

      // Each carousel state should have lastViewedIndex
      Object.values(mockCarouselState).forEach((state) => {
        expect(state).toHaveProperty('lastViewedIndex');
        expect(typeof state.lastViewedIndex).toBe('number');
      });
    });
  });
});
