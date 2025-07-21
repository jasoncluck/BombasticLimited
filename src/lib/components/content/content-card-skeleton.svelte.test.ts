import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import ContentCardSkeleton from "./content-card-skeleton.svelte";
import { setupTest } from "../../../tests/utils/test-setup";

describe("Content Card Skeleton Component", () => {
  setupTest();

  it("renders the skeleton component without errors", () => {
    const { container } = render(ContentCardSkeleton);
    expect(container).toBeDefined();
  });

  it("has correct main container structure", () => {
    const { container } = render(ContentCardSkeleton);

    const mainContainer = container.querySelector(".group");
    expect(mainContainer).toBeDefined();
    expect(mainContainer).toHaveClass(
      "group",
      "transform",
      "will-change-transform",
      "cursor-pointer",
      "mb-6",
      "w-full",
    );
  });

  it("contains clickable button element", () => {
    const { container } = render(ContentCardSkeleton);

    const button = container.querySelector("[role='button']");
    expect(button).toBeDefined();
    expect(button).toHaveProperty("tabIndex", 0);
    expect(button).toHaveClass("text-left", "cursor-pointer");
  });

  it("renders image skeleton with correct aspect ratio", () => {
    const { container } = render(ContentCardSkeleton);

    const imageSkeleton = container.querySelector(".aspect-\\[16\\/9\\]");
    expect(imageSkeleton).toBeDefined();
    expect(imageSkeleton).toHaveClass("w-full", "aspect-[16/9]", "h-auto");
  });

  it("renders dropdown button skeleton", () => {
    const { container } = render(ContentCardSkeleton);

    const dropdownSkeleton = container.querySelector(
      ".absolute.top-0\\.5.right-0\\.5 .h-6.w-6",
    );
    expect(dropdownSkeleton).toBeDefined();
    expect(dropdownSkeleton).toHaveClass("h-6", "w-6", "rounded");
  });

  it("renders title skeleton elements", () => {
    const { container } = render(ContentCardSkeleton);

    const titleContainer = container.querySelector(".p-2");
    expect(titleContainer).toBeDefined();

    const titleSkeletons = titleContainer?.querySelectorAll(".h-4");
    expect(titleSkeletons).toHaveLength(2);

    // First title line (3/4 width)
    expect(titleSkeletons?.[0]).toHaveClass("h-4", "w-3/4", "mb-1");

    // Second title line (1/2 width)
    expect(titleSkeletons?.[1]).toHaveClass("h-4", "w-1/2");
  });

  it("renders playlist info skeleton section", () => {
    const { container } = render(ContentCardSkeleton);

    const playlistSection = container.querySelector(
      ".flex.items-center.gap-2.mt-1.mb-3.px-2",
    );
    expect(playlistSection).toBeDefined();

    // Playlist icon skeleton
    const playlistIcon = playlistSection?.querySelector(".h-4.w-4.shrink-0");
    expect(playlistIcon).toBeDefined();

    // Playlist text skeletons
    const playlistTexts = playlistSection?.querySelectorAll(".h-3");
    expect(playlistTexts).toHaveLength(2);
    expect(playlistTexts?.[0]).toHaveClass("h-3", "w-2/3");
    expect(playlistTexts?.[1]).toHaveClass("h-3", "w-1/3");
  });

  it("renders date skeleton", () => {
    const { container } = render(ContentCardSkeleton);

    const dateContainers = container.querySelectorAll(".px-2");
    const lastDateContainer = dateContainers[dateContainers.length - 1]; // Get the last .px-2 which should be the date container
    const dateSkeleton = lastDateContainer?.querySelector(".h-3.w-24");
    expect(dateSkeleton).toBeDefined();
    expect(dateSkeleton).toHaveClass("h-3", "w-24");
  });

  it("has proper layout structure with relative positioning", () => {
    const { container } = render(ContentCardSkeleton);

    const relativeContainer = container.querySelector(".relative");
    expect(relativeContainer).toBeDefined();

    const absoluteContainer = container.querySelector(".absolute");
    expect(absoluteContainer).toBeDefined();
    expect(absoluteContainer).toHaveClass("absolute", "top-0.5", "right-0.5");
  });

  it("component initializes without errors", () => {
    const { container } = render(ContentCardSkeleton);
    expect(container).toBeDefined();
  });
});
