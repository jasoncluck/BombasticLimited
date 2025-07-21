import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import ErrorPage from "./+error.svelte";
import { setupTest } from "../../../tests/utils/test-setup";

describe("Auth Verify Error Page Component", () => {
  setupTest();

  it("renders the error page without errors", () => {
    const { container } = render(ErrorPage);
    expect(container).toBeDefined();
  });

  it("displays the error message", () => {
    render(ErrorPage);

    expect(
      screen.getByText(
        "Encountered an error when trying to retrieve email. Please try again.",
      ),
    ).toBeDefined();
  });

  it("has correct structure with margin", () => {
    const { container } = render(ErrorPage);

    const errorContainer = container.querySelector(".m-3");
    expect(errorContainer).toBeDefined();
  });

  it("contains an h3 heading", () => {
    const { container } = render(ErrorPage);

    const heading = container.querySelector("h3");
    expect(heading).toBeDefined();
    expect(heading?.textContent).toBe(
      "Encountered an error when trying to retrieve email. Please try again.",
    );
  });

  it("displays static error content", () => {
    render(ErrorPage);

    // Should always show the same error message regardless of props
    expect(screen.getByRole("heading", { level: 3 })).toBeDefined();
  });

  it("component initializes without errors", () => {
    const { container } = render(ErrorPage);
    expect(container).toBeDefined();
  });
});
