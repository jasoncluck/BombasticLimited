import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import DiscordIcon from "./DiscordIcon.svelte";
import { setupTest } from "../../../tests/utils/test-setup";

describe("Discord Icon Component", () => {
  setupTest();

  it("renders the Discord icon without errors", () => {
    const { container } = render(DiscordIcon);
    expect(container).toBeDefined();
  });

  it("renders SVG element with correct default properties", () => {
    const { container } = render(DiscordIcon);

    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });

  it("applies custom size when provided", () => {
    const { container } = render(DiscordIcon, { props: { size: 32 } });

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("applies custom class when provided", () => {
    const { container } = render(DiscordIcon, {
      props: { class: "text-blue-500" },
    });

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("text-blue-500");
  });

  it("combines custom class with size prop", () => {
    const { container } = render(DiscordIcon, {
      props: {
        class: "text-discord-blue custom-class",
        size: 24,
      },
    });

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("text-discord-blue", "custom-class");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
  });

  it("has correct SVG attributes", () => {
    const { container } = render(DiscordIcon);

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 -28.5 256 256");
    expect(svg?.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid");
  });

  it("contains the Discord logo path", () => {
    const { container } = render(DiscordIcon);

    const path = container.querySelector("path");
    expect(path).toBeDefined();
    expect(path?.getAttribute("fill")).toBe("currentColor");
    expect(path?.getAttribute("fill-rule")).toBe("nonzero");
  });

  it("handles zero size gracefully", () => {
    const { container } = render(DiscordIcon, { props: { size: 0 } });

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("0");
    expect(svg?.getAttribute("height")).toBe("0");
  });

  it("handles large size values", () => {
    const { container } = render(DiscordIcon, { props: { size: 100 } });

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("100");
    expect(svg?.getAttribute("height")).toBe("100");
  });

  it("component initializes without errors", () => {
    const { container } = render(DiscordIcon);
    expect(container).toBeDefined();
  });
});
