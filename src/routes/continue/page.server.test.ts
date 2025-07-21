import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockLoadEvent,
  createTimestampFilter,
  type BaseParentData,
} from "../../tests/mocks/sveltekit";
import { mockSession } from "../../tests/mocks/auth";
import { mockVideoWithTimestamp } from "../../tests/mocks/videos";
import { setupTest } from "../../tests/utils/test-setup";

// Hoist the mocks to the top level to avoid scope issues
const { mockGetInProgressVideos } = vi.hoisted(() => ({
  mockGetInProgressVideos: vi.fn(),
}));

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
}));

const { mockGetPaginationQueryParams } = vi.hoisted(() => ({
  mockGetPaginationQueryParams: vi.fn(),
}));

const { mockIsTimestampFilter } = vi.hoisted(() => ({
  mockIsTimestampFilter: vi.fn(),
}));

// Mock the dependencies at the top level
vi.mock("$lib/supabase/videos", () => ({
  getInProgressVideos: mockGetInProgressVideos,
}));

vi.mock("@sveltejs/kit", () => ({
  redirect: mockRedirect,
}));

vi.mock("$lib/components/pagination/pagination", () => ({
  getPaginationQueryParams: mockGetPaginationQueryParams,
}));

vi.mock("$lib/components/content/content-filter", () => ({
  isTimestampFilter: mockIsTimestampFilter,
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+page.server");

describe("continue/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    // Reset to default successful implementation
    mockGetInProgressVideos.mockResolvedValue({
      videos: [mockVideoWithTimestamp],
      count: 1,
    });

    mockRedirect.mockImplementation((status: number, location: string) => {
      // SvelteKit's redirect throws a Response object
      throw new Response(null, {
        status,
        headers: { Location: location },
      });
    });

    mockGetPaginationQueryParams.mockReturnValue(1);
    mockIsTimestampFilter.mockReturnValue(true);
  });

  it("loads continue watching videos successfully with authenticated user", async () => {
    const { load } = await loadModule();

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createTimestampFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      routeId: "/continue",
      url: new URL("http://localhost:3000/continue"),
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.videos).toEqual([mockVideoWithTimestamp]);
    expect(result.videosCount).toBe(1);
    expect(result.contentFilter).toEqual(createTimestampFilter());
    expect(result.playlists).toEqual([]);

    expect(mockGetInProgressVideos).toHaveBeenCalledWith({
      currentPage: 1,
      contentFilter: createTimestampFilter(),
      supabase: expect.any(Object),
      session: mockSession,
    });
  });

  it("redirects to home when user is not authenticated", async () => {
    const { load } = await loadModule();

    const parentData: BaseParentData = {
      session: null,
      contentFilter: createTimestampFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      parentData,
      routeId: "/continue",
    });

    // Manually override the session in locals to be null for this test
    mockEvent.locals.session = null;
    mockEvent.locals.user = null;

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

  it("handles pagination correctly", async () => {
    const { load } = await loadModule();

    // Mock pagination to return page 2
    mockGetPaginationQueryParams.mockReturnValue(2);

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createTimestampFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      routeId: "/continue",
      url: new URL("http://localhost:3000/continue?page=2"),
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(mockGetPaginationQueryParams).toHaveBeenCalledWith({
      searchParams: mockEvent.url.searchParams,
    });
    expect(mockGetInProgressVideos).toHaveBeenCalledWith({
      currentPage: 2,
      contentFilter: createTimestampFilter(),
      supabase: expect.any(Object),
      session: mockSession,
    });
  });

  it("throws error when content filter is not a timestamp filter", async () => {
    const { load } = await loadModule();

    // Mock isTimestampFilter to return false
    mockIsTimestampFilter.mockReturnValue(false);

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createTimestampFilter(), // Still provide a valid filter
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      routeId: "/continue",
    });

    await expect(load(mockEvent)).rejects.toThrow("Invalid content filter");
  });

  it("handles empty continue watching videos", async () => {
    const { load } = await loadModule();

    mockGetInProgressVideos.mockResolvedValue({
      videos: [],
      count: 0,
    });

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createTimestampFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      routeId: "/continue",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.videos).toEqual([]);
    expect(result.videosCount).toBe(0);
  });

  it("handles null videos from getInProgressVideos", async () => {
    const { load } = await loadModule();

    mockGetInProgressVideos.mockResolvedValue({
      videos: null,
      count: 0,
    });

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createTimestampFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      routeId: "/continue",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.videos).toEqual([]);
  });

  it("handles database errors gracefully", async () => {
    const { load } = await loadModule();

    mockGetInProgressVideos.mockRejectedValue(new Error("Database error"));

    const parentData: BaseParentData = {
      session: mockSession,
      contentFilter: createTimestampFilter(),
      playlists: [],
      userPlaylistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    };

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      parentData,
      routeId: "/continue",
    });

    await expect(load(mockEvent)).rejects.toThrow("Database error");
  });
});
