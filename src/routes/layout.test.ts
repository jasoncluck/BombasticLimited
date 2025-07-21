import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTest } from "../tests/utils/test-setup";
import { createMockSupabaseClient } from "../tests/mocks/supabase";
import { mockUser, mockSession } from "../tests/mocks/auth";
import { mockPlaylist } from "../tests/mocks/playlists";
import { mockUserProfile } from "../tests/mocks/page-data";

// Mock dependencies at the top level using vi.hoisted
const { mockCreateBrowserClient, mockCreateServerClient, mockIsBrowser } = vi.hoisted(() => ({
  mockCreateBrowserClient: vi.fn(),
  mockCreateServerClient: vi.fn(),
  mockIsBrowser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mockCreateBrowserClient,
  createServerClient: mockCreateServerClient,
  isBrowser: mockIsBrowser,
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_SUPABASE_URL: "https://test.supabase.co",
  PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+layout");

describe("layout load function", () => {
  setupTest();

  const mockSupabase = createMockSupabaseClient();
  const mockFetch = vi.fn();
  const mockDepends = vi.fn();

  const mockLayoutData = {
    cookies: [
      { name: "test-cookie", value: "test-value" }
    ],
    playlists: [mockPlaylist],
    playlistsCount: 1,
    userProfile: mockUserProfile,
    layout: "default",
    contentFilter: {
      sort: { key: "datePublished", order: "descending" },
      type: "video",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    mockCreateBrowserClient.mockReturnValue(mockSupabase);
    mockCreateServerClient.mockReturnValue(mockSupabase);
    mockIsBrowser.mockReturnValue(false); // Default to server environment

    // Mock auth responses
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
  });

  it("creates browser client when in browser environment", async () => {
    mockIsBrowser.mockReturnValue(true);

    const { load } = await loadModule();
    const mockEvent = {
      data: mockLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    await load(mockEvent);

    expect(mockCreateBrowserClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      {
        global: {
          fetch: mockFetch,
        },
      }
    );
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("creates server client when in server environment", async () => {
    mockIsBrowser.mockReturnValue(false);

    const { load } = await loadModule();
    const mockEvent = {
      data: mockLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    await load(mockEvent);

    expect(mockCreateServerClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      {
        global: {
          fetch: mockFetch,
        },
        cookies: {
          getAll: expect.any(Function),
        },
      }
    );
    expect(mockCreateBrowserClient).not.toHaveBeenCalled();
  });

  it("declares supabase:auth dependency", async () => {
    const { load } = await loadModule();
    const mockEvent = {
      data: mockLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    await load(mockEvent);

    expect(mockDepends).toHaveBeenCalledWith("supabase:auth");
  });

  it("gets session and user data from Supabase", async () => {
    const { load } = await loadModule();
    const mockEvent = {
      data: mockLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    await load(mockEvent);

    expect(mockSupabase.auth.getSession).toHaveBeenCalled();
    expect(mockSupabase.auth.getUser).toHaveBeenCalled();
  });

  it("returns correct data structure with session and user", async () => {
    const { load } = await loadModule();
    const mockEvent = {
      data: mockLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    const result = await load(mockEvent);

    expect(result).toEqual({
      session: mockSession,
      supabase: mockSupabase,
      contentFilter: mockLayoutData.contentFilter,
      user: mockUser,
      userProfile: mockUserProfile,
      playlists: [mockPlaylist],
      playlistsCount: 1,
      layout: "default",
      isSidebarCollapsed: false,
    });
  });

  it("calculates isSidebarCollapsed correctly when layout indicates collapsed sidebar", async () => {
    const collapsedLayoutData = {
      ...mockLayoutData,
      layout: "7.5rem", // COLLAPSED_SIDEBAR_SIZE is 7
    };

    const { load } = await loadModule();
    const mockEvent = {
      data: collapsedLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    const result = await load(mockEvent);

    expect(result.isSidebarCollapsed).toBe(true);
  });

  it("calculates isSidebarCollapsed correctly when layout indicates expanded sidebar", async () => {
    const expandedLayoutData = {
      ...mockLayoutData,
      layout: "15rem", // Greater than COLLAPSED_SIDEBAR_SIZE
    };

    const { load } = await loadModule();
    const mockEvent = {
      data: expandedLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    const result = await load(mockEvent);

    expect(result.isSidebarCollapsed).toBe(false);
  });

  it("handles missing layout gracefully", async () => {
    const noLayoutData = {
      ...mockLayoutData,
      layout: undefined,
    };

    const { load } = await loadModule();
    const mockEvent = {
      data: noLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    const result = await load(mockEvent);

    expect(result.isSidebarCollapsed).toBe(false);
    expect(result.layout).toBeUndefined();
  });

  it("handles null session correctly", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { load } = await loadModule();
    const mockEvent = {
      data: mockLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    const result = await load(mockEvent);

    expect(result.session).toBeNull();
  });

  it("handles null user correctly", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { load } = await loadModule();
    const mockEvent = {
      data: mockLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    const result = await load(mockEvent);

    expect(result.user).toBeNull();
  });

  it("passes cookies to server client getAll function", async () => {
    mockIsBrowser.mockReturnValue(false);

    const { load } = await loadModule();
    const mockEvent = {
      data: mockLayoutData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    await load(mockEvent);

    // Verify that createServerClient was called and extract the cookies config
    const serverClientCall = mockCreateServerClient.mock.calls[0];
    const config = serverClientCall[2];
    const cookiesConfig = config.cookies;

    // Test the getAll function returns the correct cookies
    expect(cookiesConfig.getAll()).toEqual(mockLayoutData.cookies);
  });

  it("handles empty playlists array", async () => {
    const emptyPlaylistsData = {
      ...mockLayoutData,
      playlists: [],
      playlistsCount: 0,
    };

    const { load } = await loadModule();
    const mockEvent = {
      data: emptyPlaylistsData,
      depends: mockDepends,
      fetch: mockFetch,
    };

    const result = await load(mockEvent);

    expect(result.playlists).toEqual([]);
    expect(result.playlistsCount).toBe(0);
  });
});