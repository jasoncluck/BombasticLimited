import { describe, it, expect, vi, beforeEach } from "vitest";
import { handle } from "./hooks.server";
import type { RequestEvent } from "@sveltejs/kit";

// Mock the environment variables
vi.mock("$env/static/public", () => ({
  PUBLIC_SUPABASE_URL: "https://test.supabase.co",
  PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
}));

// Mock @supabase/ssr
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      exchangeCodeForSession: vi.fn(),
    },
  })),
}));

// Mock SvelteKit dependencies
vi.mock("@sveltejs/kit", () => ({
  redirect: vi.fn((status, location) => {
    throw new Error(`Redirect ${status} to ${location}`);
  }),
}));

vi.mock("@sveltejs/kit/hooks", () => ({
  sequence: vi.fn((...handlers) => {
    return async (event) => {
      let result = Promise.resolve();
      for (const handler of handlers) {
        result = await handler(event);
      }
      return result;
    };
  }),
}));

describe("hooks.server.ts", () => {
  let mockEvent: Partial<RequestEvent>;
  let mockResolve: ReturnType<typeof vi.fn>;
  let mockSupabaseClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSupabaseClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
        }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "test" } },
          error: null,
        }),
      },
    };

    mockEvent = {
      locals: {} as any,
      cookies: {
        getAll: vi.fn(() => []),
        set: vi.fn(),
      },
      url: new URL("https://example.com"),
    };

    mockResolve = vi.fn().mockResolvedValue(new Response("OK"));

    // Mock createServerClient to return our mock client
    const { createServerClient } = await import("@supabase/ssr");
    vi.mocked(createServerClient).mockReturnValue(mockSupabaseClient);
  });

  describe("supabase handle", () => {
    it("creates supabase client with correct configuration", async () => {
      const { createServerClient } = await import("@supabase/ssr");

      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      expect(createServerClient).toHaveBeenCalledWith(
        "https://test.supabase.co",
        "test-anon-key",
        expect.objectContaining({
          auth: {
            detectSessionInUrl: true,
            flowType: "pkce",
          },
          cookies: expect.objectContaining({
            getAll: expect.any(Function),
            setAll: expect.any(Function),
          }),
        })
      );
    });

    it("sets up safeGetSession function on locals", async () => {
      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      expect(mockEvent.locals).toHaveProperty("supabase");
      expect(mockEvent.locals).toHaveProperty("safeGetSession");
      expect(typeof mockEvent.locals!.safeGetSession).toBe("function");
    });

    it("handles password reset code exchange", async () => {
      mockEvent.url = new URL("https://example.com/auth/password/update?code=test-code");

      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      expect(mockSupabaseClient.auth.exchangeCodeForSession).toHaveBeenCalledWith("test-code");
    });

    it("handles password reset code exchange error", async () => {
      mockEvent.url = new URL("https://example.com/auth/password/update?code=test-code");
      mockSupabaseClient.auth.exchangeCodeForSession.mockRejectedValue(new Error("Exchange failed"));

      // Should not throw - error is caught and logged
      await expect(
        handle({
          event: mockEvent as RequestEvent,
          resolve: mockResolve,
        })
      ).resolves.toBeDefined();
    });

    it("does not exchange code when not on password update page", async () => {
      mockEvent.url = new URL("https://example.com/other/page?code=test-code");

      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      expect(mockSupabaseClient.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it("does not exchange code when no code parameter", async () => {
      mockEvent.url = new URL("https://example.com/auth/password/update");

      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      expect(mockSupabaseClient.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it("filters response headers correctly", async () => {
      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      expect(mockResolve).toHaveBeenCalledWith(
        mockEvent,
        expect.objectContaining({
          filterSerializedResponseHeaders: expect.any(Function),
        })
      );

      const { filterSerializedResponseHeaders } = mockResolve.mock.calls[0][1];
      
      expect(filterSerializedResponseHeaders("content-range")).toBe(true);
      expect(filterSerializedResponseHeaders("x-supabase-api-version")).toBe(true);
      expect(filterSerializedResponseHeaders("other-header")).toBe(false);
    });
  });

  describe("safeGetSession", () => {
    it("returns null session when no session exists", async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
      });

      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      const result = await mockEvent.locals!.safeGetSession();

      expect(result).toEqual({
        session: null,
        user: null,
      });
    });

    it("returns session and user when valid session exists", async () => {
      const mockSession = { access_token: "test-token", user: { id: "user-id" } };
      const mockUser = { id: "user-id", email: "test@example.com" };

      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
      });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      const result = await mockEvent.locals!.safeGetSession();

      expect(result).toEqual({
        session: mockSession,
        user: mockUser,
      });
    });

    it("returns null when JWT validation fails", async () => {
      const mockSession = { access_token: "invalid-token" };

      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
      });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "JWT validation failed" },
      });

      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      const result = await mockEvent.locals!.safeGetSession();

      expect(result).toEqual({
        session: null,
        user: null,
      });
    });
  });

  describe("authGuard handle", () => {
    it("sets session and user on locals", async () => {
      const mockSession = { access_token: "test-token" };
      const mockUser = { id: "user-id", email: "test@example.com" };

      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
      });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      expect(mockEvent.locals!.session).toEqual(mockSession);
      expect(mockEvent.locals!.user).toEqual(mockUser);
    });

    it("redirects to login when accessing account without session", async () => {
      mockEvent.url = new URL("https://example.com/account/profile");
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
      });

      const { redirect } = await import("@sveltejs/kit");

      await expect(
        handle({
          event: mockEvent as RequestEvent,
          resolve: mockResolve,
        })
      ).rejects.toThrow("Redirect 303 to /auth/login");

      expect(redirect).toHaveBeenCalledWith(303, "/auth/login");
    });

    it("allows access to account when session exists", async () => {
      mockEvent.url = new URL("https://example.com/account/profile");
      const mockSession = { access_token: "test-token" };
      const mockUser = { id: "user-id" };

      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
      });
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      expect(mockResolve).toHaveBeenCalled();
    });

    it("allows access to non-account pages without session", async () => {
      mockEvent.url = new URL("https://example.com/public/page");
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
      });

      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      expect(mockResolve).toHaveBeenCalled();
    });
  });

  describe("cookie management", () => {
    it("calls getAll on cookies for client creation", async () => {
      // Reset mock to ensure it's properly tracked
      vi.clearAllMocks();
      
      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      // The createServerClient is called with a config that has getAll function
      const { createServerClient } = await import("@supabase/ssr");
      expect(createServerClient).toHaveBeenCalled();
      
      // Verify the config has the expected structure and call getAll to improve function coverage
      const callArgs = vi.mocked(createServerClient).mock.calls[0];
      expect(callArgs[2]).toHaveProperty("cookies");
      expect(callArgs[2].cookies).toHaveProperty("getAll");
      expect(typeof callArgs[2].cookies.getAll).toBe("function");
      
      // Call the getAll function to boost function coverage
      const getAllFn = callArgs[2].cookies.getAll;
      const result = getAllFn();
      expect(result).toEqual([]);
    });

    it("sets cookies with correct path", async () => {
      await handle({
        event: mockEvent as RequestEvent,
        resolve: mockResolve,
      });

      const { createServerClient } = await import("@supabase/ssr");
      const mockConfig = vi.mocked(createServerClient).mock.calls[0][2];

      // Test the setAll function
      const setAllFn = mockConfig.cookies.setAll;
      const cookiesToSet = [
        { name: "test-cookie", value: "test-value", options: {} },
      ];

      setAllFn(cookiesToSet);

      expect(mockEvent.cookies!.set).toHaveBeenCalledWith(
        "test-cookie",
        "test-value",
        { path: "/" }
      );
    });
  });
});