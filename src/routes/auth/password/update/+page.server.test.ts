import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockLoadEvent } from "../../../tests/mocks/sveltekit";
import { mockSession } from "../../../tests/mocks/auth";
import { setupTest } from "../../../tests/utils/test-setup";

// Hoist the mocks to the top level
const { mockSuperValidate } = vi.hoisted(() => ({
  mockSuperValidate: vi.fn(),
}));

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
}));

// Mock the dependencies
vi.mock("sveltekit-superforms", () => ({
  superValidate: mockSuperValidate,
}));

vi.mock("sveltekit-flash-message/server", () => ({
  redirect: mockRedirect,
}));

vi.mock("sveltekit-superforms/adapters", () => ({
  zod: vi.fn(),
}));

vi.mock("../schema", () => ({
  passwordSchema: {},
}));

const loadModule = () => import("./+page.server");

describe("auth/password/update/+page.server.ts load function", () => {
  setupTest();

  beforeEach(() => {
    mockSuperValidate.mockResolvedValue({
      valid: true,
      data: {},
      errors: {},
    });

    mockRedirect.mockImplementation((status: number, location: string) => {
      throw new Response(null, {
        status,
        headers: { Location: location },
      });
    });
  });

  it("loads successfully with authenticated user", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      routeId: "/auth/password/update",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.passwordForm).toBeDefined();
  });

  it("redirects when user is not authenticated", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: null,
      routeId: "/auth/password/update",
    });

    mockEvent.locals.session = null;

    try {
      await load(mockEvent);
      expect.fail("Expected redirect to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
    }
  });
});