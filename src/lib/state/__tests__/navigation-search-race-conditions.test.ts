import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NavigationStateClass } from '../navigation.svelte.js';

// Mock dependencies
vi.mock('$app/navigation', () => ({
  goto: vi.fn().mockResolvedValue(undefined),
  preloadData: vi.fn(),
  invalidateAll: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$app/environment', () => ({
  browser: true,
}));

vi.mock('$app/state', () => ({
  page: {
    url: { pathname: '/' },
  },
}));

vi.mock('$lib/state/notifications.svelte.js', () => ({
  showToast: vi.fn(),
}));

// Mock debounce to make tests synchronous
vi.mock('debounce', () => ({
  default: vi.fn((fn: any) => {
    const debouncedFn = Object.assign(vi.fn(fn), {
      isPending: false,
      clear: vi.fn(function (this: any) {
        this.isPending = false;
      }),
    });
    return debouncedFn;
  }),
}));

describe('Navigation Search Race Conditions', () => {
  let navigationState: NavigationStateClass;
  let mockGoto: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    navigationState = new NavigationStateClass();
    mockGoto = vi.mocked(await import('$app/navigation')).goto;
  });

  afterEach(() => {
    navigationState.cleanup();
    vi.clearAllMocks();
  });

  describe('Search string overwriting during navigation', () => {
    it('should not overwrite user input when navigating from search to home', async () => {
      // Simulate user typing search
      const searchEvent = {
        target: { value: 'test query' },
      } as any;

      navigationState.handleSearch(searchEvent);
      expect(navigationState.searchQuery).toBe('test query');

      // Simulate user clearing search
      const clearEvent = {
        target: { value: '' },
      } as any;

      navigationState.handleSearch(clearEvent);
      expect(navigationState.searchQuery).toBe('');

      // Simulate navigation to home is about to happen (but takes time)
      const redirectPromise = navigationState.searchRedirect(
        clearEvent,
        '',
        Date.now()
      );

      // Before navigation completes, user starts typing again
      const newSearchEvent = {
        target: { value: 'new search' },
      } as any;

      navigationState.handleSearch(newSearchEvent);
      expect(navigationState.searchQuery).toBe('new search');

      // Wait for navigation to complete
      await redirectPromise;

      // User input should still be preserved
      expect(navigationState.searchQuery).toBe('new search');
    });

    it('should not update searchQuery from URL when user has recently typed', () => {
      // Simulate user typing
      const searchEvent = {
        target: { value: 'user typing' },
      } as any;

      navigationState.handleSearch(searchEvent);
      expect(navigationState.searchQuery).toBe('user typing');

      // Simulate URL change to home page (which would clear search)
      navigationState.syncSearchQueryFromUrl('/', false);

      // Should not overwrite recent user input
      expect(navigationState.searchQuery).toBe('user typing');
    });

    it('should update searchQuery from URL when enough time has passed', async () => {
      // Simulate user typing
      const searchEvent = {
        target: { value: 'old search' },
      } as any;

      navigationState.handleSearch(searchEvent);
      expect(navigationState.searchQuery).toBe('old search');

      // Wait for grace period to pass (1000ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Simulate URL change to home page
      navigationState.syncSearchQueryFromUrl('/', false);

      // Should update after grace period
      expect(navigationState.searchQuery).toBe('');
    });

    it('should handle concurrent search operations correctly', async () => {
      // Start first search
      const firstSearchEvent = {
        target: { value: 'first search' },
      } as any;

      navigationState.handleSearch(firstSearchEvent);

      // Wait a millisecond to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Start second search quickly
      const secondSearchEvent = {
        target: { value: 'second search' },
      } as any;

      navigationState.handleSearch(secondSearchEvent);

      // Execute searches - the newer one should work, older one should be ignored
      await navigationState.searchRedirect(
        firstSearchEvent,
        'first search',
        Date.now() - 100
      );
      await navigationState.searchRedirect(
        secondSearchEvent,
        'second search',
        Date.now()
      );

      // Should only navigate for the most recent search
      expect(mockGoto).toHaveBeenCalledWith('/search/second%20search', {
        keepFocus: true,
        replaceState: true,
      });

      expect(mockGoto).not.toHaveBeenCalledWith('/search/first%20search');
    });

    it('should prevent stale URL syncing during active search', () => {
      // Simulate user actively searching
      navigationState.isSearching = true;
      navigationState.searchQuery = 'active search';

      // Simulate URL trying to sync (should be blocked)
      navigationState.syncSearchQueryFromUrl('/search/old%20search', false);

      // Should not update during active search
      expect(navigationState.searchQuery).toBe('active search');
    });

    it('should handle navigation timestamp ordering correctly', async () => {
      // Test that searchRedirect properly handles expected value mismatches
      navigationState.searchQuery = 'current search';

      const event = {
        target: { value: 'current search' },
      } as any;

      // This should work - matches current search query
      await navigationState.searchRedirect(event, 'current search', Date.now());
      expect(mockGoto).toHaveBeenCalledWith('/search/current%20search', {
        keepFocus: true,
        replaceState: true,
      });

      mockGoto.mockClear();

      // This should be aborted - expected value doesn't match current state
      const mismatchEvent = {
        target: { value: 'different search' },
      } as any;

      const result = await navigationState.searchRedirect(
        mismatchEvent,
        'expected search',
        Date.now()
      );

      // Should abort navigation when expected value doesn't match
      expect(result).toBe(mismatchEvent);
      expect(mockGoto).not.toHaveBeenCalled();
    });
  });

  describe('Search page mount behavior', () => {
    it('should not overwrite user input when mounting search page', () => {
      // Simulate user is currently typing by calling handleSearch
      const userEvent = {
        target: { value: 'user typing' },
      } as any;

      navigationState.handleSearch(userEvent);
      expect(navigationState.searchQuery).toBe('user typing');

      // Simulate search page mount with different query (should not overwrite recent input)
      const urlSearchQuery = 'url query';
      navigationState.syncSearchQueryFromUrl(
        `/search/${encodeURIComponent(urlSearchQuery)}`,
        false
      );

      expect(navigationState.searchQuery).toBe('user typing');
    });

    it('should update searchQuery on force sync during page mount', () => {
      navigationState.searchQuery = 'current search';

      // Force sync should always update (like on page load)
      navigationState.syncSearchQueryFromUrl('/search/mounted%20search', true);

      expect(navigationState.searchQuery).toBe('mounted search');
    });
  });
});
