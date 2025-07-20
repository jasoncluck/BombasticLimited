import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockLoadEvent } from "../../../tests/mocks/sveltekit";
import { mockSession } from "../../../tests/mocks/auth";
import { setupTest } from "../../../tests/utils/test-setup";

// Hoist the mocks to the top level to avoid scope issues
const { mockSuperValidate } = vi.hoisted(() => ({
  mockSuperValidate: vi.fn(),
}));

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
}));

const { mockZod } = vi.hoisted(() => ({
  mockZod: vi.fn(),
}));

// Mock the dependencies at the top level
vi.mock("sveltekit-superforms", () => ({
  superValidate: mockSuperValidate,
}));

vi.mock("sveltekit-superforms/adapters", () => ({
  zod: mockZod,
}));

vi.mock("sveltekit-flash-message/server", () => ({
  redirect: mockRedirect,
}));

vi.mock("../schema", () => ({
  signupSchema: {},
}));

vi.mock("$lib/supabase/user-profiles", () => ({
  checkIfUsernameIsUnique: vi.fn(),
}));

vi.mock("bad-words", () => ({
  Filter: vi.fn(),
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+page.server");

describe("auth/signup/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    mockSuperValidate.mockResolvedValue({
      valid: true,
      data: { email: "", username: "", password: "" },
      errors: {},
    });

    mockZod.mockReturnValue({});

    mockRedirect.mockImplementation((status: number, location: string) => {
      throw new Response(null, {
        status,
        headers: { Location: location },
      });
    });
  });

  it("loads signup form successfully when user is not authenticated", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: null,
      routeId: "/auth/signup",
    });

    mockEvent.locals.session = null;

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.signupForm).toBeDefined();
    expect(result.signupForm.valid).toBe(true);
  });

  it("redirects to home when user is already authenticated", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      routeId: "/auth/signup",
    });

    try {
      await load(mockEvent);
      expect.fail("Expected redirect to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(303);
      expect((error as Response).headers.get("Location")).toBe("/");
    }

    expect(mockRedirect).toHaveBeenCalledWith(303, "/");
  });

  it("handles form validation errors gracefully", async () => {
    const { load } = await loadModule();

    mockSuperValidate.mockRejectedValue(new Error("Schema validation failed"));

    const mockEvent = createMockLoadEvent({
      session: null,
      routeId: "/auth/signup",
    });

    mockEvent.locals.session = null;

    await expect(load(mockEvent)).rejects.toThrow("Schema validation failed");
  });
});