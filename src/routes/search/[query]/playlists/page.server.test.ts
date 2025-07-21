import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockLoadEvent,
  createVideoFilter,
  type BaseParentData,
} from "../../../../tests/mocks/sveltekit";
import { mockSession } from "../../../../tests/mocks/auth";
import { mockPlaylist } from "../../../../tests/mocks/playlists";
import { setupTest } from "../../../../tests/utils/test-setup";

// Hoist the mocks
const { mockSearchPlaylists } = vi.hoisted(() => ({
  mockSearchPlaylists: vi.fn(),
}));

const { mockIsVideoFilter, mockGetPaginationQueryParams } = vi.hoisted(() => ({
  mockIsVideoFilter: vi.fn(),
  mockGetPaginationQueryParams: vi.fn(),
}));

// Mock the dependencies
vi.mock("$lib/supabase/playlists", () => ({
  searchPlaylists: mockSearchPlaylists,
  DEFAULT_NUM_PLAYLISTS_PAGINATION: 50,
}));

vi.mock("$lib/components/content/content-filter", () => ({
  isVideoFilter: mockIsVideoFilter,
}));

vi.mock("$lib/components/pagination/pagination", () => ({
  getPaginationQueryParams: mockGetPaginationQueryParams,
}));

const loadModule = () => import("./+page.server");

describe("search/[query]/playlists/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    mockSearchPlaylists.mockResolvedValue({
      playlists: [mockPlaylist],
      count: 1,
    });
    mockIsVideoFilter.mockReturnValue(true);
    mockGetPaginationQueryParams.mockReturnValue(1);
  });

  it("loads playlist search results successfully", async () => {
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
      routeId: "/search/[query]/playlists",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.playlistResults).toEqual([mockPlaylist]);
    expect(result.playlistsCount).toBe(1);
  });
});
