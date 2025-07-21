import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import Page from "./+page.svelte";
import { setupTest } from "../../../tests/utils/test-setup";

describe("Auth Verify Page Component", () => {
  setupTest();

  let mockSupabase: any;
  let mockData: any;

  beforeEach(() => {
    // Create a fresh mock for each test
    mockSupabase = {
      auth: {
        resend: vi.fn()
      }
    };

    mockData = {
      email: "test@example.com",
      supabase: mockSupabase
    };
  });

  it("renders verification message with user email", () => {
    const { container } = render(Page, { data: mockData });

    expect(screen.getByText("Almost done")).toBeDefined();
    expect(screen.getByText(/An email has been sent to test@example.com/)).toBeDefined();
    expect(container.innerHTML).toContain("test@example.com");
  });

  it("shows resend code button", () => {
    render(Page, { data: mockData });

    expect(screen.getByText("Resend code")).toBeDefined();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeDefined();
  });

  it("displays help text about not receiving email", () => {
    render(Page, { data: mockData });

    expect(screen.getByText("Didn't receive an email?")).toBeDefined();
    expect(screen.getByText("Use the button below to send a new verification email.")).toBeDefined();
  });

  it("shows loading state when resending email", async () => {
    // Mock the resend function to be slow
    mockSupabase.auth.resend.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ error: null }), 100))
    );

    render(Page, { data: mockData });

    const resendButton = screen.getByRole("button", { name: "Resend code" });
    
    // Click the resend button
    await fireEvent.click(resendButton);
    
    // Wait for the loading state and then success message
    await vi.waitFor(() => {
      expect(screen.getByText("Email sent -- check your inbox.")).toBeDefined();
    }, { timeout: 200 });
  });

  it("shows success message when email resend succeeds", async () => {
    // Mock successful resend
    mockSupabase.auth.resend.mockResolvedValue({ error: null });

    render(Page, { data: mockData });

    const resendButton = screen.getByRole("button", { name: "Resend code" });
    
    // Click the resend button
    await fireEvent.click(resendButton);
    
    // Wait for the async operation to complete
    await vi.waitFor(() => {
      expect(screen.getByText("Email sent -- check your inbox.")).toBeDefined();
    });
    
    expect(mockSupabase.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "test@example.com"
    });
  });

  it("shows error message when email resend fails", async () => {
    // Mock failed resend
    mockSupabase.auth.resend.mockResolvedValue({ 
      error: { message: "Rate limit exceeded" } 
    });

    render(Page, { data: mockData });

    const resendButton = screen.getByRole("button", { name: "Resend code" });
    
    // Click the resend button
    await fireEvent.click(resendButton);
    
    // Wait for the async operation to complete
    await vi.waitFor(() => {
      expect(screen.getByText("Rate limit exceeded")).toBeDefined();
    });
  });

  it("component initializes without errors", () => {
    const { container } = render(Page, { data: mockData });
    expect(container).toBeDefined();
  });
});