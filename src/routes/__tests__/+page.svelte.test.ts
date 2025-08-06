import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import Page from '../+page.svelte';
import {
  createMockSession,
  createMockUserProfile,
  createMockSourceVideos,
  createMockContinueVideos,
} from '../../tests/test-utils.js';

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
    $$render() {
      return '<div data-testid="mock-content">Mock Content Component</div>';
    }
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

const mockGoto = vi.mocked(goto);

describe('+page.svelte Enhanced Tests', () => {
  const createMockData = (overrides = {}) => ({
    sourceVideos: createMockSourceVideos(),
    contentFilter: {
      sort: { key: 'datePublished', order: 'descending' },
      type: 'video',
    },
    continueWatchingVideos: createMockContinueVideos(),
    userProfile: createMockUserProfile(),
    session: createMockSession(),
    supabase: {},
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component rendering', () => {
    it('should render main structure correctly', () => {
      const mockData = createMockData();
      
      render(Page, { props: { data: mockData } });
      
      // Should render "Latest Videos" heading
      expect(screen.getByText('Latest Videos')).toBeInTheDocument();
      
      // Should render continue watching section for authenticated users
      expect(screen.getByTestId('continue-watching-section')).toBeInTheDocument();
      expect(screen.getByTestId('continue-watching-link')).toBeInTheDocument();
    });

    it('should not render continue watching when no session', () => {
      const mockData = createMockData({ session: null });
      
      render(Page, { props: { data: mockData } });
      
      // Should not render continue watching section
      expect(screen.queryByTestId('continue-watching-section')).not.toBeInTheDocument();
      
      // Should still render main content
      expect(screen.getByText('Latest Videos')).toBeInTheDocument();
    });

    it('should not render continue watching when no videos', () => {
      const mockData = createMockData({ continueWatchingVideos: [] });
      
      render(Page, { props: { data: mockData } });
      
      // Should not render continue watching section
      expect(screen.queryByTestId('continue-watching-section')).not.toBeInTheDocument();
    });

    it('should render source sections', () => {
      const mockData = createMockData();
      
      render(Page, { props: { data: mockData } });
      
      // Should render sections for each source
      const sourceSections = screen.getAllByTestId('source-section');
      expect(sourceSections).toHaveLength(4); // Default sources: giantbomb, jeffgerstmann, nextlander, remap
      
      // Should render source links
      expect(screen.getByTestId('source-link', { name: /giantbomb/i })).toBeInTheDocument();
      expect(screen.getByTestId('source-link', { name: /jeffgerstmann/i })).toBeInTheDocument();
      expect(screen.getByTestId('source-link', { name: /nextlander/i })).toBeInTheDocument();
      expect(screen.getByTestId('source-link', { name: /remap/i })).toBeInTheDocument();
    });
  });

  describe('User profile source filtering', () => {
    it('should render only user selected sources', () => {
      const customProfile = createMockUserProfile({
        sources: ['giantbomb', 'nextlander'],
      });
      const mockData = createMockData({ userProfile: customProfile });
      
      render(Page, { props: { data: mockData } });
      
      // Should only render sections for selected sources
      const sourceSections = screen.getAllByTestId('source-section');
      expect(sourceSections).toHaveLength(2);
      
      expect(screen.getByText('Giant Bomb')).toBeInTheDocument();
      expect(screen.getByText('Nextlander')).toBeInTheDocument();
      expect(screen.queryByText('Jeff Gerstmann')).not.toBeInTheDocument();
      expect(screen.queryByText('Remap Radio')).not.toBeInTheDocument();
    });

    it('should handle user profile with empty sources array', () => {
      const customProfile = createMockUserProfile({ sources: [] });
      const mockData = createMockData({ userProfile: customProfile });
      
      render(Page, { props: { data: mockData } });
      
      // Should not render any source sections
      expect(screen.queryByTestId('source-section')).not.toBeInTheDocument();
    });

    it('should fall back to default sources when no user profile', () => {
      const mockData = createMockData({ userProfile: null });
      
      render(Page, { props: { data: mockData } });
      
      // Should render all default sources
      const sourceSections = screen.getAllByTestId('source-section');
      expect(sourceSections).toHaveLength(4);
    });
  });

  describe('OAuth URL handling', () => {
    beforeEach(() => {
      // Reset page mock
      page.url = new URL('http://localhost:5173/');
    });

    it('should handle OAuth code in URL', () => {
      const { isBrowser } = require('@supabase/ssr');
      isBrowser.mockReturnValue(true);
      
      // Set URL with OAuth code
      page.url = new URL('http://localhost:5173/?code=oauth_code_123');
      
      const mockData = createMockData();
      render(Page, { props: { data: mockData } });
      
      // Should call goto to remove the code parameter
      expect(mockGoto).toHaveBeenCalledWith('/', { replaceState: true });
    });

    it('should preserve other query parameters when removing code', () => {
      const { isBrowser } = require('@supabase/ssr');
      isBrowser.mockReturnValue(true);
      
      page.url = new URL('http://localhost:5173/?code=oauth_code&other=value&filter=test');
      
      const mockData = createMockData();
      render(Page, { props: { data: mockData } });
      
      // Should preserve other parameters
      expect(mockGoto).toHaveBeenCalledWith('/?other=value&filter=test', { replaceState: true });
    });

    it('should not process OAuth when not in browser', () => {
      const { isBrowser } = require('@supabase/ssr');
      isBrowser.mockReturnValue(false);
      
      page.url = new URL('http://localhost:5173/?code=oauth_code');
      
      const mockData = createMockData();
      render(Page, { props: { data: mockData } });
      
      // Should not call goto
      expect(mockGoto).not.toHaveBeenCalled();
    });

    it('should not process when no OAuth code present', () => {
      const { isBrowser } = require('@supabase/ssr');
      isBrowser.mockReturnValue(true);
      
      page.url = new URL('http://localhost:5173/?other=value');
      
      const mockData = createMockData();
      render(Page, { props: { data: mockData } });
      
      // Should not call goto
      expect(mockGoto).not.toHaveBeenCalled();
    });
  });

  describe('Content links and navigation', () => {
    it('should have correct continue watching link', () => {
      const mockData = createMockData();
      
      render(Page, { props: { data: mockData } });
      
      const continueLink = screen.getByTestId('continue-watching-link');
      expect(continueLink).toHaveAttribute('href', '/continue');
      expect(continueLink).toHaveTextContent('Continue Watching');
    });

    it('should have correct source links', () => {
      const mockData = createMockData();
      
      render(Page, { props: { data: mockData } });
      
      const gbLink = screen.getByTestId('source-link', { name: /giantbomb/i });
      expect(gbLink).toHaveAttribute('href', '/giantbomb/latest');
      
      const jgLink = screen.getByTestId('source-link', { name: /jeffgerstmann/i });
      expect(jgLink).toHaveAttribute('href', '/jeffgerstmann/latest');
      
      const nlLink = screen.getByTestId('source-link', { name: /nextlander/i });
      expect(nlLink).toHaveAttribute('href', '/nextlander/latest');
      
      const rmLink = screen.getByTestId('source-link', { name: /remap/i });
      expect(rmLink).toHaveAttribute('href', '/remap/latest');
    });
  });

  describe('Content component integration', () => {
    it('should pass correct props to continue watching content', () => {
      const mockData = createMockData();
      
      render(Page, { props: { data: mockData } });
      
      // The mock content component should be rendered
      expect(screen.getAllByTestId('mock-content')).toHaveLength(5); // 1 continue + 4 sources
    });

    it('should pass correct section IDs to content components', () => {
      const mockData = createMockData();
      
      render(Page, { props: { data: mockData } });
      
      // Verify source sections have correct data attributes
      const gbSection = screen.getByTestId('source-section', { name: /giantbomb/i });
      expect(gbSection).toHaveAttribute('data-source', 'giantbomb');
      
      const jgSection = screen.getByTestId('source-section', { name: /jeffgerstmann/i });
      expect(jgSection).toHaveAttribute('data-source', 'jeffgerstmann');
    });
  });

  describe('Snapshot functionality', () => {
    it('should handle snapshot capture correctly', () => {
      const mockData = createMockData();
      
      const component = render(Page, { props: { data: mockData } });
      
      // Access the component instance to test snapshot functionality
      const componentInstance = component.component;
      
      // Test that snapshot object exists and has correct structure
      expect(componentInstance.snapshot).toBeDefined();
      expect(typeof componentInstance.snapshot.capture).toBe('function');
      expect(typeof componentInstance.snapshot.restore).toBe('function');
    });

    it('should capture carousel and selected videos state', () => {
      const mockData = createMockData();
      
      const component = render(Page, { props: { data: mockData } });
      const captured = component.component.snapshot.capture();
      
      expect(captured).toHaveProperty('carouselsState');
      expect(captured).toHaveProperty('selectedVideos');
      expect(typeof captured.carouselsState).toBe('object');
      expect(typeof captured.selectedVideos).toBe('object');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle missing data gracefully', () => {
      const minimalData = {
        sourceVideos: {},
        contentFilter: {},
        continueWatchingVideos: [],
        userProfile: null,
        session: null,
        supabase: {},
      };
      
      expect(() => {
        render(Page, { props: { data: minimalData } });
      }).not.toThrow();
    });

    it('should handle malformed source videos', () => {
      const mockData = createMockData({
        sourceVideos: null,
      });
      
      expect(() => {
        render(Page, { props: { data: mockData } });
      }).not.toThrow();
    });

    it('should handle empty content filter', () => {
      const mockData = createMockData({
        contentFilter: null,
      });
      
      expect(() => {
        render(Page, { props: { data: mockData } });
      }).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      const mockData = createMockData();
      
      render(Page, { props: { data: mockData } });
      
      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toHaveTextContent('Latest Videos');
    });

    it('should have accessible links', () => {
      const mockData = createMockData();
      
      render(Page, { props: { data: mockData } });
      
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
      
      // All links should have accessible text
      links.forEach(link => {
        expect(link).toHaveAccessibleName();
      });
    });
  });
});