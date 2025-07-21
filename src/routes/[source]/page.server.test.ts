import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockLoadEvent,
  createVideoFilter,
  type BaseParentData,
} from "../../tests/mocks/sveltekit";
import { mockSession } from "../../tests/mocks/auth";
import { mockVideo } from "../../tests/mocks/videos";
import { mockPlaylist } from "../../tests/mocks/playlists";
import { setupTest } from "../../tests/utils/test-setup";

// Hoist the mocks to the top level to avoid scope issues
const { mockGetVideos } = vi.hoisted(() => ({
  mockGetVideos: vi.fn(),
}));

const {
  mockGetPlaylistByYoutubeId,
  mockGetPlaylistVideos,
  mockGetPlaylistsForUsername,
} = vi.hoisted(() => ({
  mockGetPlaylistByYoutubeId: vi.fn(),
  mockGetPlaylistVideos: vi.fn(),
  mockGetPlaylistsForUsername: vi.fn(),
}));

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
}));

const { mockIsSource, mockSOURCE_INFO } = vi.hoisted(() => ({
  mockIsSource: vi.fn(),
  mockSOURCE_INFO: {
    giantbomb: {
      highlightedPlaylists: [
        { youtubeId: "highlighted-1", name: "Best of Giant Bomb" },
      ],
    },
    nextlander: {
      highlightedPlaylists: [],
    },
  },
}));

const { mockIsVideoFilter } = vi.hoisted(() => ({
  mockIsVideoFilter: vi.fn(),
}));

// Mock the dependencies at the top level
vi.mock("$lib/supabase/videos", () => ({
  getVideos: mockGetVideos,
  DEFAULT_NUM_VIDEOS_OVERVIEW: 30,
}));

vi.mock("$lib/supabase/playlists", () => ({
  getPlaylistByYoutubeId: mockGetPlaylistByYoutubeId,
  getPlaylistVideos: mockGetPlaylistVideos,
  getPlaylistsForUsername: mockGetPlaylistsForUsername,
  DEFAULT_NUM_PLAYLISTS_OVERVIEW: 12,
}));

vi.mock("@sveltejs/kit", () => ({
  redirect: mockRedirect,
}));

vi.mock("$lib/constants/source", () => ({
  isSource: mockIsSource,
  SOURCE_INFO: mockSOURCE_INFO,
}));

vi.mock("$lib/components/content/content-filter", () => ({
  isVideoFilter: mockIsVideoFilter,
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+page.server");

describe("[source]/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    // Reset to default successful implementation
    mockGetVideos.mockResolvedValue({
      videos: [mockVideo],
    });

    mockGetPlaylistByYoutubeId.mockResolvedValue({
      playlist: mockPlaylist,
    });

    mockGetPlaylistVideos.mockResolvedValue({
      videos: [mockVideo],
    });

    mockGetPlaylistsForUsername.mockResolvedValue({
      playlists: [mockPlaylist],
      count: 1,
    });

    mockRedirect.mockImplementation((status: number, location: string) => {
      throw new Response(null, {
        status,
        headers: { Location: location },
      });
    });

    mockIsSource.mockReturnValue(true);
    mockIsVideoFilter.mockReturnValue(true);
  });

  it("loads source page data successfully for giantbomb", async () => {
    const { load } = await loadModule();

    const userPlaylist = { ...mockPlaylist, created_by: "user-1" };

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createVideoFilter(),
      playlists: [userPlaylist],
      userPlaylistsCount: 1,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      params: { source: "giantbomb" },
      routeId: "/[source]",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.videos).toEqual([mockVideo]);
    expect(result.source).toBe("giantbomb");
    expect(result.contentFilter).toEqual(createVideoFilter());
    expect(result.playlists).toEqual([userPlaylist]);
    expect(result.followedPlaylists).toEqual([]);
    expect(result.highlightPlaylists).toBeDefined();
    expect(result.sourcePlaylistsData).toBeDefined();

    expect(mockIsSource).toHaveBeenCalledWith("giantbomb");
    expect(mockGetVideos).toHaveBeenCalledWith({
      source: "giantbomb",
      session: mockSession,
      limit: 30,
      contentFilter: createVideoFilter(),
      supabase: expect.any(Object),
    });
  });

  it("redirects to home when source is invalid", async () => {
    const { load } = await loadModule();

    mockIsSource.mockReturnValue(false);

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createVideoFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      params: { source: "invalid-source" },
      routeId: "/[source]",
    });

    try {
      await load(mockEvent);
      expect.fail("Expected redirect to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(303);
      expect((error as Response).headers.get("Location")).toBe("/");
    }

    expect(mockRedirect).toHaveBeenCalledWith(303, "/");
  });

  it("handles source with no highlighted playlists", async () => {
    const { load } = await loadModule();

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createVideoFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      params: { source: "nextlander" },
      routeId: "/[source]",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.source).toBe("nextlander");
    expect(result.highlightPlaylists).toEqual([]);
  });

  it("filters followed playlists correctly", async () => {
    const { load } = await loadModule();

    const userPlaylist = { ...mockPlaylist, created_by: "user-1" };
    const followedPlaylist = {
      ...mockPlaylist,
      id: 2,
      created_by: "other-user",
    };

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createVideoFilter(),
      playlists: [userPlaylist, followedPlaylist],
      userPlaylistsCount: 2,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      params: { source: "giantbomb" },
      routeId: "/[source]",
    });

    const result = await load(mockEvent);

    expect(result.followedPlaylists).toEqual([followedPlaylist]);
    expect(result.followedPlaylists).not.toContain(userPlaylist);
  });

  it("throws error when content filter is not a video filter", async () => {
    const { load } = await loadModule();

    mockIsVideoFilter.mockReturnValue(false);

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createVideoFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      params: { source: "giantbomb" },
      routeId: "/[source]",
    });

    await expect(load(mockEvent)).rejects.toThrow("Invalid content filter");
  });

  it("handles null playlist results correctly", async () => {
    const { load } = await loadModule();

    mockGetPlaylistByYoutubeId.mockResolvedValue({
      playlist: null,
    });

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createVideoFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      params: { source: "giantbomb" },
      routeId: "/[source]",
    });

    const result = await load(mockEvent);

    expect(result.highlightPlaylists).toEqual([]);
  });

  it("handles database errors gracefully", async () => {
    const { load } = await loadModule();

    mockGetVideos.mockRejectedValue(new Error("Database error"));

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createVideoFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      params: { source: "giantbomb" },
      routeId: "/[source]",
    });

    await expect(load(mockEvent)).rejects.toThrow("Database error");
  });
});
