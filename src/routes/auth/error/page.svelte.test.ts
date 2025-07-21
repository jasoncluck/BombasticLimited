import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "./+page.svelte";
import { setupTest } from "../../../tests/utils/test-setup";
import { pageState } from "../../../test-setup";

describe("Auth Error Page Component", () => {
  setupTest();

  it("renders error page with error from URL parameter", () => {
    // Set up page URL with error parameter
    pageState.url = new URL("http://localhost:3000/auth/error?error=invalid_request");

    const { container } = render(Page);

    expect(screen.getByText("Unable to login")).toBeDefined();
    expect(screen.getByText("invalid_request")).toBeDefined();
    expect(container.innerHTML).toContain("Unable to login");
    expect(container.innerHTML).toContain("invalid_request");
  });

  it("renders error page with error_description parameter", () => {
    // Set up page URL with error_description parameter
    pageState.url = new URL("http://localhost:3000/auth/error?error_description=The+request+is+missing+a+required+parameter");

    const { container } = render(Page);

    expect(screen.getByText("Unable to login")).toBeDefined();
    expect(screen.getByText("The request is missing a required parameter")).toBeDefined();
    expect(container.innerHTML).toContain("The request is missing a required parameter");
  });

  it("renders error page with no error parameter", () => {
    // Set up page URL without error parameters
    pageState.url = new URL("http://localhost:3000/auth/error");

    const { container } = render(Page);

    expect(screen.getByText("Unable to login")).toBeDefined();
    // Should not render any error text when there's no error parameter
    expect(container.innerHTML).toContain("Unable to login");
  });

  it("prioritizes error parameter over error_description when both present", () => {
    // Set up page URL with both parameters
    pageState.url = new URL("http://localhost:3000/auth/error?error=access_denied&error_description=User+cancelled");

    const { container } = render(Page);

    expect(screen.getByText("Unable to login")).toBeDefined();
    expect(screen.getByText("access_denied")).toBeDefined();
    expect(container.innerHTML).toContain("access_denied");
    expect(container.innerHTML).not.toContain("User cancelled");
  });

  it("component initializes without errors", () => {
    pageState.url = new URL("http://localhost:3000/auth/error");
    const { container } = render(Page);
    expect(container).toBeDefined();
  });
});