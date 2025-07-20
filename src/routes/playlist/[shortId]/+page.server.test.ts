import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockLoadEvent,
  createVideoFilter,
  type BaseParentData,
} from "../../../tests/mocks/sveltekit";
import { mockSession } from "../../../tests/mocks/auth";
import { mockVideo } from "../../../tests/mocks/videos";
import { mockPlaylist } from "../../../tests/mocks/playlists";
import { setupTest } from "../../../tests/utils/test-setup";

// Hoist the mocks to the top level to avoid scope issues
const { 
  mockGetPlaylistByShortId,
  mockGetPlaylistVideos,
  mockGetPlaylistTotalDuration,
  mockIsUserPlaylist,
  mockSuperValidate,
  mockIsPlaylistVideosFilter,
  mockGetCroppedPlaylistImageUrlServer,
  mockParseImageProperties,
  mockGetPaginationQueryParams
} = vi.hoisted(() => ({
  mockGetPlaylistByShortId: vi.fn(),
  mockGetPlaylistVideos: vi.fn(),
  mockGetPlaylistTotalDuration: vi.fn(),
  mockIsUserPlaylist: vi.fn(),
  mockSuperValidate: vi.fn(),
  mockIsPlaylistVideosFilter: vi.fn(),
  mockGetCroppedPlaylistImageUrlServer: vi.fn(),
  mockParseImageProperties: vi.fn(),
  mockGetPaginationQueryParams: vi.fn(),
}));

// Mock the dependencies at the top level
vi.mock("$lib/supabase/playlists", () => ({
  getPlaylistByShortId: mockGetPlaylistByShortId,
  getPlaylistVideos: mockGetPlaylistVideos,
  getPlaylistTotalDuration: mockGetPlaylistTotalDuration,
  isUserPlaylist: mockIsUserPlaylist,
}));

vi.mock("sveltekit-superforms", () => ({
  superValidate: mockSuperValidate,
}));

vi.mock("$lib/components/content/content-filter", () => ({
  isPlaylistVideosFilter: mockIsPlaylistVideosFilter,
}));

vi.mock("$lib/server/image-processing", () => ({
  getCroppedPlaylistImageUrlServer: mockGetCroppedPlaylistImageUrlServer,
}));

vi.mock("$lib/components/playlist/playlist", () => ({
  parseImageProperties: mockParseImageProperties,
}));

vi.mock("$lib/components/pagination/pagination", () => ({
  getPaginationQueryParams: mockGetPaginationQueryParams,
}));

vi.mock("sveltekit-superforms/adapters", () => ({
  zod: vi.fn(),
}));

vi.mock("./schema", () => ({
  playlistSchema: {},
}));

vi.mock("$lib/supabase/videos", () => ({
  DEFAULT_NUM_VIDEOS_PAGINATION: 50,
}));

vi.mock("bad-words", () => ({
  Filter: vi.fn(),
}));

vi.mock("sveltekit-flash-message/server", () => ({
  redirect: vi.fn(),
  setFlash: vi.fn(),
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+page.server");

describe("playlist/[shortId]/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    mockGetPlaylistByShortId.mockResolvedValue({
      playlist: mockPlaylist,
    });

    mockGetPlaylistVideos.mockResolvedValue({
      videos: [mockVideo],
      count: 1,
    });

    mockGetPlaylistTotalDuration.mockResolvedValue({
      totalDuration: 3600,
    });

    mockIsUserPlaylist.mockReturnValue(true);
    mockSuperValidate.mockResolvedValue({
      valid: true,
      data: {},
      errors: {},
    });
    mockIsPlaylistVideosFilter.mockReturnValue(true);
    mockGetCroppedPlaylistImageUrlServer.mockResolvedValue("http://localhost/image.jpg");
    mockParseImageProperties.mockReturnValue(null);
    mockGetPaginationQueryParams.mockReturnValue(1);
  });

  it("loads playlist data successfully", async () => {
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
      params: { shortId: "test-123" },
      routeId: "/playlist/[shortId]",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.playlist).toBeDefined();
    expect(result.videos).toEqual([mockVideo]);
    expect(result.videosCount).toBe(1);
    expect(result.totalDuration).toBe(3600);

    expect(mockGetPlaylistByShortId).toHaveBeenCalledWith({
      shortId: "test-123",
      supabase: expect.any(Object),
    });
  });

  it("handles missing playlist correctly", async () => {
    const { load } = await loadModule();

    mockGetPlaylistByShortId.mockResolvedValue({
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
      params: { shortId: "nonexistent" },
      routeId: "/playlist/[shortId]",
    });

    await expect(load(mockEvent)).rejects.toThrow();
  });

  it("handles database errors gracefully", async () => {
    const { load } = await loadModule();

    mockGetPlaylistByShortId.mockRejectedValue(new Error("Database error"));

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
      params: { shortId: "test-123" },
      routeId: "/playlist/[shortId]",
    });

    await expect(load(mockEvent)).rejects.toThrow("Database error");
  });
});