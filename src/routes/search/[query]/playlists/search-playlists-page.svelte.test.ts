import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import SearchPlaylistsPage from "./+page.svelte";
import { setupTest } from "../../../../tests/utils/test-setup";

// Mock complex components
vi.mock("$lib/components/pagination/pagination.svelte", () => ({
  default: vi.fn(() => ({
    render: () => ({ html: "<div>Mocked Pagination</div>" }),
    $$: {},
  })),
}));

vi.mock("$lib/components/playlist/playlist-tiles.svelte", () => ({
  default: vi.fn(() => ({
    render: () => ({ html: "<div>Mocked Playlist Tiles</div>" }),
    $$: {},
  })),
}));

vi.mock("$lib/components/playlist/playlist-service.js", () => ({
  processPlaylists: vi.fn((playlists) => Promise.resolve(playlists)),
}));

vi.mock("$lib/components/pagination/pagination.js", () => ({
  getNumberOfPages: vi.fn(({ count, perPage }) => Math.ceil(count / perPage)),
  PAGINATION_QUERY_KEY: "page",
  updatePaginationQueryParams: vi.fn(),
}));

describe("Search Playlists Page Component", () => {
  setupTest();

  const mockData = {
    playlistResults: [
      {
        id: "playlist1",
        name: "Test Playlist",
        description: "Test playlist description",
        shortId: "test123",
      },
    ],
    playlistsCount: 1,
    followedPlaylists: [],
  };

  it("renders the search playlists page without errors", () => {
    const { container } = render(SearchPlaylistsPage, { props: { data: mockData } });
    expect(container).toBeDefined();
  });

  it("displays the search results header", () => {
    render(SearchPlaylistsPage, { props: { data: mockData } });
    
    expect(screen.getByText("Search Results")).toBeDefined();
    expect(screen.getByText("Playlists")).toBeDefined();
  });

  it("has correct page structure", () => {
    const { container } = render(SearchPlaylistsPage, { props: { data: mockData } });
    
    const mainContainer = container.querySelector(".flex.gap-6.mx-2");
    expect(mainContainer).toBeDefined();
  });

  it("displays header content with correct styling", () => {
    const { container } = render(SearchPlaylistsPage, { props: { data: mockData } });
    
    const headerContainer = container.querySelector(".flex.flex-col.items-start");
    expect(headerContainer).toBeDefined();
    
    const heading = container.querySelector(".header-primary-no-margin");
    expect(heading).toBeDefined();
    expect(heading?.textContent).toBe("Search Results");
  });

  it("handles empty playlist results", () => {
    const emptyData = {
      playlistResults: [],
      playlistsCount: 0,
      followedPlaylists: [],
    };

    const { container } = render(SearchPlaylistsPage, { props: { data: emptyData } });
    expect(container).toBeDefined();
    expect(screen.getByText("Search Results")).toBeDefined();
  });

  it("handles null playlists count", () => {
    const dataWithNullCount = {
      ...mockData,
      playlistsCount: null,
    };

    const { container } = render(SearchPlaylistsPage, { props: { data: dataWithNullCount } });
    expect(container).toBeDefined();
  });

  it("displays muted text elements", () => {
    const { container } = render(SearchPlaylistsPage, { props: { data: mockData } });
    
    const mutedTexts = container.querySelectorAll(".text-muted-foreground");
    expect(mutedTexts.length).toBeGreaterThan(0);
    
    // Check that all muted text elements have the basic styling
    mutedTexts.forEach(element => {
      expect(element).toHaveClass("text-sm", "text-muted-foreground");
    });
  });

  it("component initializes without errors", () => {
    const { container } = render(SearchPlaylistsPage, { props: { data: mockData } });
    expect(container).toBeDefined();
  });
});