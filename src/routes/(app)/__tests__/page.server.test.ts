import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from '@sveltejs/kit';
import { load } from '../+page.server';
import { getVideos, getInProgressVideos } from '$lib/supabase/videos';
import { SOURCES } from '$lib/constants/source';
import {
  createMockSession,
  createMockSourceVideos,
  createMockContinueVideos,
  createMockVideoResponse,
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
  getVideos: vi.fn(),
  getInProgressVideos: vi.fn(),
  DEFAULT_NUM_VIDEOS_OVERVIEW: 10,
}));

vi.mock('$lib/constants/source', () => ({
  SOURCES: ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'],
}));

const mockGetVideos = vi.mocked(getVideos);
const mockGetInProgressVideos = vi.mocked(getInProgressVideos);
const mockRedirect = vi.mocked(redirect);

describe('+page.server.ts load function', () => {
  const mockSupabase = {} as any;
  const mockSession = createMockSession();
  const mockSourceVideos = createMockSourceVideos();
  const mockContinueVideos = createMockContinueVideos();

  const mockLoadEvent: any = {
    locals: {
      supabase: mockSupabase,
      session: mockSession,
    },
    url: new URL('http://localhost:5173'),
    depends: vi.fn(),
    parent: vi.fn().mockResolvedValue({
      preferredImageFormat: 'webp',
    }),
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

  const mockDepends = mockLoadEvent.depends;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch videos from all sources and continue watching videos', async () => {
    // Setup mocks for each source
    mockGetVideos.mockImplementation(async ({ source }) =>
      createMockVideoResponse(
        mockSourceVideos[source as keyof typeof mockSourceVideos] || []
      )
    );

    mockGetInProgressVideos.mockResolvedValue(
      createMockContinueWatchingResponse(mockContinueVideos)
    );

    const result = await load(mockLoadEvent);

    expect(mockDepends).toHaveBeenCalledWith('supabase:db:videos');

    // Verify all sources were fetched
    expect(mockGetVideos).toHaveBeenCalledTimes(4);
    SOURCES.forEach((source) => {
      expect(mockGetVideos).toHaveBeenCalledWith({
        source,
        limit: 10,
        contentFilter: {
          sort: {
            key: 'datePublished',
            order: 'descending',
          },
          type: 'video',
        },
        preferredImageFormat: 'webp',
        supabase: mockSupabase,
      });
    });

    // Verify continue watching was fetched
    expect(mockGetInProgressVideos).toHaveBeenCalledWith({
      limit: 10,
      contentFilter: {
        sort: {
          key: 'dateTimestamp',
          order: 'descending',
        },
        type: 'timestamp',
      },
      preferredImageFormat: 'webp',
      supabase: mockSupabase,
    });

    // Verify result structure
    expect(result).toEqual({
      sourceVideos: mockSourceVideos,
      sourceVideosContentFilters: {
        sort: {
          key: 'datePublished',
          order: 'descending',
        },
        type: 'video',
      },
      continueWatchingVideos: mockContinueVideos,
      continueWatchingContentFilters: {
        sort: {
          key: 'dateTimestamp',
          order: 'descending',
        },
        type: 'timestamp',
      },
    });
  });

  it('should handle error parameters and redirect', async () => {
    const urlWithError = new URL('http://localhost:5173?error=access_denied');
    const loadEventWithError = {
      ...mockLoadEvent,
      url: urlWithError,
      parent: vi.fn().mockResolvedValue({
        preferredImageFormat: 'webp',
      }),
    };

    await expect(load(loadEventWithError)).rejects.toThrow('Redirect');
    expect(mockRedirect).toHaveBeenCalledWith(303, '/auth/error');
  });

  it('should work without session (anonymous user)', async () => {
    const anonymousLoadEvent = {
      ...mockLoadEvent,
      locals: {
        ...mockLoadEvent.locals,
        session: null,
      },
      parent: vi.fn().mockResolvedValue({
        preferredImageFormat: 'webp',
      }),
    };

    mockGetVideos.mockResolvedValue(createMockVideoResponse([]));
    mockGetInProgressVideos.mockResolvedValue(
      createMockContinueWatchingResponse([])
    );

    const result = (await load(anonymousLoadEvent)) as any;

    expect(mockGetInProgressVideos).toHaveBeenCalledWith({
      limit: 10,
      contentFilter: {
        sort: {
          key: 'dateTimestamp',
          order: 'descending',
        },
        type: 'timestamp',
      },
      preferredImageFormat: 'webp',
      supabase: mockSupabase,
    });

    expect(result.sourceVideos).toEqual({
      giantbomb: [],
      jeffgerstmann: [],
      nextlander: [],
      remap: [],
    });
    expect(result.continueWatchingVideos).toEqual([]);
  });

  it('should handle empty video responses gracefully', async () => {
    mockGetVideos.mockResolvedValue(createMockVideoResponse([]));
    mockGetInProgressVideos.mockResolvedValue(
      createMockContinueWatchingResponse([])
    );

    const result = (await load(mockLoadEvent)) as any;

    expect(result.sourceVideos).toEqual({
      giantbomb: [],
      jeffgerstmann: [],
      nextlander: [],
      remap: [],
    });
    expect(result.continueWatchingVideos).toEqual([]);
  });

  it('should handle database errors', async () => {
    mockGetVideos.mockResolvedValue(createMockErrorResponse('Database error'));
    mockGetInProgressVideos.mockResolvedValue(
      createMockContinueWatchingResponse([])
    );

    const result = (await load(mockLoadEvent)) as any;

    // Should still return structure even with errors
    expect(result.sourceVideos).toEqual({
      giantbomb: [],
      jeffgerstmann: [],
      nextlander: [],
      remap: [],
    });
    expect(result.continueWatchingVideos).toEqual([]);
  });

  it('should use correct content filters', async () => {
    mockGetVideos.mockResolvedValue(createMockVideoResponse([]));
    mockGetInProgressVideos.mockResolvedValue(
      createMockContinueWatchingResponse([])
    );

    await load(mockLoadEvent);

    // Verify content filter is applied to all calls - the load function uses hardcoded filters
    expect(mockGetVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        contentFilter: expect.objectContaining({
          sort: expect.objectContaining({
            key: 'datePublished',
            order: 'descending',
          }),
          type: 'video',
        }),
      })
    );
  });

  it('should fetch data concurrently for performance', async () => {
    let getVideosCallTime: number | null = null;
    let getInProgressCallTime: number | null = null;

    mockGetVideos.mockImplementation(async () => {
      getVideosCallTime = Date.now();
      // Simulate async delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      return createMockVideoResponse([]);
    });

    mockGetInProgressVideos.mockImplementation(async () => {
      getInProgressCallTime = Date.now();
      // Simulate async delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      return createMockContinueWatchingResponse([]);
    });

    await load(mockLoadEvent);

    // Both functions should be called around the same time (concurrent)
    expect(getVideosCallTime).not.toBeNull();
    expect(getInProgressCallTime).not.toBeNull();

    if (getVideosCallTime && getInProgressCallTime) {
      const timeDifference = Math.abs(
        getVideosCallTime - getInProgressCallTime
      );
      // Should be called within 5ms of each other (concurrent)
      expect(timeDifference).toBeLessThan(5);
    }
  });
});
