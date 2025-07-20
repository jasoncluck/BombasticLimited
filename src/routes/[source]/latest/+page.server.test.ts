import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockLoadEvent,
  createVideoFilter,
  type BaseParentData,
} from "../../../tests/mocks/sveltekit";
import { mockSession } from "../../../tests/mocks/auth";
import { mockVideo } from "../../../tests/mocks/videos";
import { setupTest } from "../../../tests/utils/test-setup";

// Hoist the mocks to the top level to avoid scope issues
const { mockGetVideos } = vi.hoisted(() => ({
  mockGetVideos: vi.fn(),
}));

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
}));

const { mockIsSource } = vi.hoisted(() => ({
  mockIsSource: vi.fn(),
}));

const { mockIsVideoFilter } = vi.hoisted(() => ({
  mockIsVideoFilter: vi.fn(),
}));

const { mockGetPaginationQueryParams } = vi.hoisted(() => ({
  mockGetPaginationQueryParams: vi.fn(),
}));

// Mock the dependencies at the top level
vi.mock("$lib/supabase/videos", () => ({
  getVideos: mockGetVideos,
  DEFAULT_NUM_VIDEOS_PAGINATION: 50,
}));

vi.mock("@sveltejs/kit", () => ({
  redirect: mockRedirect,
}));

vi.mock("$lib/constants/source", () => ({
  isSource: mockIsSource,
}));

vi.mock("$lib/components/content/content-filter", () => ({
  isVideoFilter: mockIsVideoFilter,
}));

vi.mock("$lib/components/pagination/pagination", () => ({
  getPaginationQueryParams: mockGetPaginationQueryParams,
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+page.server");

describe("[source]/latest/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    // Reset to default successful implementation
    mockGetVideos.mockResolvedValue({
      videos: [mockVideo],
      count: 1,
    });

    mockRedirect.mockImplementation((status: number, location: string) => {
      // SvelteKit's redirect throws a Response object
      throw new Response(null, {
        status,
        headers: { Location: location },
      });
    });

    mockIsSource.mockReturnValue(true);
    mockIsVideoFilter.mockReturnValue(true);
    mockGetPaginationQueryParams.mockReturnValue(1);
  });

  it("loads videos successfully for valid source", async () => {
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
      params: { source: "giantbomb" },
      routeId: "/[source]/latest",
      url: new URL("http://localhost:3000/giantbomb/latest"),
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.videos).toEqual([mockVideo]);
    expect(result.videosCount).toBe(1);
    expect(result.source).toBe("giantbomb");
    expect(result.contentFilter).toEqual(createVideoFilter());
    expect(result.playlists).toEqual([]);

    expect(mockIsSource).toHaveBeenCalledWith("giantbomb");
    expect(mockGetVideos).toHaveBeenCalledWith({
      source: "giantbomb",
      currentPage: 1,
      limit: 50,
      contentFilter: createVideoFilter(),
      supabase: expect.any(Object),
      session: mockSession,
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
      routeId: "/[source]/latest",
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
    expect(mockIsSource).toHaveBeenCalledWith("invalid-source");
  });

  it("redirects to home when source parameter is missing", async () => {
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
      params: { source: undefined as any },
      routeId: "/[source]/latest",
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

  it("throws error when content filter is not a video filter", async () => {
    const { load } = await loadModule();

    mockIsVideoFilter.mockReturnValue(false);

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createVideoFilter(), // Still provide a valid filter
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
      routeId: "/[source]/latest",
    });

    await expect(load(mockEvent)).rejects.toThrow("Invalid content filter");
  });

  it("handles pagination correctly", async () => {
    const { load } = await loadModule();

    mockGetPaginationQueryParams.mockReturnValue(3);

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
      routeId: "/[source]/latest",
      url: new URL("http://localhost:3000/nextlander/latest?page=3"),
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(mockGetPaginationQueryParams).toHaveBeenCalledWith({
      searchParams: mockEvent.url.searchParams,
    });
    expect(mockGetVideos).toHaveBeenCalledWith({
      source: "nextlander",
      currentPage: 3,
      limit: 50,
      contentFilter: createVideoFilter(),
      supabase: expect.any(Object),
      session: mockSession,
    });
  });

  it("works with different valid sources", async () => {
    const { load } = await loadModule();

    const sources = ["giantbomb", "nextlander", "jeffgerstmann", "remap"];

    for (const source of sources) {
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
        params: { source },
        routeId: "/[source]/latest",
      });

      const result = await load(mockEvent);

      expect(result.source).toBe(source);
      expect(mockIsSource).toHaveBeenCalledWith(source);
    }
  });

  it("handles empty video results", async () => {
    const { load } = await loadModule();

    mockGetVideos.mockResolvedValue({
      videos: [],
      count: 0,
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
      params: { source: "remap" },
      routeId: "/[source]/latest",
    });

    const result = await load(mockEvent);

    expect(result.videos).toEqual([]);
    expect(result.videosCount).toBe(0);
  });

  it("handles null video results", async () => {
    const { load } = await loadModule();

    mockGetVideos.mockResolvedValue({
      videos: null,
      count: 0,
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
      params: { source: "jeffgerstmann" },
      routeId: "/[source]/latest",
    });

    const result = await load(mockEvent);

    expect(result.videos).toEqual([]);
  });

  it("handles database errors gracefully", async () => {
    const { load } = await loadModule();

    mockGetVideos.mockRejectedValue(new Error("Database connection failed"));

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
      routeId: "/[source]/latest",
    });

    await expect(load(mockEvent)).rejects.toThrow("Database connection failed");
  });
});