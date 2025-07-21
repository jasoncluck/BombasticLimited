import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "./+page.svelte";
import { setupTest } from "../tests/utils/test-setup";

describe("Home Page Component", () => {
  setupTest();

  const mockData = {
    sourceVideos: {
      giantbomb: [],
      jeffgerstmann: [],
      nextlander: [],
      remap: [],
    },
    contentFilter: {
      sort: { key: "publishedAt", order: "descending" as const },
      type: "latest" as const,
    },
    continueWatchingVideos: [],
    playlists: [],
    userProfile: {
      id: "test-user",
      username: "testuser",
      sources: ["giantbomb", "jeffgerstmann"],
      content_display: "TILES" as const,
    },
    session: {
      user: { id: "test-user" },
    },
    supabase: {} as any,
  };

  it("renders the home page without errors", () => {
    const { container } = render(Page, { props: { data: mockData } });
    expect(container).toBeDefined();
  });

  it("displays the Latest Videos header", () => {
    render(Page, { props: { data: mockData } });
    expect(screen.getByText("Latest Videos")).toBeDefined();
  });

  it("renders continue watching section when user has session and continue videos", () => {
    const dataWithContinueVideos = {
      ...mockData,
      continueWatchingVideos: [
        {
          id: "video1",
          title: "Test Video",
          description: "Test Description",
          publishedAt: "2023-01-01",
          source: "giantbomb",
        },
      ],
    };

    render(Page, { props: { data: dataWithContinueVideos } });
    expect(screen.getByText("Continue Watching")).toBeDefined();
  });

  it("does not render continue watching section when no continue videos", () => {
    render(Page, { props: { data: mockData } });
    expect(screen.queryByText("Continue Watching")).toBeNull();
  });

  it("renders source sections for user's sources", () => {
    render(Page, { props: { data: mockData } });
    
    // Should render sections for the user's sources
    expect(screen.getByText("Giant Bomb")).toBeDefined();
    expect(screen.getByText("The Jeff Gerstmann Show")).toBeDefined();
    
    // Should not render sections for sources not in user profile
    expect(screen.queryByText("Nextlander")).toBeNull();
    expect(screen.queryByText("Remap")).toBeNull();
  });

  it("renders all sources when userProfile.sources is null", () => {
    const dataWithNullSources = {
      ...mockData,
      userProfile: {
        ...mockData.userProfile,
        sources: null,
      },
    };

    render(Page, { props: { data: dataWithNullSources } });
    
    // Should render all default sources
    expect(screen.getByText("Giant Bomb")).toBeDefined();
    expect(screen.getByText("The Jeff Gerstmann Show")).toBeDefined();
    expect(screen.getByText("Nextlander")).toBeDefined();
    expect(screen.getByText("Remap")).toBeDefined();
  });

  it("handles missing userProfile gracefully", () => {
    const dataWithoutProfile = {
      ...mockData,
      userProfile: null,
    };

    render(Page, { props: { data: dataWithoutProfile } });
    
    // Should render all default sources when no profile
    expect(screen.getByText("Giant Bomb")).toBeDefined();
    expect(screen.getByText("The Jeff Gerstmann Show")).toBeDefined();
    expect(screen.getByText("Nextlander")).toBeDefined();
    expect(screen.getByText("Remap")).toBeDefined();
  });

  it("creates proper links to source pages", () => {
    render(Page, { props: { data: mockData } });
    
    const giantBombLink = screen.getByRole('link', { name: 'Giant Bomb' });
    const jeffLink = screen.getByRole('link', { name: 'The Jeff Gerstmann Show' });
    
    expect(giantBombLink.getAttribute('href')).toBe('/giantbomb/latest');
    expect(jeffLink.getAttribute('href')).toBe('/jeffgerstmann/latest');
  });

  it("creates continue watching link when continue videos exist", () => {
    const dataWithContinueVideos = {
      ...mockData,
      continueWatchingVideos: [
        {
          id: "video1",
          title: "Test Video",
          description: "Test Description",
          publishedAt: "2023-01-01",
          source: "giantbomb",
        },
      ],
    };

    render(Page, { props: { data: dataWithContinueVideos } });
    
    const continueLink = screen.getByRole('link', { name: 'Continue Watching' });
    expect(continueLink.getAttribute('href')).toBe('/continue');
  });
});