import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import VideoEmbed from "./video-embed.svelte";
import { setupTest } from "../../../tests/utils/test-setup";

describe("Video Embed Component", () => {
  setupTest();

  it("renders the video embed without errors", () => {
    const { container } = render(VideoEmbed, { props: { divId: "test-video" } });
    expect(container).toBeDefined();
  });

  it("creates div with correct id", () => {
    const { container } = render(VideoEmbed, { props: { divId: "youtube-player" } });
    
    const videoDiv = container.querySelector("#youtube-player");
    expect(videoDiv).toBeDefined();
  });

  it("applies correct CSS classes", () => {
    const { container } = render(VideoEmbed, { props: { divId: "test-embed" } });
    
    const videoDiv = container.querySelector("#test-embed");
    expect(videoDiv).toHaveClass(
      "absolute",
      "top-0", 
      "left-0",
      "w-full",
      "h-full"
    );
  });

  it("sets correct test id attribute", () => {
    const { container } = render(VideoEmbed, { props: { divId: "custom-player" } });
    
    const videoDiv = container.querySelector("#custom-player");
    expect(videoDiv).toHaveAttribute("data-testid", "custom-player-test");
  });

  it("handles different divId values", () => {
    const testIds = ["video-1", "twitch-embed", "youtube-123"];
    
    testIds.forEach(id => {
      const { container } = render(VideoEmbed, { props: { divId: id } });
      
      const videoDiv = container.querySelector(`#${id}`);
      expect(videoDiv).toBeDefined();
      expect(videoDiv).toHaveAttribute("data-testid", `${id}-test`);
    });
  });

  it("maintains proper structure with absolute positioning", () => {
    const { container } = render(VideoEmbed, { props: { divId: "player" } });
    
    const videoDiv = container.querySelector("#player");
    expect(videoDiv).toHaveClass("absolute");
    expect(videoDiv).toHaveClass("top-0");
    expect(videoDiv).toHaveClass("left-0");
  });

  it("has full width and height classes", () => {
    const { container } = render(VideoEmbed, { props: { divId: "fullsize" } });
    
    const videoDiv = container.querySelector("#fullsize");
    expect(videoDiv).toHaveClass("w-full");
    expect(videoDiv).toHaveClass("h-full");
  });

  it("component initializes without errors", () => {
    const { container } = render(VideoEmbed, { props: { divId: "init-test" } });
    expect(container).toBeDefined();
  });
});