import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockLoadEvent } from "../../../tests/mocks/sveltekit";
import { mockSession } from "../../../tests/mocks/auth";
import { setupTest } from "../../../tests/utils/test-setup";

// Mock redirect function
const mockRedirect = vi.fn();
vi.mock("@sveltejs/kit", () => ({
  redirect: mockRedirect,
}));

const loadModule = () => import("./+page.server");

describe("auth/verify/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it("redirects when user is already authenticated", async () => {
    // Make redirect throw an error for this test only
    mockRedirect.mockImplementation(() => {
      throw new Error("Redirect");
    });

    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      routeId: "/auth/verify",
    });

    await expect(async () => {
      await load(mockEvent);
    }).rejects.toThrow("Redirect");

    expect(mockRedirect).toHaveBeenCalledWith(303, "/");
  });

  it("loads successfully when user is not authenticated", async () => {
    // Clear previous calls
    mockRedirect.mockClear();
    
    // Import fresh module for this test
    vi.resetModules();
    const { load } = await import("./+page.server");

    const mockEvent = createMockLoadEvent({
      session: null,
      routeId: "/auth/verify",
    });

    // Explicitly set session to null in locals as well
    mockEvent.locals.session = null;

    const result = await load(mockEvent);

    expect(result).toBeUndefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});