import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "./+page.svelte";
import { SOURCES, SOURCE_INFO } from "$lib/constants/source";
import { mockPageData, createMockPageData } from "../tests/mocks/page-data";
import { mockVideoWithTimestamp } from "../tests/mocks/videos";
import { setupTest } from "../tests/utils/test-setup";
import { pageState } from "../test-setup";

// Import mocked modules
const { page } = await import("$app/state");
const { invalidate } = await import("$app/navigation");
const { isBrowser } = await import("@supabase/ssr");

describe("Page Component", () => {
  setupTest();

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
    const dataWithContinueVideos = createMockPageData({
      continueWatchingVideos: [mockVideoWithTimestamp],
    });

    render(Page, { data: dataWithContinueVideos });

    expect(screen.getByText("Continue Watching")).toBeDefined();
  });

  it("does not render continue watching section when user is not logged in", () => {
    const dataWithoutSession = createMockPageData({
      session: null,
      continueWatchingVideos: [mockVideoWithTimestamp],
    });

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
    const dataWithoutUserSources = createMockPageData({
      userProfile: {
        ...mockPageData.userProfile!,
        sources: null,
      },
    });

    render(Page, { data: dataWithoutUserSources });

    // Should render all default sources
    SOURCES.forEach((source) => {
      expect(screen.getByText(SOURCE_INFO[source].displayName)).toBeDefined();
    });
  });

  it("invalidates data when oauth code is present in URL", () => {
    vi.mocked(isBrowser).mockReturnValue(true);

    // Set up page URL with oauth code
    pageState.url = new URL("http://localhost:3000?code=oauth_code");

    render(Page, { data: mockPageData });

    expect(invalidate).toHaveBeenCalledWith("supabase:db:playlists");
    expect(invalidate).toHaveBeenCalledWith("supabase:db:videos");
  });

  it("does not invalidate when no oauth code is present", () => {
    vi.mocked(isBrowser).mockReturnValue(true);

    // Set up page URL without oauth code
    pageState.url = new URL("http://localhost:3000");

    render(Page, { data: mockPageData });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("component initializes without errors", () => {
    const { container } = render(Page, { data: mockPageData });

    // Verify the component is created successfully
    expect(container).toBeDefined();
    expect(screen.getByText("Latest Videos")).toBeDefined();
  });
});
