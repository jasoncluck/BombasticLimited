import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockLoadEvent } from "../../../tests/mocks/sveltekit";
import { mockSession } from "../../../tests/mocks/auth";
import { setupTest } from "../../../tests/utils/test-setup";

// Mock the module - just a basic test since this is a simple verify page
vi.mock("sveltekit-superforms", () => ({
  superValidate: vi.fn().mockResolvedValue({
    valid: true,
    data: {},
    errors: {},
  }),
}));

vi.mock("sveltekit-superforms/adapters", () => ({
  zod: vi.fn(),
}));

vi.mock("../schema", () => ({
  confirmPasswordSchema: {},
}));

const loadModule = () => import("./+page.server");

describe("auth/verify/+page.server.ts load function", () => {
  setupTest();

  it("loads verify form successfully", async () => {
    const { load } = await loadModule();

    const mockEvent = createMockLoadEvent({
      session: mockSession,
      routeId: "/auth/verify",
    });

    const result = await load(mockEvent);

    expect(result).toBeDefined();
    expect(result.confirmPasswordForm).toBeDefined();
  });
});