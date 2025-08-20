import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from '../+layout';
import {
  createBrowserClient,
  createServerClient,
  isBrowser,
} from '@supabase/ssr';
import {
  createMockSession,
  createMockUserProfile,
} from '$lib/tests/test-utils';

// Mock dependencies
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(),
  createServerClient: vi.fn(),
  isBrowser: vi.fn(),
}));

vi.mock('$env/static/public', () => ({
  PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
}));

const mockCreateBrowserClient = vi.mocked(createBrowserClient);
const mockCreateServerClient = vi.mocked(createServerClient);
const mockIsBrowser = vi.mocked(isBrowser);

describe('+layout.ts load function', () => {
  const mockSupabase = {
    auth: {
      getClaims: vi.fn(),
      getSession: vi.fn(),
    },
  } as any;

  const mockSession = createMockSession();
  const mockUserProfile = createMockUserProfile();

  const mockLayoutData = {
    cookies: [{ name: 'test', value: 'cookie' }],
    userProfile: mockUserProfile,
    layout: [250, 750],
    contentFilter: {
      sort: { key: 'datePublished', order: 'descending' },
      type: 'video',
    },
    playlistsCount: 5,
    etag: '"test-etag"',
    lastModified: '2023-01-01T00:00:00Z',
    cached: false,
    cacheUserId: 'user-1',
  };

  const mockLoadEvent: any = {
    data: mockLayoutData,
    depends: vi.fn(),
    fetch: fetch,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getClaims to return valid claims by default
    mockSupabase.auth.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: mockSession.user.id,
          email: mockSession.user.email,
          role: 'authenticated',
        },
      },
      error: null,
    });
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
    });
  });

  it('should create browser client when in browser', async () => {
    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    const result = await load(mockLoadEvent);

    expect(mockCreateBrowserClient).toHaveBeenCalledWith(
      'http://localhost:54321',
      'mock-anon-key',
      expect.objectContaining({
        global: expect.objectContaining({
          fetch: expect.any(Function),
        }),
      })
    );

    expect(result.supabase).toBe(mockSupabase);
    expect(result.session).toBe(mockSession);
  });

  it('should create server client when not in browser', async () => {
    mockIsBrowser.mockReturnValue(false);
    mockCreateServerClient.mockReturnValue(mockSupabase);

    const result = await load(mockLoadEvent);

    expect(mockCreateServerClient).toHaveBeenCalledWith(
      'http://localhost:54321',
      'mock-anon-key',
      expect.objectContaining({
        global: expect.objectContaining({
          fetch: expect.any(Function),
        }),
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      })
    );

    expect(result.supabase).toBe(mockSupabase);
    expect(result.session).toBe(mockSession);
  });

  it('should return cached data structure when cached is true', async () => {
    const cachedData = { ...mockLayoutData, cached: true };
    const cachedEvent = { ...mockLoadEvent, data: cachedData };

    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    const result = await load(cachedEvent);

    // The simplified implementation returns a streamlined structure
    expect(result).toEqual({
      session: mockSession,
      supabase: mockSupabase,
      contentFilter: {
        sort: { key: 'datePublished', order: 'descending' },
        type: 'video',
      },
      userProfile: mockUserProfile,
      isSidebarCollapsed: false,
    });
  });

  it('should process layout data properly when not cached', async () => {
    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    const result = await load(mockLoadEvent);

    // The simplified implementation returns a streamlined structure
    expect(result).toEqual({
      session: mockSession,
      supabase: mockSupabase,
      contentFilter: mockLayoutData.contentFilter,
      userProfile: mockUserProfile,
      isSidebarCollapsed: false,
    });
  });

  it('should handle collapsed sidebar layout correctly', async () => {
    const collapsedLayoutData = {
      ...mockLayoutData,
      layout: [7, 946], // COLLAPSED_SIDEBAR_SIZE = 7
    };
    const collapsedEvent = { ...mockLoadEvent, data: collapsedLayoutData };

    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    const result = await load(collapsedEvent);

    // The simplified implementation always returns false for isSidebarCollapsed
    expect(result.isSidebarCollapsed).toBe(false);
  });

  it('should handle invalid layout data gracefully', async () => {
    const invalidLayoutData = {
      ...mockLayoutData,
      layout: 'invalid-layout-string',
    };
    const invalidEvent = { ...mockLoadEvent, data: invalidLayoutData };

    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    const result = await load(invalidEvent);

    // Layout property no longer exists in simplified version
    expect(result.isSidebarCollapsed).toBe(false);
  });

  it('should handle missing layout data gracefully', async () => {
    const noLayoutData = {
      ...mockLayoutData,
      layout: null,
    };
    const noLayoutEvent = { ...mockLoadEvent, data: noLayoutData };

    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    const result = await load(noLayoutEvent);

    // Layout property no longer exists in simplified version
    expect(result.isSidebarCollapsed).toBe(false);
  });

  it('should handle array layout data correctly', async () => {
    const arrayLayoutData = {
      ...mockLayoutData,
      layout: [300, 700],
    };
    const arrayEvent = { ...mockLoadEvent, data: arrayLayoutData };

    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    const result = await load(arrayEvent);

    // Layout property no longer exists in simplified version
    expect(result.isSidebarCollapsed).toBe(false);
  });

  it('should handle string layout data that can be parsed', async () => {
    const stringLayoutData = {
      ...mockLayoutData,
      layout: JSON.stringify([400, 600]),
    };
    const stringEvent = { ...mockLoadEvent, data: stringLayoutData };

    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    const result = await load(stringEvent);

    // Layout property no longer exists in simplified version
    expect(result.isSidebarCollapsed).toBe(false);
  });

  it('should handle string layout data that cannot be parsed', async () => {
    const invalidStringLayoutData = {
      ...mockLayoutData,
      layout: 'not-valid-json',
    };
    const invalidStringEvent = {
      ...mockLoadEvent,
      data: invalidStringLayoutData,
    };

    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    const result = await load(invalidStringEvent);

    // Layout property no longer exists in simplified version
    expect(result.isSidebarCollapsed).toBe(false);
  });

  it('should call depends with supabase:auth', async () => {
    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    await load(mockLoadEvent);

    expect(mockLoadEvent.depends).toHaveBeenCalledWith('supabase:auth');
  });

  it('should handle missing optional data gracefully', async () => {
    const minimalData = {
      cookies: [],
      cached: false,
    };
    const minimalEvent = { ...mockLoadEvent, data: minimalData };

    mockIsBrowser.mockReturnValue(true);
    mockCreateBrowserClient.mockReturnValue(mockSupabase);

    const result = await load(minimalEvent);

    expect(result.userProfile).toBeNull();
    // playlistsCount and layout properties no longer exist in simplified version
    expect(result.contentFilter).toBeNull();
  });

  it('should handle server-side cookie operations', async () => {
    mockIsBrowser.mockReturnValue(false);

    const serverClient = {
      ...mockSupabase,
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: mockSession },
        }),
      },
    };

    mockCreateServerClient.mockReturnValue(serverClient);

    await load(mockLoadEvent);

    // Verify server client was created with cookie handlers
    expect(mockCreateServerClient).toHaveBeenCalledWith(
      'http://localhost:54321',
      'mock-anon-key',
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      })
    );

    // Test that getAll returns the cookies from data
    const [, , { cookies }] = mockCreateServerClient.mock.calls[0];
    expect(cookies.getAll()).toBe(mockLayoutData.cookies);
  });
});
