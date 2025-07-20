import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockLoadEvent, type BaseParentData } from "../tests/mocks/sveltekit";
import { mockSession } from "../tests/mocks/auth";
import { mockPlaylist } from "../tests/mocks/playlists";
import { mockUserProfile } from "../tests/mocks/user-profiles";
import { setupTest } from "../tests/utils/test-setup";

// Hoist the mocks to the top level to avoid scope issues
const { mockGetUserPlaylists, mockGetProfile } = vi.hoisted(() => ({
  mockGetUserPlaylists: vi.fn(),
  mockGetProfile: vi.fn(),
}));

const { mockGetFilterOptionFromQueryParams } = vi.hoisted(() => ({
  mockGetFilterOptionFromQueryParams: vi.fn(),
}));

const { mockGetCroppedPlaylistImageUrlServer } = vi.hoisted(() => ({
  mockGetCroppedPlaylistImageUrlServer: vi.fn(),
}));

const { mockParseImageProperties } = vi.hoisted(() => ({
  mockParseImageProperties: vi.fn(),
}));

// Mock the dependencies at the top level
vi.mock("$lib/supabase/playlists", () => ({
  getUserPlaylists: mockGetUserPlaylists,
}));

vi.mock("$lib/supabase/user-profiles", () => ({
  getProfile: mockGetProfile,
}));

vi.mock("$lib/components/content/content-filter", () => ({
  getFilterOptionFromQueryParams: mockGetFilterOptionFromQueryParams,
}));

vi.mock("$lib/server/image-processing", () => ({
  getCroppedPlaylistImageUrlServer: mockGetCroppedPlaylistImageUrlServer,
}));

