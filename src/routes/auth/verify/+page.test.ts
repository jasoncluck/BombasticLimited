import { describe, it, expect, vi } from "vitest";
import { setupTest } from "../../../tests/utils/test-setup";

// Mock the dependencies at the top level
vi.mock("@sveltejs/kit", () => ({
  error: vi.fn(),
}));

// Import the module under test AFTER mocks are set up
const loadModule = () => import("./+page");

describe("auth/verify/+page.ts load function", () => {
  setupTest();

  it("returns email when email parameter is present in URL", async () => {
    const { load } = await loadModule();

    const url = new URL("http://localhost:3000?email=test@example.com");
    const mockEvent = { url };

    const result = load(mockEvent);

    expect(result).toEqual({
      email: "test@example.com",
    });
  });

  it("throws error when email parameter is missing", async () => {
    const { load } = await loadModule();
    const { error } = await import("@sveltejs/kit");

    const url = new URL("http://localhost:3000");
    const mockEvent = { url };

    load(mockEvent);

    expect(error).toHaveBeenCalledWith(400, "Invalid email.");
  });

  it("returns email when multiple parameters are present", async () => {
    const { load } = await loadModule();

    const url = new URL("http://localhost:3000?email=user@test.com&other=value");
    const mockEvent = { url };

    const result = load(mockEvent);

    expect(result).toEqual({
      email: "user@test.com",
    });
  });

  it("handles encoded email addresses correctly", async () => {
    const { load } = await loadModule();

    const url = new URL("http://localhost:3000?email=user%2Btest%40example.com");
    const mockEvent = { url };

    const result = load(mockEvent);

    expect(result).toEqual({
      email: "user+test@example.com",
    });
  });
});