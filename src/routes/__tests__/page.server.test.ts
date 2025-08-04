import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from '@sveltejs/kit';
import { load } from '../+page.server';
import { getVideos, getInProgressVideos } from '$lib/supabase/videos';
import { SOURCES } from '$lib/constants/source';

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
  const mockSession = { user: { id: 'test-user' } } as any;
  const mockDepends = vi.fn();

  const mockLoadEvent = {
    locals: {
      supabase: mockSupabase,
      session: mockSession,
    },
    url: new URL('http://localhost:5173/'),
    depends: mockDepends,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch videos from all sources and continue watching videos', async () => {
    // Mock successful responses
    const mockSourceVideos = {
      giantbomb: [{ id: 'gb1', title: 'GB Video 1' }],
      jeffgerstmann: [{ id: 'jg1', title: 'JG Video 1' }],
      nextlander: [{ id: 'nl1', title: 'NL Video 1' }],
      remap: [{ id: 'rm1', title: 'Remap Video 1' }],
    };

    const mockContinueVideos = [{ id: 'cv1', title: 'Continue Video 1' }];

    // Setup mocks for each source
    mockGetVideos.mockImplementation(async ({ source }) => ({
      videos: mockSourceVideos[source as keyof typeof mockSourceVideos] || [],
    }));

    mockGetInProgressVideos.mockResolvedValue({
      videos: mockContinueVideos,
    });

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
        supabase: mockSupabase,
        session: mockSession,
      });
    });

    // Verify continue watching videos were fetched
    expect(mockGetInProgressVideos).toHaveBeenCalledWith({
      contentFilter: {
        sort: {
          key: 'dateTimestamp',
          order: 'descending',
        },
        type: 'timestamp',
      },
      limit: 10,
      supabase: mockSupabase,
      session: mockSession,
    });

    // Verify returned data structure
    expect(result).toEqual({
      sourceVideos: {
        giantbomb: [{ id: 'gb1', title: 'GB Video 1' }],
        jeffgerstmann: [{ id: 'jg1', title: 'JG Video 1' }],
        nextlander: [{ id: 'nl1', title: 'NL Video 1' }],
        remap: [{ id: 'rm1', title: 'Remap Video 1' }],
      },
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

  it('should redirect to error page when URL has error parameter', async () => {
    const errorUrl = new URL('http://localhost:5173/?error=access_denied');
    const loadEventWithError = {
      ...mockLoadEvent,
      url: errorUrl,
    };

    await expect(load(loadEventWithError)).rejects.toThrow('Redirect');
    expect(mockRedirect).toHaveBeenCalledWith(303, '/auth/error');
  });

  it('should handle empty video responses gracefully', async () => {
    mockGetVideos.mockResolvedValue({ videos: [] });
    mockGetInProgressVideos.mockResolvedValue({ videos: [] });

    const result = await load(mockLoadEvent);

    expect(result.sourceVideos).toEqual({
      giantbomb: [],
      jeffgerstmann: [],
      nextlander: [],
      remap: [],
    });
    expect(result.continueWatchingVideos).toEqual([]);
  });

  it('should handle video fetching errors gracefully', async () => {
    mockGetVideos.mockRejectedValue(new Error('Database error'));
    mockGetInProgressVideos.mockRejectedValue(new Error('Database error'));

    await expect(load(mockLoadEvent)).rejects.toThrow('Database error');
  });

  it('should work with null session', async () => {
    const mockLoadEventNoSession = {
      ...mockLoadEvent,
      locals: {
        supabase: mockSupabase,
        session: null,
      },
    };

    mockGetVideos.mockResolvedValue({ videos: [] });
    mockGetInProgressVideos.mockResolvedValue({ videos: [] });

    const result = await load(mockLoadEventNoSession);

    expect(mockGetVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        session: null,
      })
    );
    expect(mockGetInProgressVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        session: null,
      })
    );
    expect(result).toBeDefined();
  });

  it('should use correct content filters', async () => {
    mockGetVideos.mockResolvedValue({ videos: [] });
    mockGetInProgressVideos.mockResolvedValue({ videos: [] });

    await load(mockLoadEvent);

    // Verify source videos content filter
    expect(mockGetVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        contentFilter: {
          sort: {
            key: 'datePublished',
            order: 'descending',
          },
          type: 'video',
        },
      })
    );

    // Verify continue watching content filter
    expect(mockGetInProgressVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        contentFilter: {
          sort: {
            key: 'dateTimestamp',
            order: 'descending',
          },
          type: 'timestamp',
        },
      })
    );
  });
});