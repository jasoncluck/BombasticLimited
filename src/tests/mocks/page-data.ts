import { mockUser, mockSession } from "./auth";
import { mockSupabase } from "./supabase";
import { mockVideo } from "./videos";
import { mockPlaylist } from "./playlists";
import type { PageData } from "../../routes/$types";

export const mockUserProfile = {
  id: "user-1",
  sources: ["giantbomb", "jeffgerstmann"] as (
    | "giantbomb"
    | "nextlander"
    | "jeffgerstmann"
    | "remap"
  )[],
  content_description: "FULL" as const,
  content_display: "TILES" as const,
  username: "testuser",
};

export const mockPageData: PageData = {
  sourceVideos: {
    giantbomb: [mockVideo],
    jeffgerstmann: [],
    nextlander: [],
    remap: [],
  },
  contentFilter: {
    sort: { key: "datePublished", order: "descending" },
    type: "video",
  },
  continueWatchingVideos: [],
  playlists: [mockPlaylist],
  userProfile: mockUserProfile,
  session: mockSession,
  supabase: mockSupabase,
  sourceVideosContentFilters: {
    sort: { key: "datePublished", order: "descending" },
    type: "video",
  },
  continueWatchingContentFilters: {
    sort: { key: "dateTimestamp", order: "descending" },
    type: "timestamp",
  },
  layout: "default",
  user: mockUser,
  playlistsCount: 1,
  isSidebarCollapsed: false,
};

export const createMockPageData = (
  overrides: Partial<PageData> = {},
): PageData => ({
  ...mockPageData,
  ...overrides,
});
