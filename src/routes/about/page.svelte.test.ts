import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "./+page.svelte";
import { setupTest } from "../../tests/utils/test-setup";

describe("About Page Component", () => {
  setupTest();

  it("renders the about page with expected content", () => {
    const { container } = render(Page);

    expect(screen.getByText("This is a test about page!")).toBeDefined();
    expect(container.innerHTML).toContain("This is a test about page!");
  });

  it("component initializes without errors", () => {
    const { container } = render(Page);
    expect(container).toBeDefined();
  });
});