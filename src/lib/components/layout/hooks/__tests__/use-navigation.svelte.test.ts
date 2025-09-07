import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useNavigation } from '../use-navigation.svelte';

// Mock dependencies
vi.mock('$app/navigation', () => ({
  beforeNavigate: vi.fn(),
  afterNavigate: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('$app/state', () => ({
  navigating: null,
}));

vi.mock('svelte', () => ({
  tick: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/state/page.svelte.js', () => ({
  // Mock will be provided by test setup
}));

vi.mock('$lib/state/navigation.svelte.js', () => ({
  getNavigationState: vi.fn(),
}));

vi.mock('$lib/utils/service-worker.js', () => ({
  cancelPendingImageRequests: vi.fn(),
}));

describe('useNavigation hook', () => {
  let mockPageState: any;
  let mockNavigationState: any;
  let mockBeforeNavigate: any;
  let mockAfterNavigate: any;
  let mockInvalidate: any;
  let mockTick: any;
  let mockCancelPendingImageRequests: any;
  let mockGetNavigationState: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mocks
    const { beforeNavigate, afterNavigate, invalidate } = require('$app/navigation');
    const { tick } = require('svelte');
    const { cancelPendingImageRequests } = require('$lib/utils/service-worker.js');
    const { getNavigationState } = require('$lib/state/navigation.svelte.js');

    mockBeforeNavigate = beforeNavigate;
    mockAfterNavigate = afterNavigate;
    mockInvalidate = invalidate;
    mockTick = tick;
    mockCancelPendingImageRequests = cancelPendingImageRequests;
    mockGetNavigationState = getNavigationState;

    // Mock page state
    mockPageState = {
      contentScrollPosition: null,
      createViewportSnapshot: vi.fn().mockReturnValue({ top: 100, left: 50 }),
      viewportRefs: {
        contentViewportRef: {
          scrollTop: 0,
          scrollLeft: 0,
        },
      },
    };

    // Mock navigation state
    mockNavigationState = {
      clearSearchQuery: vi.fn(),
    };

    mockGetNavigationState.mockReturnValue(mockNavigationState);
    mockCancelPendingImageRequests.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useNavigation function', () => {
    it('should return navigation utility functions', () => {
      const navigation = useNavigation(mockPageState);

      expect(navigation).toHaveProperty('getIsNavigatingToContent');
      expect(navigation).toHaveProperty('setupNavigationHooks');
      expect(typeof navigation.getIsNavigatingToContent).toBe('function');
      expect(typeof navigation.setupNavigationHooks).toBe('function');
    });

    it('should call getNavigationState on initialization', () => {
      useNavigation(mockPageState);

      expect(mockGetNavigationState).toHaveBeenCalledTimes(1);
    });
  });

  describe('setupNavigationHooks', () => {
    it('should register beforeNavigate and afterNavigate hooks', () => {
      const navigation = useNavigation(mockPageState);
      navigation.setupNavigationHooks();

      expect(mockBeforeNavigate).toHaveBeenCalledTimes(1);
      expect(mockAfterNavigate).toHaveBeenCalledTimes(1);
      expect(typeof mockBeforeNavigate.mock.calls[0][0]).toBe('function');
      expect(typeof mockAfterNavigate.mock.calls[0][0]).toBe('function');
    });
  });

  describe('beforeNavigate hook', () => {
    it('should save scroll position when navigating from a page', async () => {
      const navigation = useNavigation(mockPageState);
      navigation.setupNavigationHooks();

      const beforeNavigateCallback = mockBeforeNavigate.mock.calls[0][0];
      await beforeNavigateCallback({ from: { url: { pathname: '/test' } } });

      expect(mockPageState.createViewportSnapshot).toHaveBeenCalledWith(
        mockPageState.viewportRefs.contentViewportRef
      );
      expect(mockPageState.contentScrollPosition).toEqual({ top: 100, left: 50 });
    });

    it('should not save scroll position when no from page', async () => {
      const navigation = useNavigation(mockPageState);
      navigation.setupNavigationHooks();

      const beforeNavigateCallback = mockBeforeNavigate.mock.calls[0][0];
      await beforeNavigateCallback({ from: null });

      expect(mockPageState.createViewportSnapshot).not.toHaveBeenCalled();
    });

    it('should cancel pending image requests', async () => {
      const navigation = useNavigation(mockPageState);
      navigation.setupNavigationHooks();

      const beforeNavigateCallback = mockBeforeNavigate.mock.calls[0][0];
      await beforeNavigateCallback({ from: { url: { pathname: '/test' } } });

      expect(mockCancelPendingImageRequests).toHaveBeenCalledTimes(1);
    });

    it('should handle image request cancellation errors silently', async () => {
      mockCancelPendingImageRequests.mockRejectedValue(new Error('Service worker error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const navigation = useNavigation(mockPageState);
      navigation.setupNavigationHooks();

      const beforeNavigateCallback = mockBeforeNavigate.mock.calls[0][0];
      await beforeNavigateCallback({ from: { url: { pathname: '/test' } } });

      expect(mockCancelPendingImageRequests).toHaveBeenCalledTimes(1);
      expect(consoleSpy).not.toHaveBeenCalled(); // Should fail silently

      consoleSpy.mockRestore();
    });
  });

  describe('afterNavigate hook', () => {
    it('should reset scroll position for new pages', async () => {
      const navigation = useNavigation(mockPageState);
      navigation.setupNavigationHooks();

      const afterNavigateCallback = mockAfterNavigate.mock.calls[0][0];
      await afterNavigateCallback({
        from: { url: { pathname: '/old-page' } },
        to: { url: { pathname: '/new-page' } },
        delta: null,
      });

      expect(mockPageState.viewportRefs.contentViewportRef.scrollTop).toBe(0);
      expect(mockPageState.viewportRefs.contentViewportRef.scrollLeft).toBe(0);
      expect(mockTick).toHaveBeenCalledTimes(1);
    });
  });

  describe('getIsNavigatingToContent', () => {
    it('should return false when not navigating', () => {
      const navigation = useNavigation(mockPageState);
      const result = navigation.getIsNavigatingToContent();

      expect(result).toBe(false);
    });
  });
});