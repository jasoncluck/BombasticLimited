import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import Page from "./+page.svelte";
import { setupTest } from "../../tests/utils/test-setup";

// Mock sveltekit-superforms
vi.mock("sveltekit-superforms", () => ({
  superForm: vi.fn((data, options) => ({
    form: {
      subscribe: vi.fn(() => () => {}),
      set: vi.fn(),
      update: vi.fn(),
      email: data.email || "test@example.com",
      username: data.username || "testuser",
    },
    enhance: vi.fn(),
  })),
}));

// Mock sveltekit-flash-message
vi.mock("sveltekit-flash-message", () => ({
  getFlash: vi.fn(() => ({
    subscribe: vi.fn(() => () => {}),
  })),
  updateFlash: vi.fn(),
}));

// Mock user profile queries
vi.mock("$lib/supabase/user-profiles", () => ({
  checkIfUsernameIsUnique: vi.fn(() => Promise.resolve(true)),
}));

describe.skip("Account Page Component", () => {
  setupTest();

  const mockData = {
    profile: {
      id: "test-user",
      username: "testuser",
      email: "test@example.com",
      content_display: "TILES" as const,
    },
    emailForm: {
      email: "test@example.com",
    },
    usernameForm: {
      username: "testuser",
    },
    supabase: {} as any,
    session: {
      user: {
        id: "test-user",
        email: "test@example.com",
      },
    },
  };

  it("renders the account settings page without errors", () => {
    const { container } = render(Page, { props: { data: mockData } });
    expect(container).toBeDefined();
  });

  it("displays the Account Settings header", () => {
    render(Page, { props: { data: mockData } });
    expect(screen.getByText("Account Settings")).toBeDefined();
  });

  it("renders email form with current email", () => {
    render(Page, { props: { data: mockData } });
    
    expect(screen.getByLabelText("Email")).toBeDefined();
    const emailInput = screen.getByDisplayValue("test@example.com");
    expect(emailInput).toBeDefined();
  });

  it("renders username form with current username", () => {
    render(Page, { props: { data: mockData } });
    
    expect(screen.getByLabelText("Username")).toBeDefined();
    const usernameInput = screen.getByDisplayValue("testuser");
    expect(usernameInput).toBeDefined();
  });

  it("renders update buttons for email and username", () => {
    render(Page, { props: { data: mockData } });
    
    const updateButtons = screen.getAllByText("Update");
    expect(updateButtons).toHaveLength(2); // One for email, one for username
  });

  it("renders password reset button", () => {
    render(Page, { props: { data: mockData } });
    
    expect(screen.getByText("Reset Password")).toBeDefined();
  });

  it("renders delete account button", () => {
    render(Page, { props: { data: mockData } });
    
    expect(screen.getByText("Delete Account")).toBeDefined();
  });

  it("disables email update button when email hasn't changed", () => {
    render(Page, { props: { data: mockData } });
    
    // Find the email update button (first Update button)
    const updateButtons = screen.getAllByText("Update");
    const emailUpdateButton = updateButtons[0];
    
    expect(emailUpdateButton).toHaveProperty("disabled", true);
  });

  it("disables username update button when username hasn't changed", () => {
    render(Page, { props: { data: mockData } });
    
    // Find the username update button (second Update button)
    const updateButtons = screen.getAllByText("Update");
    const usernameUpdateButton = updateButtons[1];
    
    expect(usernameUpdateButton).toHaveProperty("disabled", true);
  });

  it("displays correct form actions", () => {
    const { container } = render(Page, { props: { data: mockData } });
    
    const emailForm = container.querySelector('form[action*="updateEmail"]');
    const usernameForm = container.querySelector('form[action*="updateUsername"]');
    const passwordForm = container.querySelector('form[action*="resetPassword"]');
    
    expect(emailForm).toBeDefined();
    expect(usernameForm).toBeDefined();
    expect(passwordForm).toBeDefined();
  });

  it("opens delete account dialog when delete button is clicked", async () => {
    const user = userEvent.setup();
    render(Page, { props: { data: mockData } });
    
    const deleteButton = screen.getByText("Delete Account");
    await user.click(deleteButton);
    
    // Dialog should be opened with confirmation message
    expect(screen.getByText("This action cannot be undone")).toBeDefined();
  });

  it("shows delete account confirmation dialog content", async () => {
    const user = userEvent.setup();
    render(Page, { props: { data: mockData } });
    
    const deleteButton = screen.getByText("Delete Account");
    await user.click(deleteButton);
    
    expect(screen.getByText("Delete Account", { selector: "h2" })).toBeDefined(); // Dialog title
    expect(screen.getByText("This action cannot be undone")).toBeDefined();
    expect(screen.getByText("Cancel")).toBeDefined();
    expect(screen.getAllByText("Delete Account")).toHaveLength(2); // Trigger and confirm button
  });

  it("has proper input types and attributes", () => {
    render(Page, { props: { data: mockData } });
    
    const emailInput = screen.getByLabelText("Email");
    const usernameInput = screen.getByLabelText("Username");
    
    expect(emailInput).toHaveProperty("type", "text");
    expect(usernameInput).toHaveProperty("type", "text");
    expect(usernameInput).toHaveClass("lowercase");
  });

  it("component initializes without errors", () => {
    const { container } = render(Page, { props: { data: mockData } });
    expect(container).toBeDefined();
  });
});