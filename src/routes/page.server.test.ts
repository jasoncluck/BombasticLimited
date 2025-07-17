import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockLoadEvent,
  type BaseParentData,
  createVideoFilter,
} from "../tests/mocks/sveltekit";
import { mockSession } from "../tests/mocks/auth";
import { mockVideo, mockVideoWithTimestamp } from "../tests/mocks/videos";
import { setupTest } from "../tests/utils/test-setup";

// Hoist the mocks to the top level to avoid scope issues
const { mockGetVideos, mockGetInProgressVideos } = vi.hoisted(() => ({
  mockGetVideos: vi.fn(),
  mockGetInProgressVideos: vi.fn(),
}));

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
}));

// Mock the dependencies at the top level
vi.mock("$lib/supabase/videos", () => ({
  getVideos: mockGetVideos,
  getInProgressVideos: mockGetInProgressVideos,
  DEFAULT_NUM_VIDEOS_OVERVIEW: 30,
}));

vi.mock("@sveltejs/kit", () => ({
  redirect: mockRedirect,
}));

vi.mock("$lib/constants/source", () => ({
  SOURCES: ["giantbomb", "jeffgerstmann", "nextlander", "remap"],
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+page.server");

describe("+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    // Reset to default successful implementation
    mockGetVideos.mockResolvedValue({
      videos: [mockVideo],
      count: 1,
      error: null,
    });

    mockGetInProgressVideos.mockResolvedValue({
      videos: [mockVideoWithTimestamp],
      count: 1,
      error: null,
    });

    mockRedirect.mockImplementation((status, location) => {
      const error = new Error(`Redirect to ${location}`) as any;
      error.name = "Redirect";
      error.status = status;
      error.location = location;
      throw error;
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("loads data successfully with authenticated user", async () => {
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
      url: new URL("http://localhost:3000"),
      parentData,
      routeId: "/",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(mockGetVideos).toHaveBeenCalledTimes(4); // Should be called for each source
    expect(mockGetInProgressVideos).toHaveBeenCalledTimes(1);

    expect(result.sourceVideos).toBeDefined();
    expect(result.continueWatchingVideos).toBeDefined();
    expect(result.sourceVideosContentFilters).toBeDefined();
    expect(result.continueWatchingContentFilters).toBeDefined();
    expect(result.playlists).toBeDefined();

    // Check that all sources have videos
    expect(result.sourceVideos.giantbomb).toEqual([mockVideo]);
    expect(result.sourceVideos.jeffgerstmann).toEqual([mockVideo]);
    expect(result.sourceVideos.nextlander).toEqual([mockVideo]);
    expect(result.sourceVideos.remap).toEqual([mockVideo]);
  });

  it("loads data successfully without authenticated user", async () => {
    const { load } = await loadModule();

    const parentData: BaseParentData = {
      session: null,
      contentFilter: createVideoFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: null,
      parentData,
      routeId: "/",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(mockGetVideos).toHaveBeenCalledTimes(4);
    expect(mockGetInProgressVideos).toHaveBeenCalledTimes(1);

    expect(result.sourceVideos).toBeDefined();
    expect(result.continueWatchingVideos).toBeDefined();
  });

  it("handles parallel video fetching correctly", async () => {
    const { load } = await loadModule();

    // Mock specific videos for different sources
    const giantbombVideo = {
      ...mockVideo,
      source: "giantbomb" as const,
      id: "gb-1",
    };
    const nextlanderVideo = {
      ...mockVideo,
      source: "nextlander" as const,
      id: "nl-1",
    };
    const remapVideo = {
      ...mockVideo,
      source: "remap" as const,
      id: "remap-1",
    };
    const jeffgerstmannVideo = {
      ...mockVideo,
      source: "jeffgerstmann" as const,
      id: "jg-1",
    };

    // Override the default mock with specific implementation
    mockGetVideos.mockImplementation(({ source }) => {
      switch (source) {
        case "giantbomb":
          return Promise.resolve({
            videos: [giantbombVideo],
            count: 1,
            error: null,
          });
        case "nextlander":
          return Promise.resolve({
            videos: [nextlanderVideo],
            count: 1,
            error: null,
          });
        case "remap":
          return Promise.resolve({
            videos: [remapVideo],
            count: 1,
            error: null,
          });
        case "jeffgerstmann":
          return Promise.resolve({
            videos: [jeffgerstmannVideo],
            count: 1,
            error: null,
          });
        default:
          return Promise.resolve({ videos: [], count: 0, error: null });
      }
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
      parentData,
      routeId: "/",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.sourceVideos).toBeDefined();

    // Check that we have the correct videos for each source
    expect(result.sourceVideos.giantbomb).toEqual([giantbombVideo]);
    expect(result.sourceVideos.nextlander).toEqual([nextlanderVideo]);
    expect(result.sourceVideos.remap).toEqual([remapVideo]);
    expect(result.sourceVideos.jeffgerstmann).toEqual([jeffgerstmannVideo]);
  });

  it("handles video fetching errors gracefully", async () => {
    const { load } = await loadModule();

    // Override the default mock to throw an error
    mockGetVideos.mockImplementation(() => {
      return Promise.reject(new Error("Database error"));
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
      parentData,
      routeId: "/",
    });

    await expect(load(mockEvent)).rejects.toThrow("Database error");
  });

  it("handles continue watching errors gracefully", async () => {
    const { load } = await loadModule();

    // Override the default mock to throw an error
    mockGetInProgressVideos.mockImplementation(() => {
      return Promise.reject(new Error("Continue watching error"));
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
      parentData,
      routeId: "/",
    });

    await expect(load(mockEvent)).rejects.toThrow("Continue watching error");
  });

  it("redirects when error parameter is present in URL", async () => {
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
      parentData,
      routeId: "/",
      url: new URL("http://localhost:3000?error=true"),
    });

    await expect(load(mockEvent)).rejects.toThrow("Redirect to /auth/error");
    expect(mockRedirect).toHaveBeenCalledWith(303, "/auth/error");
  });

  it("properly structures the return data", async () => {
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
      parentData,
      routeId: "/",
    });

    const result = await load(mockEvent);

    // Check the structure matches what your page expects
    expect(result).toHaveProperty("sourceVideos");
    expect(result).toHaveProperty("sourceVideosContentFilters");
    expect(result).toHaveProperty("continueWatchingVideos");
    expect(result).toHaveProperty("continueWatchingContentFilters");
    expect(result).toHaveProperty("playlists");

    // Check that sourceVideos has the expected sources
    expect(result.sourceVideos).toHaveProperty("giantbomb");
    expect(result.sourceVideos).toHaveProperty("jeffgerstmann");
    expect(result.sourceVideos).toHaveProperty("nextlander");
    expect(result.sourceVideos).toHaveProperty("remap");

    // Check that filters have the correct structure
    expect(result.sourceVideosContentFilters.type).toBe("video");
    expect(result.continueWatchingContentFilters.type).toBe("timestamp");
  });
});
