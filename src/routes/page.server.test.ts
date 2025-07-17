import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Video, VideoWithTimestamp } from "$lib/supabase/videos";
import type { Database } from "$lib/supabase/database.types";
import type { Playlist } from "$lib/supabase/playlists";
import type { Source } from "$lib/constants/source";
import type { PageServerLoad } from "./$types";

// Mock the external dependencies BEFORE importing the module under test
vi.mock("$lib/supabase/videos", () => ({
  getVideos: vi.fn(),
  getInProgressVideos: vi.fn(),
  DEFAULT_NUM_VIDEOS_OVERVIEW: 30,
}));

vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual("@sveltejs/kit");
  return {
    ...actual,
    redirect: vi.fn(),
  };
});

// Now import the module under test AFTER the mocks are set up
const { load } = await import("./+page.server");

// Create proper mock types that match the Locals interface
const mockUser: User = {
  id: "test-user-id",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2023-01-01T00:00:00Z",
};

const mockSession: Session = {
  user: mockUser,
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  expires_at: Date.now() / 1000 + 3600,
};

const mockSupabaseClient = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn(),
  },
  rpc: vi.fn(),
  supabaseUrl: "https://test.supabase.co",
  supabaseKey: "test-key",
  realtime: {},
  realtimeUrl: "wss://test.supabase.co",
  restUrl: "https://test.supabase.co/rest/v1",
  storageUrl: "https://test.supabase.co/storage/v1",
  schema: "public",
  headers: {},
  fetch: fetch,
  shouldThrowOnError: false,
  apikey: "test-key",
  storage: {},
  functions: {},
  channel: vi.fn(),
  getChannels: vi.fn(),
  removeChannel: vi.fn(),
  removeAllChannels: vi.fn(),
  postgrest: {},
  rest: {},
} as unknown as SupabaseClient<Database>;

const mockVideo: Video = {
  id: "test-video-1",
  title: "Test Video",
  description: "Test Description",
  thumbnail_url: "https://example.com/thumb.jpg",
  thumbnail_maxres_url: "https://example.com/maxres.jpg",
  duration: "3600",
  source: "giantbomb" as Source,
  published_at: "2023-01-01T00:00:00Z",
};

const mockVideoWithTimestamp: VideoWithTimestamp = {
  ...mockVideo,
  video_start_seconds: 100,
  updated_at: "2023-01-01T00:00:00Z",
  watched_at: "2023-01-01T00:00:00Z", // Added missing property
};

const mockPlaylist: Playlist = {
  id: 1,
  name: "Test Playlist",
  description: "Test Description",
  created_by: "test-user-id",
  created_at: "2023-01-01T00:00:00Z",
  short_id: "abc123",
  type: "Private",
  youtube_id: null,
  thumbnail_url: null,
  thumbnail_maxres_url: null,
  image_properties: null,
};

// Helper function to create a properly typed load event
function createMockLoadEvent(
  overrides: {
    session?: Session | null;
    url?: URL;
  } = {},
): Parameters<PageServerLoad>[0] {
  const session = overrides.session ?? mockSession;
  const user = session?.user ?? null;

  const mockParentData = {
    session,
    contentFilter: {
      sort: { key: "datePublished", order: "descending" },
      type: "video",
    },
    playlists: [mockPlaylist],
    playlistsCount: 1,
    userProfile: null,
    cookies: [],
    layout: "default",
  };

  // Create locals that match the App.Locals interface
  const locals: App.Locals = {
    supabase: mockSupabaseClient,
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
    params: {},
    request: new Request("http://localhost:3000"),
    route: { id: "/" as const }, // Fixed route ID type
    url: overrides.url ?? new URL("http://localhost:3000"),
    parent: vi.fn().mockResolvedValue(mockParentData),
    depends: vi.fn(),
    untrack: vi.fn(),
    fetch: vi.fn().mockResolvedValue(new Response()),
    getClientAddress: vi.fn().mockReturnValue("127.0.0.1"),
    isDataRequest: false,
    isSubRequest: false,
    platform: undefined,
    setHeaders: vi.fn(),
  };
}

