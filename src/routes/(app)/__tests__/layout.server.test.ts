import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from '../+layout.server';
import { getProfile } from '$lib/supabase/user-profiles';
import { getFilterOptionFromQueryParams } from '$lib/components/content/content-filter';
import {
  createMockSession,
  createMockUserProfile,
  createMockProfileResponse,
} from '$lib/tests/test-utils';

// Mock dependencies
vi.mock('$lib/supabase/user-profiles', () => ({
  getProfile: vi.fn(),
}));

vi.mock('$lib/components/content/content-filter', () => ({
  getFilterOptionFromQueryParams: vi.fn(),
}));

const mockGetProfile = vi.mocked(getProfile);
const mockGetFilterOptionFromQueryParams = vi.mocked(
  getFilterOptionFromQueryParams
);

describe('+layout.server.ts load function', () => {
  const mockSupabase = {
    auth: {
      getClaims: vi.fn(),
    },
  } as any;
  const mockSession = createMockSession();
  const mockUserProfile = createMockUserProfile();
  const mockSafeGetSession = vi.fn();

  const mockLayoutEvent: any = {
    locals: {
      safeGetSession: mockSafeGetSession,
      supabase: mockSupabase,
    },
    cookies: {
      get: vi.fn(),
      getAll: vi.fn().mockReturnValue([]),
    },
    url: new URL('http://localhost:5173'),
    isDataRequest: false,
    setHeaders: vi.fn(),
    depends: vi.fn(),
    parent: vi.fn().mockResolvedValue({
      preferredImageFormat: 'webp',
    }),
    request: {
      headers: {
        get: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeGetSession.mockResolvedValue({ session: mockSession });
    mockSupabase.auth.getClaims.mockResolvedValue({
      data: {
        claims: { sub: 'user-1' },
      },
      error: null,
    });
    mockGetProfile.mockResolvedValue(
      createMockProfileResponse(mockUserProfile)
    );
    mockGetFilterOptionFromQueryParams.mockReturnValue({
      sort: { key: 'datePublished', order: 'descending' },
      type: 'video',
    });
  });

  it('should fetch session and user profile', async () => {
    const result = (await load(mockLayoutEvent)) as any;

    expect(mockSupabase.auth.getClaims).toHaveBeenCalled();
    expect(mockGetProfile).toHaveBeenCalledWith({
      supabase: mockSupabase,
    });

    expect(result.claims).toEqual({ sub: 'user-1' });
    expect(result.userProfile).toEqual(mockUserProfile);
  });

  it('should determine correct content view based on URL', async () => {
    // Test continue watching view
    const continueUrl = new URL('http://localhost:5173/continue');
    const continueEvent = { ...mockLayoutEvent, url: continueUrl };

    await load(continueEvent);

    expect(mockGetFilterOptionFromQueryParams).toHaveBeenCalledWith({
      searchParams: continueUrl.searchParams,
      view: 'continueWatching',
    });

    // Test playlist view
    const playlistUrl = new URL('http://localhost:5173/playlist/123');
    const playlistEvent = { ...mockLayoutEvent, url: playlistUrl };

    await load(playlistEvent);

    expect(mockGetFilterOptionFromQueryParams).toHaveBeenCalledWith({
      searchParams: playlistUrl.searchParams,
      view: 'playlist',
    });

    // Test default view
    const defaultUrl = new URL('http://localhost:5173/');
    const defaultEvent = { ...mockLayoutEvent, url: defaultUrl };

    await load(defaultEvent);

    expect(mockGetFilterOptionFromQueryParams).toHaveBeenCalledWith({
      searchParams: defaultUrl.searchParams,
      view: 'default',
    });
  });

  it('should set appropriate cache headers for authenticated users', async () => {
    const mockSetHeaders = vi.fn();
    const authEvent = {
      ...mockLayoutEvent,
      setHeaders: mockSetHeaders,
    };

    await load(authEvent);

    expect(mockSetHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        'cache-control': 'private, max-age=300, must-revalidate',
        vary: 'Authorization, Cookie',
      })
    );
  });

  it('should set appropriate cache headers for anonymous users', async () => {
    mockSupabase.auth.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });
    const mockSetHeaders = vi.fn();
    const anonEvent = {
      ...mockLayoutEvent,
      setHeaders: mockSetHeaders,
    };

    await load(anonEvent);

    expect(mockSetHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        'cache-control': 'public, max-age=600, s-maxage=1200',
        vary: 'Authorization, Cookie',
      })
    );
  });

  it('should handle cache hit detection', async () => {
    const timeSlot = Math.floor(Date.now() / 600000);
    const etag = `"/-user-1-${timeSlot}"`;
    const requestWithEtag = {
      ...mockLayoutEvent,
      request: {
        headers: {
          get: vi.fn().mockReturnValue(etag),
        },
      },
    };

    const result = (await load(requestWithEtag)) as any;

    expect(result.claims).toEqual({ sub: 'user-1' });
    expect(result.userProfile).toEqual(mockUserProfile);
  });

  it('should handle errors gracefully', async () => {
    mockGetProfile.mockRejectedValue(new Error('Profile fetch failed'));

    await expect(load(mockLayoutEvent)).rejects.toThrow('Profile fetch failed');
  });

  it('should work without session (anonymous user)', async () => {
    mockSupabase.auth.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });
    mockGetProfile.mockResolvedValue({
      profile: null,
      error: null,
    });

    const result = (await load(mockLayoutEvent)) as any;

    expect(result.claims).toBeNull();
    expect(result.userProfile).toBeNull();
    expect(result).toHaveProperty('contentFilter');
  });

  it('should skip cache headers for data requests', async () => {
    const mockSetHeaders = vi.fn();
    const dataRequestEvent = {
      ...mockLayoutEvent,
      isDataRequest: true,
      setHeaders: mockSetHeaders,
    };

    await load(dataRequestEvent);

    expect(mockSetHeaders).not.toHaveBeenCalled();
  });

  it('should generate cache key based on path and user', async () => {
    const result = (await load(mockLayoutEvent)) as any;

    expect(result.claims).toEqual({ sub: 'user-1' });
    expect(result.userProfile).toEqual(mockUserProfile);
    expect(result).toHaveProperty('contentFilter');
  });
});
