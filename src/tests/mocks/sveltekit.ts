import { vi } from "vitest";
import type { ServerLoadEvent } from "@sveltejs/kit";
import type { Session } from "@supabase/supabase-js";
import type { UserPlaylist } from "$lib/supabase/playlists";
import { mockSession } from "./auth";
import { createMockSupabaseClient } from "./supabase";
import type {
  CombinedContentFilter,
  PlaylistVideosFilter,
  TimestampFilter,
  VideoFilter,
} from "$lib/components/content/content-filter";

// Define the correct UserProfile type based on the error message
export interface UserProfile {
  id: string;
  username: string | null;
  sources: ("giantbomb" | "nextlander" | "jeffgerstmann" | "remap")[] | null;
  content_description: "FULL" | "BRIEF" | "NONE" | null;
  content_display: "TILES" | "TABLE" | null;
}

export interface CookieData {
  name: string;
  value: string;
  options?: {
    domain?: string;
    path?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "strict" | "lax" | "none";
  };
}

// Use the actual parent data type that matches your route
export interface BaseParentData {
  session: Session | null;
  contentFilter: CombinedContentFilter;
  playlists: UserPlaylist[];
  userPlaylistsCount: number;
  userProfile: UserProfile | null;
  cookies: CookieData[];
  layout: string | undefined;
}

export const mockAppMocks = () => {
  vi.mock("$app/navigation", () => ({
    invalidate: vi.fn(),
  }));

  vi.mock("$app/state", () => ({
    page: {
      url: new URL("http://localhost:3000"),
    },
  }));

  vi.mock("$lib/state/content.svelte.js", () => ({
    getContentState: vi.fn(() => ({
      selectedVideosBySection: {
        giantbomb: [],
        jeffgerstmann: [],
        nextlander: [],
        remap: [],
        continueWatching: [],
      },
    })),
  }));

  vi.mock("$lib/components/content/content.svelte", () => ({
    default: vi.fn(() => ({
      render: () => ({ html: "<div>Mocked Content Component</div>" }),
      $$: {},
    })),
  }));

  vi.mock("@supabase/ssr", () => ({
    isBrowser: vi.fn(() => false),
  }));
};

export const createMockLoadEvent = <
  TParams extends Record<string, string> = Record<string, string>,
  TParentData extends BaseParentData = BaseParentData,
  TRouteId extends string = "/",
>(
  overrides: {
    session?: Session | null;
    url?: URL;
    params?: TParams;
    parentData?: TParentData;
    routeId?: TRouteId;
  } = {},
): ServerLoadEvent<TParams, TParentData, TRouteId> => {
  const session = overrides.session ?? mockSession;
  const user = session?.user ?? null;

  // Create a proper VideoFilter with the correct sort key type
  const defaultContentFilter: VideoFilter = {
    sort: { key: "datePublished", order: "descending" },
    type: "video",
  };

  const defaultParentData: BaseParentData = {
    session,
    contentFilter: defaultContentFilter,
    playlists: [],
    userPlaylistsCount: 0,
    userProfile: null,
    cookies: [],
    layout: "default",
  };

  const parentData = overrides.parentData ?? (defaultParentData as TParentData);

  const locals: App.Locals = {
    supabase: createMockSupabaseClient(),
    session,
    user,
    safeGetSession: vi.fn().mockResolvedValue({ session, user }),
  };

  return {
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
      getAll: vi.fn(),
    },
    locals,
    params: overrides.params ?? ({} as TParams),
    request: new Request("http://localhost:3000"),
    route: { id: overrides.routeId ?? ("/" as TRouteId) },
    url: overrides.url ?? new URL("http://localhost:3000"),
    parent: vi.fn().mockResolvedValue(parentData),
    depends: vi.fn(),
    untrack: vi.fn(),
    fetch: vi.fn().mockResolvedValue(new Response()),
    getClientAddress: vi.fn().mockReturnValue("127.0.0.1"),
    isDataRequest: false,
    isSubRequest: false,
    platform: undefined,
    setHeaders: vi.fn(),
  } as ServerLoadEvent<TParams, TParentData, TRouteId>;
};

// Helper functions to create specific filter types
export const createVideoFilter = (
  overrides: Partial<VideoFilter> = {},
): VideoFilter => ({
  sort: { key: "datePublished", order: "descending" },
  type: "video",
  ...overrides,
});

export const createTimestampFilter = (
  overrides: Partial<TimestampFilter> = {},
): TimestampFilter => ({
  sort: { key: "dateTimestamp", order: "descending" },
  type: "timestamp",
  ...overrides,
});

export const createPlaylistVideosFilter = (
  overrides: Partial<PlaylistVideosFilter> = {},
): PlaylistVideosFilter => ({
  sort: { key: "datePublished", order: "descending" },
  type: "playlist",
  ...overrides,
});

// Helper function to create a mock UserPlaylist with the correct structure
export const createMockUserPlaylist = (
  overrides: Partial<UserPlaylist> = {},
): UserPlaylist => ({
  id: 1,
  name: "Test Playlist",
  description: "Test Description",
  created_by: "test-user",
  created_at: "2025-07-17T19:21:09Z",
  short_id: "test-123",
  type: "Private",
  profile_username: "testuser",
  youtube_id: null,
  thumbnail_url: null,
  thumbnail_maxres_url: null,
  image_properties: null,
  playlist_position: null,
  sort_order: "ascending",
  sorted_by: "title",
  ...overrides,
});

// Helper function to create a mock UserProfile with the correct structure
export const createMockUserProfile = (
  overrides: Partial<UserProfile> = {},
): UserProfile => ({
  id: "test-user-id",
  username: "testuser",
  sources: ["giantbomb", "nextlander"],
  content_description: "FULL",
  content_display: "TILES",
  ...overrides,
});
