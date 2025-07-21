import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockLoadEvent,
  createVideoFilter,
  type BaseParentData,
} from "../../../../src/tests/mocks/sveltekit";
import { mockSession } from "../../../../src/tests/mocks/auth";
import { mockVideo } from "../../../../src/tests/mocks/videos";
import { mockPlaylist } from "../../../../src/tests/mocks/playlists";
import { setupTest } from "../../../../src/tests/utils/test-setup";

// Hoist the mocks
const { mockGetVideos, mockSearchPlaylists } = vi.hoisted(() => ({
  mockGetVideos: vi.fn(),
  mockSearchPlaylists: vi.fn(),
}));

const { mockIsVideoFilter, mockGetPaginationQueryParams } = vi.hoisted(() => ({
  mockIsVideoFilter: vi.fn(),
  mockGetPaginationQueryParams: vi.fn(),
}));

const { mockGetCroppedPlaylistImageUrlServer, mockParseImageProperties } =
  vi.hoisted(() => ({
    mockGetCroppedPlaylistImageUrlServer: vi.fn(),
    mockParseImageProperties: vi.fn(),
  }));

// Mock the dependencies
vi.mock("$lib/supabase/videos", () => ({
  getVideos: mockGetVideos,
  DEFAULT_NUM_VIDEOS_PAGINATION: 50,
}));

vi.mock("$lib/supabase/playlists", () => ({
  searchPlaylists: mockSearchPlaylists,
}));

vi.mock("$lib/components/content/content-filter", () => ({
  isVideoFilter: mockIsVideoFilter,
}));

vi.mock("$lib/components/pagination/pagination", () => ({
  getPaginationQueryParams: mockGetPaginationQueryParams,
}));

vi.mock("$lib/server/image-processing", () => ({
  getCroppedPlaylistImageUrlServer: mockGetCroppedPlaylistImageUrlServer,
}));

vi.mock("$lib/components/playlist/playlist", () => ({
  parseImageProperties: mockParseImageProperties,
}));

vi.mock("$lib/constants/source", () => ({
  SOURCES: ["giantbomb", "jeffgerstmann", "nextlander", "remap"],
}));

const loadModule = () => import("./+page.server");

describe("search/[query]/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    mockGetVideos.mockResolvedValue({
      videos: [mockVideo],
      count: 1,
    });
    mockSearchPlaylists.mockResolvedValue({
      playlists: [mockPlaylist],
      count: 1,
    });
    mockIsVideoFilter.mockReturnValue(true);
    mockGetPaginationQueryParams.mockReturnValue(1);
    mockGetCroppedPlaylistImageUrlServer.mockResolvedValue(
      "http://localhost/image.jpg",
    );
    mockParseImageProperties.mockReturnValue(null);
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
    expect(result.sourceVideos).toBeDefined();
    expect(result.searchString).toBe("mario");
    expect(result.playlistSearchResults).toBeDefined();
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
