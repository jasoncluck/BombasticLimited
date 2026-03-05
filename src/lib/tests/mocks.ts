import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createMockSession,
  createMockUserProfile,
  createMockVideoResponse,
  createMockContinueWatchingResponse,
} from './test-utils';

/**
 * Create a mocked Supabase client with common methods
 */
export function createMockSupabaseClient() {
  const mockSession = createMockSession();
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: {
            sub: mockSession.user.id,
            email: mockSession.user.email,
            role: 'authenticated',
          },
        },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: mockSession },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockSession.user },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: createMockUserProfile(),
            error: null,
          }),
        })),
        limit: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })),
      insert: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: [createMockUserProfile()],
          error: null,
        }),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn().mockResolvedValue({
            data: [createMockUserProfile()],
            error: null,
          }),
        })),
      })),
    })),
    rpc: vi.fn((functionName, params) => ({
      select: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })),
  } as unknown as SupabaseClient;
}

/**
 * Mock SvelteKit stores
 */
export function createMockStores() {
  return {
    page: {
      subscribe: vi.fn(),
      url: {
        searchParams: new URLSearchParams(),
      },
      params: {},
      route: { id: '/' },
      status: 200,
      error: null,
      data: {},
      form: null,
      state: {},
    },
    navigating: {
      subscribe: vi.fn(),
    },
    updated: {
      subscribe: vi.fn(),
      check: vi.fn(),
    },
  };
}

/**
 * Common mock functions for route tests
 */
export function createMockRouteFunctions() {
  return {
    mockGetVideos: vi.fn().mockResolvedValue(createMockVideoResponse()),
    mockGetInProgressVideos: vi
      .fn()
      .mockResolvedValue(createMockContinueWatchingResponse()),
    mockDepends: vi.fn(),
    mockGetProfile: vi
      .fn()
      .mockResolvedValue({ profile: createMockUserProfile(), error: null }),
  };
}

/**
 * Mock browser/server detection functions
 */
export function createMockEnvironmentFunctions() {
  return {
    mockIsBrowser: vi.fn().mockReturnValue(false),
    mockCreateBrowserClient: vi.fn(),
    mockCreateServerClient: vi.fn(),
  };
}

/**
 * Mock layout data for tests
 */
export function createMockLayoutData() {
  return {
    session: createMockSession(),
    cookies: [
      { name: 'sb-access-token', value: 'mock-token' },
      { name: 'sb-refresh-token', value: 'mock-refresh' },
    ],
    playlistsCount: 5,
    userProfile: createMockUserProfile(),
    layout: null,
    contentFilter: {
      sort: { key: 'datePublished', order: 'descending' },
      type: 'video',
    },
    cached: false,
    etag: '"test-etag"',
    lastModified: '2023-01-01T00:00:00Z',
    cacheUserId: 'user-1',
  };
}

/**
 * Mock load event for layout tests
 */
export function createMockLoadEvent() {
  return {
    data: createMockLayoutData(),
    depends: vi.fn(),
    fetch: global.fetch,
  };
}
