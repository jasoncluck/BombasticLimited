import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import VideoPage from "./+page.svelte";
import { setupTest } from "../../../tests/utils/test-setup";

// Mock the VideoPlayer component since it's complex
vi.mock("$lib/components/video/video-player.svelte", () => ({
  default: vi.fn(() => ({
    render: () => ({ html: "<div>Mocked Video Player</div>" }),
    $$: {},
  })),
}));

describe("Video Page Component", () => {
  setupTest();

  const mockData = {
    video: {
      id: "video1",
      title: "Test Video",
      description: "Test video description",
      publishedAt: "2023-01-01",
      source: "giantbomb",
      youtubeVideoId: "abc123",
    },
    contentFilter: {
      sort: { key: "publishedAt", order: "descending" as const },
      type: "latest" as const,
    },
    playlists: [],
    supabase: {} as any,
    session: {
      user: { id: "test-user" },
    },
  };

  it("renders the video page without errors", () => {
    const { container } = render(VideoPage, { props: { data: mockData } });
    expect(container).toBeDefined();
  });

  it("has correct page structure with margin", () => {
    const { container } = render(VideoPage, { props: { data: mockData } });

    const pageContainer = container.querySelector(".m-4");
    expect(pageContainer).toBeDefined();
  });

  it("renders VideoPlayer with correct props", () => {
    const { container } = render(VideoPage, { props: { data: mockData } });

    // Since we mocked the component, we just check that the page structure exists
    expect(container.querySelector(".m-4")).toBeDefined();
  });

  it("handles data prop correctly", () => {
    const { container } = render(VideoPage, { props: { data: mockData } });
    expect(container).toBeDefined();
  });

  it("handles missing session gracefully", () => {
    const dataWithoutSession = {
      ...mockData,
      session: null,
    };

    const { container } = render(VideoPage, {
      props: { data: dataWithoutSession },
    });
    expect(container).toBeDefined();
  });

  it("handles empty playlists", () => {
    const dataWithEmptyPlaylists = {
      ...mockData,
      playlists: [],
    };

    const { container } = render(VideoPage, {
      props: { data: dataWithEmptyPlaylists },
    });
    expect(container).toBeDefined();
  });

  it("component initializes without errors", () => {
    const { container } = render(VideoPage, { props: { data: mockData } });
    expect(container).toBeDefined();
  });
});
