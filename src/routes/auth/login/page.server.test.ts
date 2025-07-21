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

const { mockLoginSchema } = vi.hoisted(() => ({
  mockLoginSchema: { email: "", password: "" },
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
  loginSchema: mockLoginSchema,
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+page.server");

describe("auth/login/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    // Reset to default successful implementation
    mockSuperValidate.mockResolvedValue({
      valid: true,
      data: { email: "", password: "" },
      errors: {},
    });

    mockZod.mockReturnValue(mockLoginSchema);

    mockRedirect.mockImplementation((status: number, location: string) => {
      // SvelteKit's redirect throws a Response object
      throw new Response(null, {
        status,
        headers: { Location: location },
      });
    });
  });

  it("loads login form successfully when user is not authenticated", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: null,
      routeId: "/auth/login",
    });

    // Override session in locals to be null for this test
    mockEvent.locals.session = null;

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.loginForm).toBeDefined();
    expect(result.loginForm.valid).toBe(true);

    expect(mockZod).toHaveBeenCalledWith(mockLoginSchema);
    expect(mockSuperValidate).toHaveBeenCalledWith(mockLoginSchema);
  });

  it("redirects to home when user is already authenticated", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      routeId: "/auth/login",
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

  it("handles superValidate with different form states", async () => {
    const { load } = await loadModule();

    const customForm = {
      valid: false,
      data: { email: "test@example.com", password: "" },
      errors: { password: ["Required"] },
    };

    mockSuperValidate.mockResolvedValue(customForm);

    const mockEvent = createMockLoadEvent({
      session: null,
      routeId: "/auth/login",
    });

    mockEvent.locals.session = null;

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.loginForm).toEqual(customForm);
  });

  it("handles form validation errors gracefully", async () => {
    const { load } = await loadModule();

    mockSuperValidate.mockRejectedValue(new Error("Schema validation failed"));

    const mockEvent = createMockLoadEvent({
      session: null,
      routeId: "/auth/login",
    });

    mockEvent.locals.session = null;

    await expect(load(mockEvent)).rejects.toThrow("Schema validation failed");
  });

  it("works correctly with different session states", async () => {
    const { load } = await loadModule();

    // Test with explicit null session
    const nullSessionEvent = createMockLoadEvent({
      session: null,
      routeId: "/auth/login",
    });
    nullSessionEvent.locals.session = null;

    const nullResult = await load(nullSessionEvent);
    expect(nullResult.loginForm).toBeDefined();

    // Test with undefined session (similar to null)
    const undefinedSessionEvent = createMockLoadEvent({
      session: null,
      routeId: "/auth/login",
    });
    undefinedSessionEvent.locals.session = undefined as any;

    const undefinedResult = await load(undefinedSessionEvent);
    expect(undefinedResult.loginForm).toBeDefined();
  });
});
