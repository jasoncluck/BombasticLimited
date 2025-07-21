import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "./+page.svelte";
import { setupTest } from "../../tests/utils/test-setup";

// Mock streaming state
vi.mock("$lib/state/streaming.svelte", () => ({
  activeStreams: {
    sources: [],
  },
}));

// Mock playlist functions
vi.mock("$lib/components/playlist/playlist", () => ({
  handlePlaylistNavigation: vi.fn(),
}));

// Mock playlist queries
vi.mock("$lib/supabase/playlists", () => ({
  getPlaylistsForUsername: vi.fn(() => 
    Promise.resolve({ playlists: [] })
  ),
  DEFAULT_NUM_PLAYLISTS_OVERVIEW: 5,
}));

// Mock playlist service
vi.mock("$lib/components/playlist/playlist-service", () => ({
  processPlaylists: vi.fn((playlists) => Promise.resolve(playlists)),
}));

// Mock content components
vi.mock("$lib/components/content/content.svelte", () => ({
  default: vi.fn(() => ({
    render: () => ({ html: "<div>Mocked Content Component</div>" }),
    $$: {},
  })),
}));

vi.mock("$lib/components/playlist/playlist-tiles.svelte", () => ({
  default: vi.fn(() => ({
    render: () => ({ html: "<div>Mocked Playlist Tiles</div>" }),
    $$: {},
  })),
}));

vi.mock("$lib/components/video/twitch-embed.svelte", () => ({
  default: vi.fn(() => ({
    render: () => ({ html: "<div>Mocked Twitch Embed</div>" }),
    $$: {},
  })),
}));

describe("Source Page Component", () => {
  setupTest();

  const mockData = {
    videos: [
      {
        id: "video1",
        title: "Test Video 1",
        description: "Test Description",
        publishedAt: "2023-01-01",
        source: "giantbomb",
      },
      {
        id: "video2", 
        title: "Test Video 2",
        description: "Test Description 2",
        publishedAt: "2023-01-02",
        source: "giantbomb",
      },
    ],
    playlists: [],
    highlightPlaylists: [
      {
        playlist: {
          short_id: "playlist1",
          name: "Test Playlist",
          description: "Test playlist description",
        },
        videos: [
          {
            id: "video3",
            title: "Playlist Video",
            description: "In playlist",
            publishedAt: "2023-01-03",
            source: "giantbomb",
          },
        ],
      },
    ],
    followedPlaylists: [],
    userProfile: {
      id: "test-user",
      username: "testuser",
      content_display: "TILES" as const,
    },
    session: {
      user: { id: "test-user" },
    },
    supabase: {} as any,
    source: "giantbomb" as const,
    contentFilter: {
      sort: { key: "publishedAt", order: "descending" as const },
      type: "latest" as const,
    },
  };

  it("renders the source page without errors", () => {
    const { container } = render(Page, { props: { data: mockData } });
    expect(container).toBeDefined();
  });

  it("displays the source display name", () => {
    render(Page, { props: { data: mockData } });
    expect(screen.getByText("Giant Bomb")).toBeDefined();
  });

  it("displays the Latest Videos section", () => {
    render(Page, { props: { data: mockData } });
    expect(screen.getByText("Latest Videos")).toBeDefined();
  });

  it("displays support button with correct link", () => {
    render(Page, { props: { data: mockData } });
    
    const supportButton = screen.getByText("Support Giant Bomb");
    expect(supportButton).toBeDefined();
    expect(supportButton.closest('a')).toHaveProperty('target', '_blank');
  });

  it("displays website link when websiteUrlDomain exists", () => {
    render(Page, { props: { data: mockData } });
    
    const websiteLink = screen.getByText("giantbomb.com");
    expect(websiteLink).toBeDefined();
    expect(websiteLink.closest('a')).toHaveProperty('target', '_blank');
  });

  it("displays highlight playlists", () => {
    render(Page, { props: { data: mockData } });
    
    expect(screen.getByText("Test Playlist")).toBeDefined();
  });

  it("displays Playlists section", () => {
    render(Page, { props: { data: mockData } });
    expect(screen.getByText("Playlists")).toBeDefined();
  });

  it("creates correct links for Latest Videos", () => {
    render(Page, { props: { data: mockData } });
    
    const latestVideosLink = screen.getByRole('link', { name: 'Latest Videos' });
    expect(latestVideosLink.getAttribute('href')).toBe('/giantbomb/latest');
  });

  it("creates correct links for Playlists", () => {
    render(Page, { props: { data: mockData } });
    
    const playlistsLink = screen.getByRole('link', { name: 'Playlists' });
    expect(playlistsLink.getAttribute('href')).toBe('/profile/giantbomb/playlists');
  });

  it("handles different sources correctly", () => {
    const jeffData = {
      ...mockData,
      source: "jeffgerstmann" as const,
    };

    render(Page, { props: { data: jeffData } });
    
    expect(screen.getByText("The Jeff Gerstmann Show")).toBeDefined();
    
    const latestVideosLink = screen.getByRole('link', { name: 'Latest Videos' });
    expect(latestVideosLink.getAttribute('href')).toBe('/jeffgerstmann/latest');
  });

  it("handles sources without website domain", () => {
    const jeffData = {
      ...mockData,
      source: "jeffgerstmann" as const,
    };

    render(Page, { props: { data: jeffData } });
    
    // Should not display website link for sources without websiteUrlDomain
    expect(screen.queryByText("jeffgerstmann.com")).toBeNull();
  });

  it("does not show live section when source is not streaming", () => {
    render(Page, { props: { data: mockData } });
    
    expect(screen.queryByText("Live")).toBeNull();
  });

  it("handles empty highlight playlists", () => {
    const dataWithoutHighlights = {
      ...mockData,
      highlightPlaylists: [],
    };

    render(Page, { props: { data: dataWithoutHighlights } });
    
    // Should still render the page without highlight playlist sections
    expect(screen.getByText("Giant Bomb")).toBeDefined();
    expect(screen.getByText("Latest Videos")).toBeDefined();
    expect(screen.getByText("Playlists")).toBeDefined();
  });

  it("component initializes without errors", () => {
    const { container } = render(Page, { props: { data: mockData } });
    expect(container).toBeDefined();
  });
});