import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import Page from "./+page.svelte";
import { page } from "$app/state";
import { invalidate } from "$app/navigation";
import { SOURCES, SOURCE_INFO } from "$lib/constants/source";
import type { Video } from "$lib/supabase/videos.js";
import type { PageData } from "./$types.js";
import type { User } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock dependencies
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
  default: vi.fn(() => {
    // Return a mock Svelte component
    return {
      render: () => ({ html: "<div>Mocked Content Component</div>" }),
      $$: {},
    };
  }),
}));

vi.mock("@supabase/ssr", () => ({
  isBrowser: vi.fn(() => false),
}));

const mockVideo: Video = {
  id: "video-1",
  title: "Test Video",
  description: "Test Description",
  thumbnail_url: "https://example.com/thumb1.jpg",
  thumbnail_maxres_url: "https://example.com/thumbmax1.jpg",
  published_at: "2023-01-01",
  duration: "3600",
  source: "giantbomb",
};

const mockVideoWithTimestamp = {
  ...mockVideo,
  updated_at: "2023-01-01T00:00:00Z",
  video_start_seconds: 100,
  watched_at: "2023-01-01T00:00:00Z",
};

const mockUser: User = {
  id: "user-1",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2023-01-01T00:00:00Z",
  email: "test@example.com",
};

const mockSession: Session = {
  user: mockUser,
  access_token: "mock-token",
  refresh_token: "mock-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  expires_at: Date.now() / 1000 + 3600,
};

const mockSupabase = {} as SupabaseClient<never, "public", never>;

const mockUserProfile = {
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

const mockPageData: PageData = {
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
  playlists: [],
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
  playlistsCount: 0,
  isSidebarCollapsed: false,
};

describe("Page Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the page with latest videos section", () => {
    const { container } = render(Page, { data: mockPageData });

    expect(screen.getByText("Latest Videos")).toBeDefined();
    expect(container.innerHTML).toContain("Latest Videos");
  });

  it("does not render continue watching section when no continue watching videos", () => {
    render(Page, { data: mockPageData });

    expect(screen.queryByText("Continue Watching")).toBeNull();
  });

  it("renders continue watching section when videos are present and user is logged in", () => {
    const dataWithContinueVideos = {
      ...mockPageData,
      continueWatchingVideos: [mockVideoWithTimestamp],
    };

    render(Page, { data: dataWithContinueVideos });

    expect(screen.getByText("Continue Watching")).toBeDefined();
  });

  it("does not render continue watching section when user is not logged in", () => {
    const dataWithoutSession = {
      ...mockPageData,
      session: null,
      continueWatchingVideos: [mockVideoWithTimestamp],
    };

    render(Page, { data: dataWithoutSession });

    expect(screen.queryByText("Continue Watching")).toBeNull();
  });

  it("renders source sections based on user profile sources", () => {
    render(Page, { data: mockPageData });

    // Should render sections for sources in user profile
    expect(screen.getByText(SOURCE_INFO.giantbomb.displayName)).toBeDefined();
    expect(
      screen.getByText(SOURCE_INFO.jeffgerstmann.displayName),
    ).toBeDefined();
  });

  it("uses default SOURCES when user profile has no sources", () => {
    const dataWithoutUserSources = {
      ...mockPageData,
      userProfile: {
        ...mockPageData.userProfile!,
        sources: null,
      },
    };

    render(Page, { data: dataWithoutUserSources });

    // Should render all default sources
    SOURCES.forEach((source) => {
      expect(screen.getByText(SOURCE_INFO[source].displayName)).toBeDefined();
    });
  });

  it("invalidates data when oauth code is present in URL", async () => {
    const { isBrowser } = await import("@supabase/ssr");
    vi.mocked(isBrowser).mockReturnValue(true);

    // Mock page.url with code parameter
    vi.mocked(page).url = new URL("http://localhost:3000?code=oauth_code");

    render(Page, { data: mockPageData });

    expect(invalidate).toHaveBeenCalledWith("supabase:db:playlists");
    expect(invalidate).toHaveBeenCalledWith("supabase:db:videos");
  });

  it("does not invalidate when no oauth code is present", async () => {
    const { isBrowser } = await import("@supabase/ssr");
    vi.mocked(isBrowser).mockReturnValue(true);

    // Mock page.url without code parameter
    vi.mocked(page).url = new URL("http://localhost:3000");

    render(Page, { data: mockPageData });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("applies correct CSS classes based on continue watching videos presence", () => {
    render(Page, { data: mockPageData });

    const header = screen.getByText("Latest Videos");
    expect(header.classList.contains("mt-4")).toBe(true);
  });

  it("applies different CSS classes when continue watching videos are present", () => {
    const dataWithContinueVideos = {
      ...mockPageData,
      continueWatchingVideos: [mockVideoWithTimestamp],
    };

    render(Page, { data: dataWithContinueVideos });

    const header = screen.getByText("Latest Videos");
    expect(header.classList.contains("mt-2")).toBe(true);
  });

  it("component initializes without errors", () => {
    const { container } = render(Page, { data: mockPageData });

    // Verify the component is created successfully
    expect(container).toBeDefined();
    expect(screen.getByText("Latest Videos")).toBeDefined();
  });
});
