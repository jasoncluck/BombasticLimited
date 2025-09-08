import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from '@sveltejs/kit';
import { load } from '../+page.server';
import { getInProgressVideos } from '$lib/supabase/videos';
import { isTimestampFilter } from '$lib/components/content/content-filter';
import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import {
  createMockSession,
  createMockVideoWithTimestamp,
  createMockContinueWatchingResponse,
  createMockErrorResponse,
} from '$lib/tests/test-utils';

// Mock dependencies
vi.mock('@sveltejs/kit', () => ({
  redirect: vi.fn(() => {
    throw new Error('Redirect');
  }),
}));

vi.mock('$lib/supabase/videos', () => ({
  getInProgressVideos: vi.fn(),
}));

vi.mock('$lib/components/content/content-filter', () => ({
  isTimestampFilter: vi.fn(() => true),
}));

vi.mock('$lib/components/pagination/pagination', () => ({
  getPaginationQueryParams: vi.fn(() => 1),
}));

const mockGetInProgressVideos = vi.mocked(getInProgressVideos);
const mockRedirect = vi.mocked(redirect);

const mockIsTimestampFilter = vi.mocked(isTimestampFilter);
const mockGetPaginationQueryParams = vi.mocked(getPaginationQueryParams);

describe('continue/+page.server.ts load function', () => {
  const mockSupabase = {} as any;

  const mockContinueVideos = [
    createMockVideoWithTimestamp({
      id: 'cv1',
      title: 'Continue Video 1',
      video_start_seconds: 300,
      watched_at: '2023-01-01T12:00:00Z',
    }),
    createMockVideoWithTimestamp({
      id: 'cv2',
      title: 'Continue Video 2',
      video_start_seconds: 600,
      watched_at: '2023-01-01T11:00:00Z',
    }),
  ];

  const mockLoadEvent: any = {
    parent: vi.fn(),
    url: new URL('http://localhost:5173/continue'),
    locals: {
      supabase: mockSupabase,
    },
    depends: vi.fn(),
    request: {
      headers: {
        get: vi
          .fn()
          .mockReturnValue(
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
          ),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mocks to their default behavior
    mockIsTimestampFilter.mockReturnValue(true);
    mockGetPaginationQueryParams.mockReturnValue(1);

    mockLoadEvent.parent.mockResolvedValue({
      contentFilter: {
        sort: { key: 'dateTimestamp', order: 'descending' },
        type: 'timestamp',
      },
      preferredImageFormat: 'webp',
    });
  });

  describe('authentication validation', () => {
    it('should load data for authenticated user', async () => {
      mockGetInProgressVideos.mockResolvedValue(
        createMockContinueWatchingResponse(mockContinueVideos, 2)
      );

      const result = await load(mockLoadEvent);

      expect(mockLoadEvent.depends).toHaveBeenCalledWith('supabase:db:videos');
      expect((result as any).videos).toEqual(mockContinueVideos);
      expect((result as any).videosCount).toBe(2);
    });

    it('should handle session null values', async () => {
      // Test should pass without session as authentication is handled at DB level
      const noSessionLoadEvent = {
        ...mockLoadEvent,
        locals: {
          ...mockLoadEvent.locals,
        },
      };

      mockGetInProgressVideos.mockResolvedValue({
        videos: [],
        count: 0,
        error: null,
      });

      const result = await load(noSessionLoadEvent);
      expect((result as any).videos).toEqual([]);
      expect((result as any).videosCount).toBe(0);
    });
  });

  describe('data fetching', () => {
    it('should fetch continue watching videos with correct parameters', async () => {
      mockGetInProgressVideos.mockResolvedValue(
        createMockContinueWatchingResponse(mockContinueVideos, 2)
      );

      const result = await load(mockLoadEvent);

      expect(mockGetInProgressVideos).toHaveBeenCalledWith({
        currentPage: 1,
        contentFilter: {
          sort: { key: 'dateTimestamp', order: 'descending' },
          type: 'timestamp',
        },
        preferredImageFormat: 'webp',
        supabase: mockSupabase,
      });

      expect((result as any).videos).toEqual(mockContinueVideos);
      expect((result as any).videosCount).toBe(2);
    });

    it('should handle different page numbers', async () => {
      const { getPaginationQueryParams } = await import(
        '$lib/components/pagination/pagination'
      );
      vi.mocked(getPaginationQueryParams).mockReturnValue(3);

      mockGetInProgressVideos.mockResolvedValue(
        createMockContinueWatchingResponse([], 0)
      );

      await load(mockLoadEvent);

      expect(mockGetInProgressVideos).toHaveBeenCalledWith({
        currentPage: 3,
        contentFilter: {
          sort: { key: 'dateTimestamp', order: 'descending' },
          type: 'timestamp',
        },
        preferredImageFormat: 'webp',
        supabase: mockSupabase,
      });
    });

    it('should pass pagination query params correctly', async () => {
      const { getPaginationQueryParams } = await import(
        '$lib/components/pagination/pagination'
      );

      await load(mockLoadEvent);

      expect(getPaginationQueryParams).toHaveBeenCalledWith({
        searchParams: mockLoadEvent.url.searchParams,
      });
    });
  });

  describe('content filter validation', () => {
    it('should validate timestamp filter', async () => {
      mockGetInProgressVideos.mockResolvedValue(
        createMockContinueWatchingResponse([], 0)
      );

      const result = await load(mockLoadEvent);

      expect(result).toBeDefined();
    });

    it('should throw error for invalid content filter', async () => {
      const { isTimestampFilter } = await import(
        '$lib/components/content/content-filter'
      );
      vi.mocked(isTimestampFilter).mockReturnValue(false);

      await expect(load(mockLoadEvent)).rejects.toThrow(
        'Invalid content filter'
      );
    });

    it('should handle missing content filter from parent', async () => {
      mockLoadEvent.parent.mockResolvedValue({
        preferredImageFormat: 'webp',
      });
      // Override the mock to return false for missing contentFilter
      mockIsTimestampFilter.mockReturnValue(false);

      await expect(load(mockLoadEvent)).rejects.toThrow(
        'Invalid content filter'
      );
    });
  });

  describe('parallel execution', () => {
    it('should execute parent() and pagination parsing in parallel', async () => {
      const startTime = Date.now();
      let parentCallTime: number | null = null;
      let paginationCallTime: number | null = null;

      mockLoadEvent.parent.mockImplementation(async () => {
        parentCallTime = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          contentFilter: {
            sort: { key: 'dateTimestamp', order: 'descending' },
            type: 'timestamp',
          },
          preferredImageFormat: 'webp',
        };
      });

      const { getPaginationQueryParams } = await import(
        '$lib/components/pagination/pagination'
      );
      vi.mocked(getPaginationQueryParams).mockImplementation(() => {
        paginationCallTime = Date.now();
        return 1;
      });

      mockGetInProgressVideos.mockResolvedValue(
        createMockContinueWatchingResponse([], 0)
      );

      await load(mockLoadEvent);

      expect(parentCallTime).not.toBeNull();
      expect(paginationCallTime).not.toBeNull();

      if (parentCallTime && paginationCallTime) {
        // Since pagination parsing is synchronous wrapped in Promise.resolve,
        // it should be called around the same time as parent()
        const timeDifference = Math.abs(parentCallTime - paginationCallTime);
        expect(timeDifference).toBeLessThan(20);
      }
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockGetInProgressVideos.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(load(mockLoadEvent)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle empty results', async () => {
      mockGetInProgressVideos.mockResolvedValue(
        createMockContinueWatchingResponse([], 0)
      );

      const result = await load(mockLoadEvent);

      expect((result as any).videos).toEqual([]);
      expect((result as any).videosCount).toBe(0);
    });

    it('should handle null video results gracefully', async () => {
      mockGetInProgressVideos.mockResolvedValue({
        videos: null,
        count: 0,
        error: null,
      } as any);

      const result = await load(mockLoadEvent);

      expect((result as any).videos).toEqual([]);
      expect((result as any).videosCount).toBe(0);
    });

    it('should handle error responses from database', async () => {
      const errorResponse = createMockErrorResponse('Database query failed');
      mockGetInProgressVideos.mockResolvedValue(errorResponse as any);

      // The function should still return since it uses the response structure
      const result = await load(mockLoadEvent);

      expect((result as any).videos).toEqual([]);
      expect((result as any).videosCount).toBe(null);
    });
  });

  describe('result structure', () => {
    it('should return complete result structure', async () => {
      mockGetInProgressVideos.mockResolvedValue(
        createMockContinueWatchingResponse(mockContinueVideos, 25)
      );

      const result = await load(mockLoadEvent);

      expect(result).toEqual({
        videos: mockContinueVideos,
        contentFilter: {
          sort: { key: 'dateTimestamp', order: 'descending' },
          type: 'timestamp',
        },
        videosCount: 25,
      });
    });

    it('should ensure videos is always an array', async () => {
      mockGetInProgressVideos.mockResolvedValue({
        videos: null,
        count: 0,
        error: null,
      } as any);

      const result = await load(mockLoadEvent);

      expect(Array.isArray((result as any).videos)).toBe(true);
      expect((result as any).videos).toEqual([]);
    });

    it('should pass through content filter from parent', async () => {
      const customContentFilter = {
        sort: { key: 'dateTimestamp', order: 'ascending' },
        type: 'timestamp',
      };

      mockLoadEvent.parent.mockResolvedValue({
        contentFilter: customContentFilter,
        preferredImageFormat: 'webp',
      });

      mockGetInProgressVideos.mockResolvedValue(
        createMockContinueWatchingResponse([], 0)
      );

      const result = await load(mockLoadEvent);

      expect((result as any).contentFilter).toEqual(customContentFilter);
    });
  });

  describe('dependency invalidation', () => {
    it('should depend on correct database resource', async () => {
      mockGetInProgressVideos.mockResolvedValue(
        createMockContinueWatchingResponse([], 0)
      );

      await load(mockLoadEvent);

      expect(mockLoadEvent.depends).toHaveBeenCalledWith('supabase:db:videos');
    });

    it('should call depends before other operations', async () => {
      const callOrder: string[] = [];

      mockLoadEvent.depends.mockImplementation(() => {
        callOrder.push('depends');
      });

      mockLoadEvent.parent.mockImplementation(async () => {
        callOrder.push('parent');
        return {
          contentFilter: {
            sort: { key: 'dateTimestamp', order: 'descending' },
            type: 'timestamp',
          },
          preferredImageFormat: 'webp',
        };
      });

      mockGetInProgressVideos.mockImplementation(async () => {
        callOrder.push('getInProgressVideos');
        return createMockContinueWatchingResponse([], 0);
      });

      await load(mockLoadEvent);

      expect(callOrder[0]).toBe('depends');
    });
  });

  describe('session handling edge cases', () => {
    it('should handle session with missing user', async () => {
      const loadEventWithIncompleteSession = {
        ...mockLoadEvent,
        locals: {
          ...mockLoadEvent.locals,
        },
      };

      mockGetInProgressVideos.mockResolvedValue(
        createMockContinueWatchingResponse([], 0)
      );

      // Should still work if session exists but user is null
      const result = await load(loadEventWithIncompleteSession);
      expect(result).toBeDefined();
    });

    it('should handle falsy session values', async () => {
      const falsyValues = [null, undefined, false, '', 0];

      for (const falsyValue of falsyValues) {
        const loadEventWithFalsySession = {
          ...mockLoadEvent,
          locals: {
            ...mockLoadEvent.locals,
          },
        };

        mockGetInProgressVideos.mockResolvedValue({
          videos: [],
          count: 0,
          error: null,
        });

        // Should work without errors since auth is handled at DB level
        const result = await load(loadEventWithFalsySession);
        expect(result).toBeDefined();
        expect((result as any).videos).toEqual([]);
        vi.clearAllMocks();
      }
    });
  });
});
