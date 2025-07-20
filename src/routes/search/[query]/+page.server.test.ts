import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockLoadEvent,
  createVideoFilter,
  type BaseParentData,
} from "../../../../tests/mocks/sveltekit";
import { mockSession } from "../../../../tests/mocks/auth";
import { mockVideo } from "../../../../tests/mocks/videos";
import { setupTest } from "../../../../tests/utils/test-setup";

// Hoist the mocks
const { mockGetVideos } = vi.hoisted(() => ({
  mockGetVideos: vi.fn(),
}));

const { mockIsVideoFilter, mockGetPaginationQueryParams } = vi.hoisted(() => ({
  mockIsVideoFilter: vi.fn(),
  mockGetPaginationQueryParams: vi.fn(),
}));

// Mock the dependencies
vi.mock("$lib/supabase/videos", () => ({
  getVideos: mockGetVideos,
  DEFAULT_NUM_VIDEOS_PAGINATION: 50,
}));

vi.mock("$lib/components/content/content-filter", () => ({
  isVideoFilter: mockIsVideoFilter,
}));

vi.mock("$lib/components/pagination/pagination", () => ({
  getPaginationQueryParams: mockGetPaginationQueryParams,
}));

const loadModule = () => import("./+page.server");

describe("search/[query]/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    mockGetVideos.mockResolvedValue({
      videos: [mockVideo],
      count: 1,
    });
    mockIsVideoFilter.mockReturnValue(true);
    mockGetPaginationQueryParams.mockReturnValue(1);
  });

  it("loads search results successfully", async () => {
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
      params: { query: "mario" },
      routeId: "/search/[query]",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.videos).toEqual([mockVideo]);
    expect(result.searchString).toBe("mario");
  });

  it("throws error when content filter is invalid", async () => {
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
      params: { query: "mario" },
      routeId: "/search/[query]",
    });

    await expect(load(mockEvent)).rejects.toThrow("Invalid content filter");
  });
});