describe("+page.server.ts load function", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset all mocks to their default successful state
    const { getVideos, getInProgressVideos } = await import(
      "$lib/supabase/videos"
    );

    vi.mocked(getVideos).mockResolvedValue({
      videos: [mockVideo],
      count: 1,
      error: null,
    });

    vi.mocked(getInProgressVideos).mockResolvedValue({
      videos: [mockVideoWithTimestamp],
      count: 1,
      error: null,
    });
  });

  it("loads data successfully with authenticated user", async () => {
    const mockEvent = createMockLoadEvent({
      session: mockSession,
      url: new URL("http://localhost:3000"),
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result).not.toBeUndefined();

    // Type assertion to let TypeScript know this is the expected return type
    const typedResult = result as Awaited<ReturnType<PageServerLoad>>;

    if (typedResult) {
      expect(typedResult.sourceVideos).toBeDefined();
      expect(typedResult.continueWatchingVideos).toBeDefined();
      expect(typedResult.sourceVideosContentFilters).toBeDefined();
      expect(typedResult.continueWatchingContentFilters).toBeDefined();
      expect(typedResult.playlists).toBeDefined();

      // Check that all sources are included
      expect(typedResult.sourceVideos).toHaveProperty("giantbomb");
      expect(typedResult.sourceVideos).toHaveProperty("nextlander");
      expect(typedResult.sourceVideos).toHaveProperty("remap");
    }
  });

  it("loads data successfully without authenticated user", async () => {
    const mockEvent = createMockLoadEvent({
      session: null,
    });

    // Override parent data for unauthenticated user
    mockEvent.parent = vi.fn().mockResolvedValue({
      session: null,
      contentFilter: {
        sort: { key: "datePublished", order: "descending" },
        type: "video",
      },
      playlists: [],
      playlistsCount: 0,
      userProfile: null,
      cookies: [],
      layout: "default",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result).not.toBeUndefined();

    const typedResult = result as Awaited<ReturnType<PageServerLoad>>;

    expect(typedResult.sourceVideos).toBeDefined();
    expect(typedResult.continueWatchingVideos).toBeDefined();
  });

  it("handles parallel video fetching correctly", async () => {
    const { getVideos } = await import("$lib/supabase/videos");

    // Mock different videos for different sources
    const giantbombVideo: Video = {
      ...mockVideo,
      source: "giantbomb",
      id: "gb-1",
    };
    const nextlanderVideo: Video = {
      ...mockVideo,
      source: "nextlander",
      id: "nl-1",
    };
    const remapVideo: Video = { ...mockVideo, source: "remap", id: "remap-1" };

    // Mock getVideos to return different videos based on source
    vi.mocked(getVideos).mockImplementation(async ({ source }) => {
      switch (source) {
        case "giantbomb":
          return { videos: [giantbombVideo], count: 1, error: null };
        case "nextlander":
          return { videos: [nextlanderVideo], count: 1, error: null };
        case "remap":
          return { videos: [remapVideo], count: 1, error: null };
        default:
          return { videos: [], count: 0, error: null };
      }
    });

    const mockEvent = createMockLoadEvent();
    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result).not.toBeUndefined();

    const typedResult = result as Awaited<ReturnType<PageServerLoad>>;

    expect(typedResult.sourceVideos.giantbomb).toEqual([giantbombVideo]);
    expect(typedResult.sourceVideos.nextlander).toEqual([nextlanderVideo]);
    expect(typedResult.sourceVideos.remap).toEqual([remapVideo]);
  });

  it("handles video fetching errors gracefully", async () => {
    const { getVideos } = await import("$lib/supabase/videos");

    // Override the default mock for this specific test
    vi.mocked(getVideos).mockRejectedValue(new Error("Database error"));

    const mockEvent = createMockLoadEvent();

    // The test should expect the error to be thrown
    await expect(load(mockEvent)).rejects.toThrow("Database error");
  });

  it("handles continue watching errors gracefully", async () => {
    const { getInProgressVideos } = await import("$lib/supabase/videos");

    // getInProgressVideos fails
    vi.mocked(getInProgressVideos).mockRejectedValue(
      new Error("Continue watching error"),
    );

    const mockEvent = createMockLoadEvent();

    // The test should expect the error to be thrown
    await expect(load(mockEvent)).rejects.toThrow("Continue watching error");
  });
});