vi.mock("$lib/components/playlist/playlist", () => ({
  parseImageProperties: mockParseImageProperties,
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+layout.server");

describe("+layout.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    // Reset to default successful implementation
    mockGetUserPlaylists.mockResolvedValue({
      userPlaylists: [mockPlaylist],
      count: 1,
    });

    mockGetProfile.mockResolvedValue({
      profile: mockUserProfile,
    });

    mockGetFilterOptionFromQueryParams.mockReturnValue({
      sort: { key: "datePublished", order: "descending" },
      type: "video",
    });

    mockGetCroppedPlaylistImageUrlServer.mockResolvedValue("http://localhost/processed-image.jpg");
    mockParseImageProperties.mockReturnValue(null);
  });

  it("loads layout data successfully with authenticated user", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000"),
      routeId: "/",
    });

    // Mock cookies.get to return undefined for layout cookie
    mockEvent.cookies.get = vi.fn().mockReturnValue(undefined);
    mockEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.session).toEqual(mockSession);
    expect(result.playlists).toHaveLength(1);
    expect(result.playlists[0]).toHaveProperty("processedImageUrl");
    expect(result.userPlaylistsCount).toBe(1);
    expect(result.userProfile).toEqual(mockUserProfile);
    expect(result.cookies).toEqual([]);
    expect(result.layout).toBeUndefined();

    expect(mockGetUserPlaylists).toHaveBeenCalledWith({
      session: mockSession,
      supabase: expect.any(Object),
    });
    expect(mockGetProfile).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      session: mockSession,
    });
  });

  it("loads layout data successfully without authenticated user", async () => {
    const { load } = await loadModule();

    // Mock to return empty data for unauthenticated user
    mockGetUserPlaylists.mockResolvedValue({
      userPlaylists: null,
      count: 0,
    });

    mockGetProfile.mockResolvedValue({
      profile: null,
    });

    const mockEvent = createMockLoadEvent({
      session: null,
      url: new URL("http://localhost:3000"),
      routeId: "/",
    });

    // Override safeGetSession to return null session
    mockEvent.locals.safeGetSession = vi.fn().mockResolvedValue({ 
      session: null, 
      user: null 
    });

    mockEvent.cookies.get = vi.fn().mockReturnValue(undefined);
    mockEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.session).toBeNull();
    expect(result.playlists).toEqual([]);
    expect(result.userPlaylistsCount).toBe(0);
    expect(result.userProfile).toBeNull();

    expect(mockGetUserPlaylists).toHaveBeenCalledWith({
      session: null,
      supabase: expect.any(Object),
    });
    expect(mockGetProfile).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      session: null,
    });
  });

  it("handles different content views correctly", async () => {
    const { load } = await loadModule();

    // Test continue view
    const continueEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000/continue"),
      routeId: "/continue",
    });
    continueEvent.cookies.get = vi.fn().mockReturnValue(undefined);
    continueEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    await load(continueEvent);

    expect(mockGetFilterOptionFromQueryParams).toHaveBeenCalledWith({
      searchParams: continueEvent.url.searchParams,
      view: "continueWatching",
    });

    // Test playlist view
    const playlistEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000/playlist/abc123"),
      routeId: "/playlist/[shortId]",
    });
    playlistEvent.cookies.get = vi.fn().mockReturnValue(undefined);
    playlistEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    await load(playlistEvent);

    expect(mockGetFilterOptionFromQueryParams).toHaveBeenCalledWith({
      searchParams: playlistEvent.url.searchParams,
      view: "playlist",
    });

    // Test default view
    const defaultEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000/search/test"),
      routeId: "/search/[query]",
    });
    defaultEvent.cookies.get = vi.fn().mockReturnValue(undefined);
    defaultEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    await load(defaultEvent);

    expect(mockGetFilterOptionFromQueryParams).toHaveBeenCalledWith({
      searchParams: defaultEvent.url.searchParams,
      view: "default",
    });
  });

  it("handles playlist image processing correctly", async () => {
    const { load } = await loadModule();

    const playlistWithImage = {
      ...mockPlaylist,
      thumbnail_url: "http://example.com/thumb.jpg",
      thumbnail_maxres_url: "http://example.com/thumb-max.jpg",
      image_properties: '{"crop": {"x": 10, "y": 20}}',
    };

    mockGetUserPlaylists.mockResolvedValue({
      userPlaylists: [playlistWithImage],
      count: 1,
    });

    const mockImageProperties = { crop: { x: 10, y: 20 } };
    mockParseImageProperties.mockReturnValue(mockImageProperties);

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000"),
      routeId: "/",
    });

    mockEvent.cookies.get = vi.fn().mockReturnValue(undefined);
    mockEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    const result = await load(mockEvent);

    expect(result.playlists[0].processedImageUrl).toBe("http://localhost/processed-image.jpg");
    expect(mockParseImageProperties).toHaveBeenCalledWith('{"crop": {"x": 10, "y": 20}}');
    expect(mockGetCroppedPlaylistImageUrlServer).toHaveBeenCalledWith({
      imageProperties: mockImageProperties,
      thumbnailMaxResUrl: "http://example.com/thumb-max.jpg",
      thumbnailUrl: "http://example.com/thumb.jpg",
    });
  });

  it("handles layout cookie correctly", async () => {
    const { load } = await loadModule();

    const layoutData = { sidebarWidth: 300 };
    const mockEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000"),
      routeId: "/",
    });

    mockEvent.cookies.get = vi.fn().mockReturnValue(JSON.stringify(layoutData));
    mockEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    const result = await load(mockEvent);

    expect(result.layout).toEqual(layoutData);
    expect(mockEvent.cookies.get).toHaveBeenCalledWith("PaneForge:layout");
  });

  it("handles empty playlist data correctly", async () => {
    const { load } = await loadModule();

    mockGetUserPlaylists.mockResolvedValue({
      userPlaylists: [],
      count: 0,
    });

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000"),
      routeId: "/",
    });

    mockEvent.cookies.get = vi.fn().mockReturnValue(undefined);
    mockEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    const result = await load(mockEvent);

    expect(result.playlists).toEqual([]);
    expect(result.userPlaylistsCount).toBe(0);
  });

  it("handles null playlist data correctly", async () => {
    const { load } = await loadModule();

    mockGetUserPlaylists.mockResolvedValue({
      userPlaylists: null,
      count: null,
    });

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000"),
      routeId: "/",
    });

    mockEvent.cookies.get = vi.fn().mockReturnValue(undefined);
    mockEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    const result = await load(mockEvent);

    expect(result.playlists).toEqual([]);
    expect(result.userPlaylistsCount).toBe(0);
  });

  it("handles database errors gracefully", async () => {
    const { load } = await loadModule();

    mockGetUserPlaylists.mockRejectedValue(new Error("Database error"));

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000"),
      routeId: "/",
    });

    mockEvent.cookies.get = vi.fn().mockReturnValue(undefined);
    mockEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    await expect(load(mockEvent)).rejects.toThrow("Database error");
  });

  it("handles concurrent operations correctly", async () => {
    const { load } = await loadModule();

    // Add some delay to simulate real async operations
    mockGetUserPlaylists.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                userPlaylists: [mockPlaylist],
                count: 1,
              }),
            10,
          ),
        ),
    );

    mockGetProfile.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                profile: mockUserProfile,
              }),
            15,
          ),
        ),
    );

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000"),
      routeId: "/",
    });

    mockEvent.cookies.get = vi.fn().mockReturnValue(undefined);
    mockEvent.cookies.getAll = vi.fn().mockReturnValue([]);

    const startTime = Date.now();
    const result = await load(mockEvent);
    const endTime = Date.now();

    // Should complete in less time than if operations were sequential (10 + 15 = 25ms)
    expect(endTime - startTime).toBeLessThan(25);
    expect(result).toBeDefined();
    expect(result.playlists).toHaveLength(1);
    expect(result.userProfile).toEqual(mockUserProfile);
  });
});