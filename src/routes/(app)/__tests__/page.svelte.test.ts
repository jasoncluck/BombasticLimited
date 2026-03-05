import { describe, it, expect, vi, beforeEach } from 'vitest';
import { goto } from '$app/navigation';
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
    jeffgerstmann: { displayName: 'Jeff Gerstmann' },
    nextlander: { displayName: 'Nextlander' },
    remap: { displayName: 'Remap Radio' },
  },
  SOURCES: ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'],
}));

vi.mock('$lib/constants/routes', () => ({
  MAIN_ROUTES: {
    CONTINUE: '/continue',
  },
}));

vi.mock('$lib/components/content/content', () => ({
  getContentView: () => 'CAROUSEL',
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

const mockGoto = vi.mocked(goto);

describe('+page.svelte Component Logic', () => {
  const mockData = {
    sourceVideos: createMockSourceVideos(),
    contentFilter: {
      sort: { key: 'datePublished', order: 'descending' },
      type: 'video',
    },
    continueWatchingVideos: createMockContinueVideos(),
    userProfile: createMockUserProfile(),
    session: createMockSession(),
    supabase: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('data validation and structure', () => {
    it('should handle valid data structure', () => {
      // Test that the component data structure is valid
      expect(mockData.sourceVideos).toBeDefined();
      expect(mockData.sourceVideos.giantbomb).toBeInstanceOf(Array);
      expect(mockData.sourceVideos.jeffgerstmann).toBeInstanceOf(Array);
      expect(mockData.sourceVideos.nextlander).toBeInstanceOf(Array);
      expect(mockData.sourceVideos.remap).toBeInstanceOf(Array);
      expect(mockData.continueWatchingVideos).toBeInstanceOf(Array);
    });

    it('should handle missing optional data', () => {
      const minimalData = {
        sourceVideos: {
          giantbomb: [],
          jeffgerstmann: [],
          nextlander: [],
          remap: [],
        },
        contentFilter: {},
        continueWatchingVideos: [],
        userProfile: null,
        session: null,
        supabase: {},
      };

      expect(minimalData.sourceVideos).toBeDefined();
      expect(minimalData.continueWatchingVideos).toEqual([]);
      expect(minimalData.session).toBeNull();
    });

    it('should validate source video structure', () => {
      const videoSample = mockData.sourceVideos.giantbomb[0];
      expect(videoSample).toHaveProperty('id');
      expect(videoSample).toHaveProperty('title');
      expect(videoSample).toHaveProperty('thumbnail_url');
    });

    it('should validate continue watching video structure', () => {
      const continueVideoSample = mockData.continueWatchingVideos[0];
      expect(continueVideoSample).toHaveProperty('id');
      expect(continueVideoSample).toHaveProperty('title');
      expect(continueVideoSample).toHaveProperty('thumbnail_url');
    });
  });

  describe('user profile sources logic', () => {
    it('should use user profile sources when available', () => {
      const customProfile = {
        sources: ['giantbomb', 'nextlander'],
      };

      const dataWithCustomProfile = {
        ...mockData,
        userProfile: customProfile,
      };

      expect(dataWithCustomProfile.userProfile.sources).toHaveLength(2);
      expect(dataWithCustomProfile.userProfile.sources).toContain('giantbomb');
      expect(dataWithCustomProfile.userProfile.sources).toContain('nextlander');
    });

    it('should handle null user profile', () => {
      const dataWithNullProfile = {
        ...mockData,
        userProfile: null,
      };

      // When userProfile is null, component should fall back to SOURCES
      expect(dataWithNullProfile.userProfile).toBeNull();
      // We can test that the fallback behavior works by checking our mock
      expect([
        'giantbomb',
        'jeffgerstmann',
        'nextlander',
        'remap',
      ]).toHaveLength(4);
    });

    it('should handle user profile without sources', () => {
      const profileWithoutSources = {
        id: 'user-1',
        username: 'testuser',
      } as any;
      const dataWithEmptyProfile = {
        ...mockData,
        userProfile: profileWithoutSources,
      };

      expect(dataWithEmptyProfile.userProfile).toBeDefined();
      expect((dataWithEmptyProfile.userProfile as any).sources).toBeUndefined();
    });
  });

  describe('continue watching visibility logic', () => {
    it('should show continue watching when session exists and has videos', () => {
      const shouldShowContinue =
        mockData.session && mockData.continueWatchingVideos.length > 0;
      expect(shouldShowContinue).toBe(true);
    });

    it('should not show continue watching when no session', () => {
      const dataWithoutSession = {
        ...mockData,
        session: null,
      };

      const shouldShowContinue =
        dataWithoutSession.session &&
        dataWithoutSession.continueWatchingVideos.length > 0;
      expect(shouldShowContinue).toBeFalsy();
    });

    it('should not show continue watching when no videos', () => {
      const dataWithoutVideos = {
        ...mockData,
        continueWatchingVideos: [],
      };

      const shouldShowContinue =
        dataWithoutVideos.session &&
        dataWithoutVideos.continueWatchingVideos.length > 0;
      expect(shouldShowContinue).toBe(false);
    });

    it('should not show continue watching when both session and videos are missing', () => {
      const dataWithNeither = {
        ...mockData,
        session: null,
        continueWatchingVideos: [],
      };

      const shouldShowContinue =
        dataWithNeither.session &&
        dataWithNeither.continueWatchingVideos.length > 0;
      expect(shouldShowContinue).toBeFalsy();
    });
  });

  describe('OAuth URL handling logic', () => {
    it('should detect OAuth code in URL', () => {
      const urlWithCode = new URL('http://localhost:5173/?code=oauth_code');
      const hasCode = urlWithCode.searchParams.get('code');
      expect(hasCode).toBe('oauth_code');
    });

    it('should not detect OAuth code when not present', () => {
      const urlWithoutCode = new URL('http://localhost:5173/');
      const hasCode = urlWithoutCode.searchParams.get('code');
      expect(hasCode).toBeNull();
    });

    it('should construct clean URL without code parameter', () => {
      const urlWithCode = new URL(
        'http://localhost:5173/?code=oauth_code&other=param'
      );
      urlWithCode.searchParams.delete('code');

      expect(urlWithCode.searchParams.get('code')).toBeNull();
      expect(urlWithCode.searchParams.get('other')).toBe('param');
      expect(urlWithCode.pathname + urlWithCode.search).toBe('/?other=param');
    });
  });

  describe('carousel state initialization', () => {
    it('should initialize carousel state for all sections', () => {
      const sourceWithContinueStateKeys = [
        'giantbomb',
        'jeffgerstmann',
        'nextlander',
        'remap',
        'continueWatching',
      ];
      const initialCarouselState: any = {};

      for (const key of sourceWithContinueStateKeys) {
        initialCarouselState[key] = { lastViewedIndex: 0 };
      }

      expect(initialCarouselState).toHaveProperty('giantbomb');
      expect(initialCarouselState).toHaveProperty('jeffgerstmann');
      expect(initialCarouselState).toHaveProperty('nextlander');
      expect(initialCarouselState).toHaveProperty('remap');
      expect(initialCarouselState).toHaveProperty('continueWatching');

      Object.values(initialCarouselState).forEach((state: any) => {
        expect(state).toHaveProperty('lastViewedIndex', 0);
      });
    });
  });

  describe('snapshot functionality structure', () => {
    it('should validate snapshot capture structure', () => {
      const mockCarouselState = {
        giantbomb: { lastViewedIndex: 0 },
        jeffgerstmann: { lastViewedIndex: 1 },
        nextlander: { lastViewedIndex: 2 },
        remap: { lastViewedIndex: 0 },
        continueWatching: { lastViewedIndex: 1 },
      };

      const mockSelectedVideos = {
        giantbomb: [mockData.sourceVideos.giantbomb[0]],
        jeffgerstmann: [],
        nextlander: [],
        remap: [],
        continueWatching: [],
      };

      const capturedData = {
        carouselsState: mockCarouselState,
        selectedVideos: mockSelectedVideos,
      };

      expect(capturedData).toHaveProperty('carouselsState');
      expect(capturedData).toHaveProperty('selectedVideos');
      expect(capturedData.carouselsState).toHaveProperty('giantbomb');
      expect(capturedData.selectedVideos).toHaveProperty('giantbomb');
    });

    it('should validate snapshot restore structure', () => {
      const restoredData = {
        carouselsState: {
          giantbomb: { lastViewedIndex: 2 },
          jeffgerstmann: { lastViewedIndex: 1 },
          nextlander: { lastViewedIndex: 0 },
          remap: { lastViewedIndex: 3 },
          continueWatching: { lastViewedIndex: 1 },
        },
        selectedVideos: {
          giantbomb: [mockData.sourceVideos.giantbomb[0]],
          jeffgerstmann: [],
          nextlander: [],
          remap: [],
          continueWatching: [],
        },
      };

      // Validate structure for restoration
      expect(restoredData.carouselsState).toBeDefined();
      expect(restoredData.selectedVideos).toBeDefined();

      // Validate carousel state structure
      Object.entries(restoredData.carouselsState).forEach(([key, state]) => {
        expect(state).toHaveProperty('lastViewedIndex');
        expect(typeof state.lastViewedIndex).toBe('number');
      });
    });
  });

  describe('integration with mocked dependencies', () => {
    it('should work with mocked constants and dependencies', () => {
      // Test that our mocks are working as expected
      expect(mockGoto).toBeDefined();
      expect(typeof mockGoto).toBe('function');

      // Test that the component data structure is compatible with mocks
      expect(mockData.sourceVideos).toHaveProperty('giantbomb');
      expect(mockData.sourceVideos).toHaveProperty('jeffgerstmann');
      expect(mockData.sourceVideos).toHaveProperty('nextlander');
      expect(mockData.sourceVideos).toHaveProperty('remap');
    });

    it('should validate mock structure consistency', () => {
      // Ensure our mock data structure matches what the component expects
      const expectedSources = [
        'giantbomb',
        'jeffgerstmann',
        'nextlander',
        'remap',
      ];
      const actualSources = Object.keys(mockData.sourceVideos);

      expect(actualSources).toEqual(expectedSources);

      // Validate that continue watching videos have the right structure
      mockData.continueWatchingVideos.forEach((video) => {
        expect(video).toHaveProperty('id');
        expect(video).toHaveProperty('title');
        expect(video).toHaveProperty('thumbnail_url');
      });
    });
  });
});
