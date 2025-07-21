import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockLoadEvent } from "../../tests/mocks/sveltekit";
import { mockSession } from "../../tests/mocks/auth";
import { mockUserProfile } from "../../tests/mocks/user-profiles";
import { setupTest } from "../../tests/utils/test-setup";

// Hoist the mocks to the top level to avoid scope issues
const { mockGetUserProfile, mockSuperValidate } = vi.hoisted(() => ({
  mockGetUserProfile: vi.fn(),
  mockSuperValidate: vi.fn(),
}));

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
}));

const { mockZod } = vi.hoisted(() => ({
  mockZod: vi.fn(),
}));

// Mock the dependencies at the top level
vi.mock("$lib/supabase/user-profiles", () => ({
  getUserProfile: mockGetUserProfile,
}));

vi.mock("sveltekit-superforms", () => ({
  superValidate: mockSuperValidate,
}));

vi.mock("sveltekit-superforms/adapters", () => ({
  zod: mockZod,
}));

vi.mock("sveltekit-flash-message/server", () => ({
  redirect: mockRedirect,
}));

vi.mock("../auth/schema", () => ({
  emailSchema: {},
  passwordSchema: {},
  usernameSchema: {},
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+page.server");

describe("account/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    // Reset to default successful implementation
    mockGetUserProfile.mockResolvedValue({
      profile: mockUserProfile,
    });

    mockSuperValidate.mockResolvedValue({
      valid: true,
      data: {},
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

  it("loads account data successfully with authenticated user", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      routeId: "/account",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.profile).toEqual(mockUserProfile);
    expect(result.emailForm).toBeDefined();
    expect(result.usernameForm).toBeDefined();
    expect(result.passwordForm).toBeDefined();

    expect(mockGetUserProfile).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: mockSession.user.id,
    });
  });

  it("redirects to login when user is not authenticated", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: null,
      routeId: "/account",
    });

    // Override session in locals to be null for this test
    mockEvent.locals.session = null;

    try {
      await load(mockEvent);
      expect.fail("Expected redirect to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(303);
      expect((error as Response).headers.get("Location")).toBe("/auth/login");
    }

    expect(mockRedirect).toHaveBeenCalledWith(303, "/auth/login");
  });

  it("handles user profile loading errors gracefully", async () => {
    const { load } = await loadModule();

    mockGetUserProfile.mockRejectedValue(new Error("Profile load error"));

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      routeId: "/account",
    });

    await expect(load(mockEvent)).rejects.toThrow("Profile load error");
  });

  it("handles form validation errors gracefully", async () => {
    const { load } = await loadModule();

    mockSuperValidate.mockRejectedValue(new Error("Form validation error"));

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      routeId: "/account",
    });

    await expect(load(mockEvent)).rejects.toThrow("Form validation error");
  });
});
