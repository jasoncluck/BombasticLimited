import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "./+page.svelte";
import { setupTest } from "../../../../tests/utils/test-setup";
import { pageState } from "../../../../test-setup";

describe("Auth Email Confirm Page Component", () => {
  setupTest();

  it("renders success message when message parameter is present", () => {
    // Set up page URL with success message
    pageState.url = new URL("http://localhost:3000/auth/email/confirm?message=Email+confirmed+successfully");

    const { container } = render(Page);

    expect(screen.getByText("Success")).toBeDefined();
    expect(screen.getByText("Email confirmed successfully")).toBeDefined();
    expect(container.innerHTML).toContain("Success");
    expect(container.innerHTML).toContain("Email confirmed successfully");
  });

  it("renders email updated message when code parameter is present", () => {
    // Set up page URL with code parameter
    pageState.url = new URL("http://localhost:3000/auth/email/confirm?code=some_confirmation_code");

    const { container } = render(Page);

    expect(screen.getByText("Email Updated")).toBeDefined();
    expect(screen.getByText("The email address for your account has been updated successfully.")).toBeDefined();
    expect(container.innerHTML).toContain("Email Updated");
  });

  it("renders error message when error parameter is present", () => {
    // Set up page URL with error parameters
    pageState.url = new URL("http://localhost:3000/auth/email/confirm?error=invalid_token&error_description=The+confirmation+token+is+invalid");

    const { container } = render(Page);

    expect(screen.getByText("Error")).toBeDefined();
    expect(screen.getByText("The confirmation token is invalid")).toBeDefined();
    expect(container.innerHTML).toContain("Error");
    expect(container.innerHTML).toContain("The confirmation token is invalid");
  });

  it("renders nothing when no relevant parameters are present", () => {
    // Set up page URL without any relevant parameters
    pageState.url = new URL("http://localhost:3000/auth/email/confirm");

    const { container } = render(Page);

    // Should not render any alert components
    expect(screen.queryByText("Success")).toBeNull();
    expect(screen.queryByText("Email Updated")).toBeNull();
    expect(screen.queryByText("Error")).toBeNull();
    expect(container.innerHTML).not.toContain("Success");
    expect(container.innerHTML).not.toContain("Email Updated");
    expect(container.innerHTML).not.toContain("Error");
  });

  it("prioritizes success message over other parameters", () => {
    // Set up page URL with multiple parameters
    pageState.url = new URL("http://localhost:3000/auth/email/confirm?message=Success&code=some_code&error=some_error");

    const { container } = render(Page);

    expect(screen.getAllByText("Success")).toHaveLength(2); // Title and Description
    expect(screen.queryByText("Email Updated")).toBeNull();
    expect(screen.queryByText("Error")).toBeNull();
  });

  it("prioritizes code over error when both present", () => {
    // Set up page URL with code and error parameters
    pageState.url = new URL("http://localhost:3000/auth/email/confirm?code=some_code&error=some_error&error_description=Some+error");

    const { container } = render(Page);

    expect(screen.getByText("Email Updated")).toBeDefined();
    expect(screen.queryByText("Error")).toBeNull();
  });

  it("component initializes without errors", () => {
    pageState.url = new URL("http://localhost:3000/auth/email/confirm");
    const { container } = render(Page);
    expect(container).toBeDefined();
  });
});